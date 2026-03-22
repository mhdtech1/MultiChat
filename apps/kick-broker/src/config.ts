type KickExchangeRequest = {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
};

type KickRefreshRequest = {
  refreshToken: string;
  clientId: string;
};

export type BrokerConfig = {
  port: number;
  host: string;
  kickClientId: string;
  kickClientSecret: string;
  allowedRedirectPrefixes: string[];
};

const MAX_PORT = 65535;
const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "127.0.0.1";
const HOSTED_DEFAULT_HOST = "0.0.0.0";
const DEFAULT_REDIRECT_PREFIXES = [
  "http://localhost:51730/",
  "http://127.0.0.1:51730/",
];

const normalizeNonEmptyString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const parsePort = (value: string | undefined): number => {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PORT) {
    throw new Error("KICK_BROKER_PORT must be a valid TCP port.");
  }
  return parsed;
};

const resolveDefaultHost = (env: NodeJS.ProcessEnv): string => {
  if (normalizeNonEmptyString(env.KICK_BROKER_HOST)) {
    return normalizeNonEmptyString(env.KICK_BROKER_HOST);
  }
  if (normalizeNonEmptyString(env.PORT) || env.RENDER === "true") {
    return HOSTED_DEFAULT_HOST;
  }
  return DEFAULT_HOST;
};

const parseAllowedRedirectPrefixes = (value: string | undefined): string[] => {
  const raw = normalizeNonEmptyString(value);
  const candidates = raw
    ? raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : DEFAULT_REDIRECT_PREFIXES;

  return candidates.map((entry) => {
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error(
        `KICK_BROKER_ALLOWED_REDIRECT_PREFIXES contains an invalid URL: ${entry}`,
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `KICK_BROKER_ALLOWED_REDIRECT_PREFIXES must use http or https: ${entry}`,
      );
    }
    return parsed.toString();
  });
};

export const loadBrokerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): BrokerConfig => {
  const kickClientId = normalizeNonEmptyString(env.KICK_CLIENT_ID);
  const kickClientSecret = normalizeNonEmptyString(env.KICK_CLIENT_SECRET);
  if (!kickClientId) {
    throw new Error("KICK_CLIENT_ID is required for the Kick broker.");
  }
  if (!kickClientSecret) {
    throw new Error("KICK_CLIENT_SECRET is required for the Kick broker.");
  }

  return {
    port: parsePort(env.PORT ?? env.KICK_BROKER_PORT),
    host: resolveDefaultHost(env),
    kickClientId,
    kickClientSecret,
    allowedRedirectPrefixes: parseAllowedRedirectPrefixes(
      env.KICK_BROKER_ALLOWED_REDIRECT_PREFIXES,
    ),
  };
};

export const isAllowedRedirectUri = (
  redirectUri: string,
  allowedRedirectPrefixes: string[],
): boolean => {
  const normalized = normalizeNonEmptyString(redirectUri);
  if (!normalized) return false;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  const href = parsed.toString();
  return allowedRedirectPrefixes.some((prefix) => href.startsWith(prefix));
};

export const parseKickExchangeRequest = (
  body: unknown,
): KickExchangeRequest => {
  const source =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = normalizeNonEmptyString(source.code);
  const clientId = normalizeNonEmptyString(source.clientId);
  const redirectUri = normalizeNonEmptyString(source.redirectUri);
  const codeVerifier = normalizeNonEmptyString(source.codeVerifier);

  if (!code) throw new Error("Kick exchange request is missing code.");
  if (!clientId) throw new Error("Kick exchange request is missing clientId.");
  if (!redirectUri) {
    throw new Error("Kick exchange request is missing redirectUri.");
  }
  if (!codeVerifier) {
    throw new Error("Kick exchange request is missing codeVerifier.");
  }

  return {
    code,
    clientId,
    redirectUri,
    codeVerifier,
  };
};

export const parseKickRefreshRequest = (body: unknown): KickRefreshRequest => {
  const source =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const refreshToken = normalizeNonEmptyString(source.refreshToken);
  const clientId = normalizeNonEmptyString(source.clientId);

  if (!refreshToken) {
    throw new Error("Kick refresh request is missing refreshToken.");
  }
  if (!clientId) throw new Error("Kick refresh request is missing clientId.");

  return {
    refreshToken,
    clientId,
  };
};
