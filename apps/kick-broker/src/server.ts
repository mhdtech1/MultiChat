import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  isAllowedRedirectUri,
  loadBrokerConfig,
  parseKickExchangeRequest,
  parseKickRefreshRequest,
} from "./config.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
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

const config = loadBrokerConfig();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${config.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "kick-broker",
      });
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const body = await readJsonBody(request);

    if (url.pathname === "/kick/exchange") {
      const payload = parseKickExchangeRequest(body);

      if (payload.clientId !== config.kickClientId) {
        sendJson(response, 400, { error: "invalid_client_id" });
        return;
      }
      if (
        !isAllowedRedirectUri(
          payload.redirectUri,
          config.allowedRedirectPrefixes,
        )
      ) {
        sendJson(response, 400, { error: "invalid_redirect_uri" });
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
      sendJson(response, kickResponse.status, kickPayload);
      return;
    }

    if (url.pathname === "/kick/refresh") {
      const payload = parseKickRefreshRequest(body);

      if (payload.clientId !== config.kickClientId) {
        sendJson(response, 400, { error: "invalid_client_id" });
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
      sendJson(response, kickResponse.status, kickPayload);
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 400, { error: message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    `[kick-broker] listening on http://${config.host}:${config.port}`,
  );
});
