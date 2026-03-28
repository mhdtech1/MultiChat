import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BrokerConfig,
  isAllowedRedirectUri,
  loadBrokerConfig,
  parseKickExchangeRequest,
  parseKickRefreshRequest,
} from "./config.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

const SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeNonEmptyString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const resolveRequestOrigin = (request: IncomingMessage): string => {
  return normalizeNonEmptyString(request.headers.origin);
};

const resolveRequestIp = (request: IncomingMessage): string => {
  const forwarded = normalizeNonEmptyString(request.headers["x-forwarded-for"]);
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return normalizeNonEmptyString(request.socket.remoteAddress) || "unknown";
};

const resolveRequestProto = (request: IncomingMessage): string => {
  const forwardedProto = normalizeNonEmptyString(
    request.headers["x-forwarded-proto"],
  );
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() || "http";
  }
  return "http";
};

const buildResponseHeaders = (
  request: IncomingMessage,
  config: BrokerConfig,
  extraHeaders: Record<string, string> = {},
): Record<string, string> => {
  const headers: Record<string, string> = {
    ...JSON_HEADERS,
    ...SECURITY_HEADERS,
    ...extraHeaders,
  };

  const origin = resolveRequestOrigin(request);
  if (origin && config.allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    headers.Vary = "Origin";
  }

  if (resolveRequestProto(request) === "https") {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains";
  }

  return headers;
};

const sendJson = (
  request: IncomingMessage,
  response: ServerResponse,
  config: BrokerConfig,
  statusCode: number,
  payload: unknown,
): void => {
  response.writeHead(statusCode, buildResponseHeaders(request, config));
  response.end(JSON.stringify(payload));
};

const sendEmpty = (
  request: IncomingMessage,
  response: ServerResponse,
  config: BrokerConfig,
  statusCode: number,
): void => {
  response.writeHead(
    statusCode,
    buildResponseHeaders(request, config, {
      "Content-Length": "0",
    }),
  );
  response.end();
};

const enforceAllowedOrigin = (
  request: IncomingMessage,
  config: BrokerConfig,
): void => {
  const origin = resolveRequestOrigin(request);
  if (!origin) return;
  if (!config.allowedOrigins.includes(origin)) {
    throw new HttpError(403, "invalid_origin");
  }
};

const readJsonBody = async (
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> => {
  const contentLengthHeader = normalizeNonEmptyString(
    request.headers["content-length"],
  );
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new HttpError(400, "invalid_content_length");
    }
    if (contentLength > maxBodyBytes) {
      throw new HttpError(413, "request_body_too_large");
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new HttpError(413, "request_body_too_large");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
};

const forwardKickResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 500) };
  }
};

const enforceRateLimit = (
  request: IncomingMessage,
  config: BrokerConfig,
  buckets: Map<string, RateLimitBucket>,
): void => {
  const now = Date.now();
  const ip = resolveRequestIp(request);
  const existing = buckets.get(ip);

  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, {
      count: 1,
      resetAt: now + config.rateLimitWindowMs,
    });
    return;
  }

  if (existing.count >= config.rateLimitMaxRequests) {
    throw new HttpError(429, "rate_limit_exceeded");
  }

  existing.count += 1;
};

export const createKickBrokerServer = (
  config: BrokerConfig = loadBrokerConfig(),
) => {
  const rateLimitBuckets = new Map<string, RateLimitBucket>();

  return createServer(async (request, response) => {
    try {
      enforceAllowedOrigin(request, config);

      const url = new URL(request.url ?? "/", `http://${config.host}`);

      if (request.method === "OPTIONS") {
        sendEmpty(request, response, config, 204);
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(request, response, config, 200, {
          ok: true,
          service: "kick-broker",
        });
        return;
      }

      if (request.method !== "POST") {
        sendJson(request, response, config, 405, {
          error: "method_not_allowed",
        });
        return;
      }

      enforceRateLimit(request, config, rateLimitBuckets);
      const body = await readJsonBody(request, config.maxBodyBytes);

      if (url.pathname === "/kick/exchange") {
        const payload = parseKickExchangeRequest(body);

        if (payload.clientId !== config.kickClientId) {
          sendJson(request, response, config, 400, {
            error: "invalid_client_id",
          });
          return;
        }
        if (
          !isAllowedRedirectUri(
            payload.redirectUri,
            config.allowedRedirectPrefixes,
          )
        ) {
          sendJson(request, response, config, 400, {
            error: "invalid_redirect_uri",
          });
          return;
        }

        const tokenParams = new URLSearchParams({
          code: payload.code,
          client_id: config.kickClientId,
          client_secret: config.kickClientSecret,
          redirect_uri: payload.redirectUri,
          grant_type: "authorization_code",
          code_verifier: payload.codeVerifier,
        });
        const kickResponse = await fetch("https://id.kick.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: tokenParams,
        });
        const kickPayload = await forwardKickResponse(kickResponse);
        sendJson(request, response, config, kickResponse.status, kickPayload);
        return;
      }

      if (url.pathname === "/kick/refresh") {
        const payload = parseKickRefreshRequest(body);

        if (payload.clientId !== config.kickClientId) {
          sendJson(request, response, config, 400, {
            error: "invalid_client_id",
          });
          return;
        }

        const tokenParams = new URLSearchParams({
          client_id: config.kickClientId,
          client_secret: config.kickClientSecret,
          grant_type: "refresh_token",
          refresh_token: payload.refreshToken,
        });
        const kickResponse = await fetch("https://id.kick.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: tokenParams,
        });
        const kickPayload = await forwardKickResponse(kickResponse);
        sendJson(request, response, config, kickResponse.status, kickPayload);
        return;
      }

      sendJson(request, response, config, 404, { error: "not_found" });
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      const message = error instanceof Error ? error.message : String(error);
      sendJson(request, response, config, statusCode, { error: message });
    }
  });
};

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const config = loadBrokerConfig();
  const server = createKickBrokerServer(config);

  server.listen(config.port, config.host, () => {
    console.log(
      `[kick-broker] listening on http://${config.host}:${config.port}`,
    );
  });
}
