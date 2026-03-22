import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/constants";
import type { AppSettings } from "../../../src/shared/types";
import {
  createAuthSignInHandlers,
  createAuthTikTokHandlers,
} from "../../../src/main/ipc/authHandlers";

const KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE =
  "Kick sign-in is temporarily unavailable. You can still open Kick chats in read-only mode.";

const createMockSettingsStore = (initialState: AppSettings = {}) => {
  let state: AppSettings = { ...initialState };

  return {
    get store() {
      return { ...state };
    },
    get<K extends keyof AppSettings>(key: K): AppSettings[K] {
      return state[key];
    },
    set(updates: Partial<AppSettings>) {
      state = { ...state, ...updates };
    },
  };
};

const buildHandlers = (store: ReturnType<typeof createMockSettingsStore>) => {
  const clearAuthTokens = vi.fn().mockResolvedValue(undefined);
  const storeOAuthClientSecret = vi.fn().mockResolvedValue(undefined);
  const handlers = createAuthSignInHandlers({
    store: store as never,
    randomToken: vi.fn().mockReturnValue("token"),
    openAuthInBrowser: vi.fn(),
    fetchJsonOrThrow: vi.fn(),
    clearAuthTokens,
    storeOAuthClientSecret,
    storeAuthTokens: vi.fn().mockResolvedValue(undefined),
    parseKickUserName: vi.fn(),
    twitchDefaultRedirectUri: "http://localhost/twitch/callback",
    twitchScopes: ["chat:read"],
    twitchScopeVersion: 2,
    kickDefaultRedirectUri: "http://localhost/kick/callback",
    kickScopes: ["user:read"],
    kickScopeVersion: 3,
    kickWriteAuthUnavailableMessage: KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE,
    getKickClientSecret: vi.fn().mockResolvedValue(""),
    getKickTokenExchangeUrl: vi.fn().mockReturnValue(null),
    youtubeScopes: ["scope"],
    youtubeMissingOauthMessage: "youtube oauth missing",
    assertYouTubeAlphaEnabled: vi.fn(),
    youtubeConfig: vi.fn().mockResolvedValue({
      clientId: "",
      clientSecret: "",
      redirectUri: "http://localhost/youtube/callback",
    }),
    saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
    youtubeFetchWithAuth: vi.fn(),
  });
  return { handlers, clearAuthTokens, storeOAuthClientSecret };
};

describe("createAuthSignInHandlers", () => {
  it("falls back to twitch guest mode when no twitch client id is configured", async () => {
    const store = createMockSettingsStore({ twitchClientId: "" });
    const { handlers, clearAuthTokens } = buildHandlers(store);

    const result = await handlers[IPC_CHANNELS.AUTH_TWITCH_SIGN_IN](
      {} as never,
      undefined as never,
    );

    expect(clearAuthTokens).toHaveBeenCalledWith("twitch");
    expect(store.store.twitchGuest).toBe(true);
    expect(typeof store.store.twitchUsername).toBe("string");
    expect(result).toEqual(store.store);
  });

  it("throws for youtube sign-in when oauth client id is missing", async () => {
    const store = createMockSettingsStore();
    const { handlers } = buildHandlers(store);

    await expect(
      handlers[IPC_CHANNELS.AUTH_YOUTUBE_SIGN_IN](
        {} as never,
        undefined as never,
      ),
    ).rejects.toThrow("youtube oauth missing");
  });

  it("requires configured kick write auth before starting oauth", async () => {
    const store = createMockSettingsStore({
      kickClientId: "",
      kickRedirectUri: "http://localhost/kick/callback",
    });
    const clearAuthTokens = vi.fn().mockResolvedValue(undefined);
    const openAuthInBrowser = vi.fn();
    const handlers = createAuthSignInHandlers({
      store: store as never,
      randomToken: vi
        .fn()
        .mockReturnValueOnce("kick-state")
        .mockReturnValueOnce("kick-verifier"),
      openAuthInBrowser,
      fetchJsonOrThrow: vi.fn(),
      clearAuthTokens,
      storeOAuthClientSecret: vi.fn().mockResolvedValue(undefined),
      storeAuthTokens: vi.fn().mockResolvedValue(undefined),
      parseKickUserName: vi.fn(),
      twitchDefaultRedirectUri: "http://localhost/twitch/callback",
      twitchScopes: ["chat:read"],
      twitchScopeVersion: 2,
      kickDefaultRedirectUri: "http://localhost/kick/callback",
      kickScopes: ["user:read"],
      kickScopeVersion: 3,
      kickWriteAuthUnavailableMessage: KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE,
      getKickClientSecret: vi.fn().mockResolvedValue(""),
      getKickTokenExchangeUrl: vi.fn().mockReturnValue(null),
      youtubeScopes: ["scope"],
      youtubeMissingOauthMessage: "youtube oauth missing",
      assertYouTubeAlphaEnabled: vi.fn(),
      youtubeConfig: vi.fn().mockResolvedValue({
        clientId: "",
        clientSecret: "",
        redirectUri: "http://localhost/youtube/callback",
      }),
      saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
      youtubeFetchWithAuth: vi.fn(),
    });

    await expect(
      handlers[IPC_CHANNELS.AUTH_KICK_SIGN_IN](
        {} as never,
        undefined as never,
      ),
    ).rejects.toThrow(KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE);

    expect(clearAuthTokens).not.toHaveBeenCalledWith("kick");
    expect(openAuthInBrowser).not.toHaveBeenCalled();
  });

  it("uses the injected kick client secret for kick sign-in", async () => {
    const originalFetch = globalThis.fetch;

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "stored-access",
            refresh_token: "stored-refresh",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ username: "stored-user" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const store = createMockSettingsStore({
        kickClientId: "stored-kick-client",
        kickRedirectUri: "http://localhost/stored-kick-callback",
      });
      const getKickClientSecret = vi.fn().mockResolvedValue(
        "stored-kick-secret",
      );

      const handlers = createAuthSignInHandlers({
        store: store as never,
        randomToken: vi
          .fn()
          .mockReturnValueOnce("kick-state")
          .mockReturnValueOnce("kick-verifier"),
        openAuthInBrowser: vi
          .fn()
          .mockResolvedValue(
            "http://localhost/stored-kick-callback?code=kick-code&state=kick-state",
          ),
        fetchJsonOrThrow: async <T,>(response: Response, source: string) => {
          const text = await response.text();
          const parsed = text ? JSON.parse(text) : {};
          if (!response.ok) {
            throw new Error(`${source} request failed (${response.status}).`);
          }
          return parsed as T;
        },
        clearAuthTokens: vi.fn().mockResolvedValue(undefined),
        storeOAuthClientSecret: vi.fn().mockResolvedValue(undefined),
        storeAuthTokens: vi.fn().mockResolvedValue(undefined),
        parseKickUserName: vi.fn().mockReturnValue("stored-user"),
        twitchDefaultRedirectUri: "http://localhost/twitch/callback",
        twitchScopes: ["chat:read"],
        twitchScopeVersion: 2,
        kickDefaultRedirectUri: "http://localhost/kick/callback",
        kickScopes: ["user:read"],
        kickScopeVersion: 3,
        kickWriteAuthUnavailableMessage: KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE,
        getKickClientSecret,
        getKickTokenExchangeUrl: vi.fn().mockReturnValue(null),
        youtubeScopes: ["scope"],
        youtubeMissingOauthMessage: "youtube oauth missing",
        assertYouTubeAlphaEnabled: vi.fn(),
        youtubeConfig: vi.fn().mockResolvedValue({
          clientId: "",
          clientSecret: "",
          redirectUri: "http://localhost/youtube/callback",
        }),
        saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
        youtubeFetchWithAuth: vi.fn(),
      });

      await handlers[IPC_CHANNELS.AUTH_KICK_SIGN_IN](
        {} as never,
        undefined as never,
      );

      const tokenRequestBody = fetchMock.mock.calls[0]?.[1]
        ?.body as URLSearchParams;
      expect(getKickClientSecret).toHaveBeenCalledTimes(1);
      expect(tokenRequestBody.get("client_id")).toBe("stored-kick-client");
      expect(tokenRequestBody.get("client_secret")).toBe("stored-kick-secret");
      expect(tokenRequestBody.get("redirect_uri")).toBe(
        "http://localhost/stored-kick-callback",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes kick token exchange response details in auth errors", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const store = createMockSettingsStore({
        kickClientId: "stored-kick-client",
        kickRedirectUri: "http://localhost/stored-kick-callback",
      });

      const handlers = createAuthSignInHandlers({
        store: store as never,
        randomToken: vi
          .fn()
          .mockReturnValueOnce("kick-state")
          .mockReturnValueOnce("kick-verifier"),
        openAuthInBrowser: vi
          .fn()
          .mockResolvedValue(
            "http://localhost/stored-kick-callback?code=kick-code&state=kick-state",
          ),
        fetchJsonOrThrow: vi.fn(),
        clearAuthTokens: vi.fn().mockResolvedValue(undefined),
        storeOAuthClientSecret: vi.fn().mockResolvedValue(undefined),
        storeAuthTokens: vi.fn().mockResolvedValue(undefined),
        parseKickUserName: vi.fn(),
        twitchDefaultRedirectUri: "http://localhost/twitch/callback",
        twitchScopes: ["chat:read"],
        twitchScopeVersion: 2,
        kickDefaultRedirectUri: "http://localhost/kick/callback",
        kickScopes: ["user:read"],
        kickScopeVersion: 3,
        kickWriteAuthUnavailableMessage: KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE,
        getKickClientSecret: vi.fn().mockResolvedValue("configured-secret"),
        getKickTokenExchangeUrl: vi.fn().mockReturnValue(null),
        youtubeScopes: ["scope"],
        youtubeMissingOauthMessage: "youtube oauth missing",
        assertYouTubeAlphaEnabled: vi.fn(),
        youtubeConfig: vi.fn().mockResolvedValue({
          clientId: "",
          clientSecret: "",
          redirectUri: "http://localhost/youtube/callback",
        }),
        saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
        youtubeFetchWithAuth: vi.fn(),
      });

      await expect(
        handlers[IPC_CHANNELS.AUTH_KICK_SIGN_IN](
          {} as never,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Kick token exchange request failed (400). invalid_client Response: {"error":"invalid_client"} Context: clientId=stored-kick-client, redirectUri=http://localhost/stored-kick-callback, clientSecretPresent=true',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("stores local kick write auth on this machine and clears old kick tokens", async () => {
    const store = createMockSettingsStore({
      kickAccessToken: "old-access",
      kickRefreshToken: "old-refresh",
      kickUsername: "old-user",
      kickGuest: true,
    });
    const { handlers, clearAuthTokens, storeOAuthClientSecret } =
      buildHandlers(store);

    const result = await handlers[IPC_CHANNELS.AUTH_KICK_CONFIGURE_LOCAL](
      {} as never,
      {
        clientId: " local-client ",
        clientSecret: " local-secret ",
        redirectUri: "http://localhost:51730/kick/callback",
      } as never,
    );

    expect(storeOAuthClientSecret).toHaveBeenCalledWith("kick", "local-secret");
    expect(clearAuthTokens).toHaveBeenCalledWith("kick");
    expect(store.store.kickClientId).toBe("local-client");
    expect(store.store.kickRedirectUri).toBe(
      "http://localhost:51730/kick/callback",
    );
    expect(store.store.kickAccessToken).toBe("");
    expect(store.store.kickRefreshToken).toBe("");
    expect(store.store.kickUsername).toBe("");
    expect(store.store.kickGuest).toBe(false);
    expect(result).toEqual(store.store);
  });

  it("uses the broker exchange url when configured", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "broker-access",
            refresh_token: "broker-refresh",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ username: "broker-user" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const store = createMockSettingsStore({
        kickClientId: "stored-kick-client",
        kickRedirectUri: "http://localhost/stored-kick-callback",
      });

      const handlers = createAuthSignInHandlers({
        store: store as never,
        randomToken: vi
          .fn()
          .mockReturnValueOnce("kick-state")
          .mockReturnValueOnce("kick-verifier"),
        openAuthInBrowser: vi
          .fn()
          .mockResolvedValue(
            "http://localhost/stored-kick-callback?code=kick-code&state=kick-state",
          ),
        fetchJsonOrThrow: async <T,>(response: Response, source: string) => {
          const text = await response.text();
          const parsed = text ? JSON.parse(text) : {};
          if (!response.ok) {
            throw new Error(`${source} request failed (${response.status}).`);
          }
          return parsed as T;
        },
        clearAuthTokens: vi.fn().mockResolvedValue(undefined),
        storeAuthTokens: vi.fn().mockResolvedValue(undefined),
        parseKickUserName: vi.fn().mockReturnValue("broker-user"),
        twitchDefaultRedirectUri: "http://localhost/twitch/callback",
        twitchScopes: ["chat:read"],
        twitchScopeVersion: 2,
        kickDefaultRedirectUri: "http://localhost/kick/callback",
        kickScopes: ["user:read"],
        kickScopeVersion: 3,
        kickWriteAuthUnavailableMessage: KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE,
        getKickClientSecret: vi.fn().mockResolvedValue(""),
        getKickTokenExchangeUrl: vi
          .fn()
          .mockReturnValue("https://broker.example.com/kick/token"),
        youtubeScopes: ["scope"],
        youtubeMissingOauthMessage: "youtube oauth missing",
        assertYouTubeAlphaEnabled: vi.fn(),
        youtubeConfig: vi.fn().mockResolvedValue({
          clientId: "",
          clientSecret: "",
          redirectUri: "http://localhost/youtube/callback",
        }),
        saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
        youtubeFetchWithAuth: vi.fn(),
      });

      await handlers[IPC_CHANNELS.AUTH_KICK_SIGN_IN](
        {} as never,
        undefined as never,
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://broker.example.com/kick/token",
      );
      expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
        JSON.stringify({
          code: "kick-code",
          clientId: "stored-kick-client",
          redirectUri: "http://localhost/stored-kick-callback",
          codeVerifier: "kick-verifier",
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("createAuthTikTokHandlers", () => {
  it("routes sign-in and sign-out to injected handlers", async () => {
    const signIn = vi.fn().mockResolvedValue({ ok: true });
    const signOut = vi.fn().mockResolvedValue({ ok: true });
    const handlers = createAuthTikTokHandlers({ signIn, signOut });

    await handlers[IPC_CHANNELS.AUTH_TIKTOK_SIGN_IN](
      {} as never,
      undefined as never,
    );
    await handlers[IPC_CHANNELS.AUTH_TIKTOK_SIGN_OUT](
      {} as never,
      undefined as never,
    );

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
