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
  youtubeScopes: string[];
  youtubeMissingOauthMessage: string;
  assertYouTubeAlphaEnabled: () => void;
  youtubeConfig: () => {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
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
    storeAuthTokens,
    parseKickUserName,
    twitchDefaultRedirectUri,
    twitchScopes,
    twitchScopeVersion,
    kickDefaultRedirectUri,
    kickScopes,
    kickScopeVersion,
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
      const clientId = (
        process.env.KICK_CLIENT_ID ?? store.get("kickClientId")
      )?.trim();
      const clientSecret = (
        process.env.KICK_CLIENT_SECRET ?? store.get("kickClientSecret")
      )?.trim();
      const redirectUri =
        (
          process.env.KICK_REDIRECT_URI ?? store.get("kickRedirectUri")
        )?.trim() || kickDefaultRedirectUri;

      if (!clientId || !clientSecret) {
        store.set({
          kickAccessToken: "",
          kickRefreshToken: "",
          kickUsername: "guest",
          kickGuest: true,
        });
        await clearAuthTokens("kick");
        return store.store;
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
      const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenParams,
      });
      let tokens: KickTokenResponse;
      try {
        tokens = await fetchJsonOrThrow<KickTokenResponse>(
          tokenResponse,
          "Kick token exchange",
        );
      } catch (error) {
        if (!clientSecret) {
          store.set({
            kickAccessToken: "",
            kickRefreshToken: "",
            kickUsername: "guest",
            kickGuest: true,
          });
          await clearAuthTokens("kick");
          return store.store;
        }
        throw error;
      }

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
    [IPC_CHANNELS.AUTH_YOUTUBE_SIGN_IN]: async () => {
      assertYouTubeAlphaEnabled();
      const { clientId, clientSecret, redirectUri } = youtubeConfig();
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
