import crypto from "node:crypto";
import { IPC_CHANNELS } from "../../shared/constants.js";
import type { AuthHealthSnapshot } from "../../shared/types.js";
import type { JsonSettingsStore } from "../services/settingsStore.js";
import type { IpcHandlerRegistry } from "./handlers.js";

type CreateAuthHealthHandlersOptions = {
  getAuthHealthSnapshot: () => Promise<AuthHealthSnapshot>;
};

type AuthTokenPlatform = "twitch" | "kick" | "youtube";

type CreateAuthSessionHandlersOptions = {
  store: JsonSettingsStore;
  twitchScopeVersion: number;
  kickScopeVersion: number;
  clearAuthTokens: (platform: AuthTokenPlatform) => Promise<void>;
  refreshKickAccessToken: () => Promise<unknown>;
  onYouTubeSignedOut: () => void;
};

type CreateAuthTikTokHandlersOptions = {
  signIn: () => Promise<unknown>;
  signOut: () => Promise<unknown>;
};

type CreateAuthSignInHandlersOptions = {
  store: JsonSettingsStore;
  randomToken: (bytes?: number) => string;
  openAuthInBrowser: (authUrl: string, redirectUri: string) => Promise<string>;
  fetchJsonOrThrow: <T>(response: Response, source: string) => Promise<T>;
  clearAuthTokens: (platform: AuthTokenPlatform) => Promise<void>;
  storeOAuthClientSecret: (
    platform: "kick" | "youtube",
    clientSecret: string,
  ) => Promise<void>;
  storeAuthTokens: (
    platform: AuthTokenPlatform,
    tokens: { accessToken: string; refreshToken?: string },
  ) => Promise<void>;
  parseKickUserName: (response: unknown) => string | undefined;
  twitchDefaultRedirectUri: string;
  twitchScopes: string[];
  twitchScopeVersion: number;
  kickDefaultRedirectUri: string;
  kickScopes: string[];
  kickScopeVersion: number;
  kickWriteAuthUnavailableMessage: string;
  getKickClientSecret: () => Promise<string>;
  getKickTokenExchangeUrl: () => string | null;
  youtubeScopes: string[];
  youtubeMissingOauthMessage: string;
  assertYouTubeAlphaEnabled: () => void;
  youtubeConfig: () => Promise<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }>;
  saveYouTubeTokens: (payload: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }) => Promise<void>;
  youtubeFetchWithAuth: (
    url: string | URL,
    init?: RequestInit,
  ) => Promise<Response>;
};

type TwitchValidateResponse = {
  login?: string;
};

type KickTokenResponse = {
  access_token?: string;
  refresh_token?: string;
};

type YouTubeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type YouTubeChannelsResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
    };
  }>;
};

type KickLocalAuthConfigPayload = {
  clientId?: unknown;
  clientSecret?: unknown;
  redirectUri?: unknown;
};

const describeHttpErrorPayload = (text: string): string => {
  const rawText = text.trim();
  if (!rawText) return "";

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const nested =
      parsed.error && typeof parsed.error === "object"
        ? (parsed.error as Record<string, unknown>)
        : null;
    const payloadError = parsed.error;
    const explicitError =
      typeof payloadError === "string"
        ? payloadError
        : Array.isArray(payloadError)
          ? (payloadError.find(
              (entry): entry is string =>
                typeof entry === "string" && entry.trim().length > 0,
            ) ?? "")
          : "";
    const errorsField = parsed.errors;
    const topLevelError =
      typeof errorsField === "string"
        ? errorsField
        : Array.isArray(errorsField)
          ? (errorsField.find(
              (entry): entry is string =>
                typeof entry === "string" && entry.trim().length > 0,
            ) ?? "")
          : "";

    return (
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (typeof nested?.message === "string" && nested.message.trim()) ||
      (typeof parsed.error_description === "string" &&
        parsed.error_description.trim()) ||
      explicitError.trim() ||
      topLevelError.trim() ||
      rawText.slice(0, 400)
    );
  } catch {
    return rawText.slice(0, 400);
  }
};

const normalizeKickRedirectUri = (
  value: unknown,
  fallback: string,
): string => {
  const raw = typeof value === "string" ? value.trim() : "";
  const resolved = raw || fallback;

  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    throw new Error(
      "Kick redirect URI must be a valid http:// or https:// URL.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Kick redirect URI must use http:// or https://.");
  }

  return parsed.toString();
};

const throwDetailedHttpError = async (
  response: Response,
  source: string,
  context: Record<string, string | boolean>,
): Promise<never> => {
  const bodyText = await response.text();
  const detail = describeHttpErrorPayload(bodyText);
  const contextText = Object.entries(context)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  const bodyTextTrimmed = bodyText.trim();
  const parts = [`${source} request failed (${response.status}).`];

  if (detail) {
    parts.push(detail);
  } else {
    parts.push("Response body was empty.");
  }

  if (bodyTextTrimmed && bodyTextTrimmed !== detail) {
    parts.push(`Response: ${bodyTextTrimmed.slice(0, 400)}`);
  }

  if (contextText) {
    parts.push(`Context: ${contextText}`);
  }

  throw new Error(parts.join(" "));
};

export function createAuthHealthHandlers(
  options: CreateAuthHealthHandlersOptions,
): IpcHandlerRegistry {
  const { getAuthHealthSnapshot } = options;

  return {
    [IPC_CHANNELS.AUTH_GET_HEALTH]: async () => getAuthHealthSnapshot(),
    [IPC_CHANNELS.AUTH_TEST_PERMISSIONS]: async () => getAuthHealthSnapshot(),
  };
}

export function createAuthSignInHandlers(
  options: CreateAuthSignInHandlersOptions,
): IpcHandlerRegistry {
  const {
    store,
    randomToken,
    openAuthInBrowser,
    fetchJsonOrThrow,
    clearAuthTokens,
    storeOAuthClientSecret,
    storeAuthTokens,
    parseKickUserName,
    twitchDefaultRedirectUri,
    twitchScopes,
    twitchScopeVersion,
    kickDefaultRedirectUri,
    kickScopes,
    kickScopeVersion,
    kickWriteAuthUnavailableMessage,
    getKickClientSecret,
    getKickTokenExchangeUrl,
    youtubeScopes,
    youtubeMissingOauthMessage,
    assertYouTubeAlphaEnabled,
    youtubeConfig,
    saveYouTubeTokens,
    youtubeFetchWithAuth,
  } = options;

  return {
    [IPC_CHANNELS.AUTH_TWITCH_SIGN_IN]: async () => {
      const clientId = store.get("twitchClientId")?.trim();
      const redirectUri =
        store.get("twitchRedirectUri")?.trim() || twitchDefaultRedirectUri;

      if (!clientId) {
        const guestName = `justinfan${Math.floor(Math.random() * 100000)}`;
        store.set({
          twitchToken: "",
          twitchUsername: guestName,
          twitchGuest: true,
        });
        await clearAuthTokens("twitch");
        return store.store;
      }

      const state = randomToken(24);
      const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "token");
      authUrl.searchParams.set("scope", twitchScopes.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("force_verify", "true");

      const callbackUrl = await openAuthInBrowser(
        authUrl.toString(),
        redirectUri,
      );
      const hash = callbackUrl.includes("#")
        ? callbackUrl.slice(callbackUrl.indexOf("#") + 1)
        : "";
      const params = new URLSearchParams(hash);

      const error = params.get("error");
      if (error) {
        const description =
          params.get("error_description") ?? "Twitch sign-in failed.";
        throw new Error(description);
      }

      if (params.get("state") !== state) {
        throw new Error("Twitch sign-in was rejected (state mismatch).");
      }

      const accessToken = params.get("access_token");
      if (!accessToken) {
        throw new Error("Twitch did not return an access token.");
      }

      const validateResponse = await fetch(
        "https://id.twitch.tv/oauth2/validate",
        {
          headers: {
            Authorization: `OAuth ${accessToken}`,
          },
        },
      );
      const validated = await fetchJsonOrThrow<TwitchValidateResponse>(
        validateResponse,
        "Twitch token validation",
      );

      if (!validated.login) {
        throw new Error("Twitch token validation did not include a username.");
      }

      store.set({
        twitchToken: accessToken,
        twitchUsername: validated.login,
        twitchGuest: false,
        twitchScopeVersion,
        twitchRedirectUri: redirectUri,
      });
      await storeAuthTokens("twitch", { accessToken });

      return store.store;
    },
    [IPC_CHANNELS.AUTH_KICK_SIGN_IN]: async () => {
      const clientId = store.get("kickClientId")?.trim();
      const clientSecret = await getKickClientSecret();
      const kickTokenExchangeUrl = getKickTokenExchangeUrl();
      const redirectUri =
        store.get("kickRedirectUri")?.trim() || kickDefaultRedirectUri;

      if (!clientId || (!clientSecret && !kickTokenExchangeUrl)) {
        throw new Error(kickWriteAuthUnavailableMessage);
      }
      const state = randomToken(24);
      const codeVerifier = randomToken(48);
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      const authUrl = new URL("https://id.kick.com/oauth/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", kickScopes.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const callbackUrl = await openAuthInBrowser(
        authUrl.toString(),
        redirectUri,
      );
      const callback = new URL(callbackUrl);
      const error = callback.searchParams.get("error");
      if (error) {
        const description =
          callback.searchParams.get("error_description") ??
          "Kick sign-in failed.";
        throw new Error(description);
      }

      if (callback.searchParams.get("state") !== state) {
        throw new Error("Kick sign-in was rejected (state mismatch).");
      }

      const code = callback.searchParams.get("code");
      if (!code) {
        throw new Error("Kick did not return an authorization code.");
      }

      let tokenResponse: Response;
      if (kickTokenExchangeUrl) {
        tokenResponse = await fetch(kickTokenExchangeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            code,
            clientId,
            redirectUri,
            codeVerifier,
          }),
        });
        if (!tokenResponse.ok) {
          await throwDetailedHttpError(
            tokenResponse,
            "Kick broker token exchange",
            {
              clientId,
              redirectUri,
              brokerUrl: kickTokenExchangeUrl,
            },
          );
        }
      } else {
        const tokenParams = new URLSearchParams({
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        });
        if (clientSecret) {
          tokenParams.set("client_secret", clientSecret);
        }
        tokenResponse = await fetch("https://id.kick.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: tokenParams,
        });
        if (!tokenResponse.ok) {
          await throwDetailedHttpError(tokenResponse, "Kick token exchange", {
            clientId,
            redirectUri,
            clientSecretPresent: Boolean(clientSecret),
          });
        }
      }
      const tokens = await fetchJsonOrThrow<KickTokenResponse>(
        tokenResponse,
        kickTokenExchangeUrl
          ? "Kick broker token exchange"
          : "Kick token exchange",
      );

      if (!tokens.access_token) {
        throw new Error("Kick token exchange did not return an access token.");
      }

      const userResponse = await fetch("https://api.kick.com/public/v1/users", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      });
      const userPayload = await fetchJsonOrThrow<unknown>(
        userResponse,
        "Kick user profile",
      );
      const username = parseKickUserName(userPayload);

      store.set({
        kickAccessToken: tokens.access_token,
        kickRefreshToken: tokens.refresh_token ?? "",
        kickUsername: username ?? "",
        kickGuest: false,
        kickScopeVersion,
        kickRedirectUri: redirectUri,
      });
      await storeAuthTokens("kick", {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
      });

      return store.store;
    },
    [IPC_CHANNELS.AUTH_KICK_CONFIGURE_LOCAL]: async (
      _event,
      payload: unknown,
    ) => {
      const request =
        payload && typeof payload === "object"
          ? (payload as KickLocalAuthConfigPayload)
          : {};
      const clientId =
        typeof request.clientId === "string" ? request.clientId.trim() : "";
      const clientSecret =
        typeof request.clientSecret === "string"
          ? request.clientSecret.trim()
          : "";
      const redirectUri = normalizeKickRedirectUri(
        request.redirectUri,
        kickDefaultRedirectUri,
      );

      if (!clientId) {
        throw new Error("Kick client ID is required.");
      }
      if (!clientSecret) {
        throw new Error("Kick client secret is required.");
      }

      store.set({
        kickClientId: clientId,
        kickRedirectUri: redirectUri,
        kickAccessToken: "",
        kickRefreshToken: "",
        kickUsername: "",
        kickGuest: false,
      });
      await storeOAuthClientSecret("kick", clientSecret);
      await clearAuthTokens("kick");

      return store.store;
    },
    [IPC_CHANNELS.AUTH_YOUTUBE_SIGN_IN]: async () => {
      assertYouTubeAlphaEnabled();
      const { clientId, clientSecret, redirectUri } = await youtubeConfig();
      if (!clientId) {
        throw new Error(youtubeMissingOauthMessage);
      }

      const state = randomToken(24);
      const codeVerifier = randomToken(48);
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", youtubeScopes.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("code_challenge", codeChallenge);

      const callbackUrl = await openAuthInBrowser(
        authUrl.toString(),
        redirectUri,
      );
      const callback = new URL(callbackUrl);

      const error = callback.searchParams.get("error");
      if (error) {
        const description =
          callback.searchParams.get("error_description") ??
          "YouTube sign-in failed.";
        throw new Error(description);
      }
      if (callback.searchParams.get("state") !== state) {
        throw new Error("YouTube sign-in was rejected (state mismatch).");
      }

      const code = callback.searchParams.get("code");
      if (!code) {
        throw new Error("YouTube did not return an authorization code.");
      }

      const tokenParams = new URLSearchParams({
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      });
      if (clientSecret) {
        tokenParams.set("client_secret", clientSecret);
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenParams,
      });
      const tokens = await fetchJsonOrThrow<YouTubeTokenResponse>(
        tokenResponse,
        "YouTube token exchange",
      );
      if (!tokens.access_token) {
        throw new Error(
          "YouTube token exchange did not return an access token.",
        );
      }

      await saveYouTubeTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });

      let username = store.get("youtubeUsername")?.trim() ?? "";
      try {
        const channelResponse = await youtubeFetchWithAuth(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1",
        );
        const channelPayload = await fetchJsonOrThrow<YouTubeChannelsResponse>(
          channelResponse,
          "YouTube profile",
        );
        const first = Array.isArray(channelPayload.items)
          ? channelPayload.items[0]
          : undefined;
        username = first?.snippet?.title?.trim() ?? username;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[youtube] profile lookup skipped after sign-in: ${detail}`,
        );
      }

      store.set({
        youtubeUsername: username,
        youtubeRedirectUri: redirectUri,
      });

      return store.store;
    },
  };
}

export function createAuthSessionHandlers(
  options: CreateAuthSessionHandlersOptions,
): IpcHandlerRegistry {
  const {
    store,
    twitchScopeVersion,
    kickScopeVersion,
    clearAuthTokens,
    refreshKickAccessToken,
    onYouTubeSignedOut,
  } = options;

  return {
    [IPC_CHANNELS.AUTH_TWITCH_SIGN_OUT]: async () => {
      store.set({
        twitchToken: "",
        twitchUsername: "",
        twitchGuest: false,
        twitchScopeVersion,
      });
      await clearAuthTokens("twitch");
      return store.store;
    },
    [IPC_CHANNELS.AUTH_KICK_SIGN_OUT]: async () => {
      store.set({
        kickAccessToken: "",
        kickRefreshToken: "",
        kickUsername: "",
        kickGuest: false,
        kickScopeVersion,
      });
      await clearAuthTokens("kick");
      return store.store;
    },
    [IPC_CHANNELS.AUTH_KICK_REFRESH]: async () => {
      await refreshKickAccessToken();
      return store.store;
    },
    [IPC_CHANNELS.AUTH_YOUTUBE_SIGN_OUT]: async () => {
      store.set({
        youtubeAccessToken: "",
        youtubeRefreshToken: "",
        youtubeTokenExpiry: 0,
        youtubeUsername: "",
        youtubeLiveChatId: "",
      });
      onYouTubeSignedOut();
      await clearAuthTokens("youtube");
      return store.store;
    },
  };
}

export function createAuthTikTokHandlers(
  options: CreateAuthTikTokHandlersOptions,
): IpcHandlerRegistry {
  const { signIn, signOut } = options;
  return {
    [IPC_CHANNELS.AUTH_TIKTOK_SIGN_IN]: async () => signIn(),
    [IPC_CHANNELS.AUTH_TIKTOK_SIGN_OUT]: async () => signOut(),
  };
}
