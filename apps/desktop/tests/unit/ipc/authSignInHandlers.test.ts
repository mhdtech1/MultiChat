import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/constants";
import type { AppSettings } from "../../../src/shared/types";
import {
  createAuthSignInHandlers,
  createAuthTikTokHandlers,
} from "../../../src/main/ipc/authHandlers";

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
  const handlers = createAuthSignInHandlers({
    store: store as never,
    randomToken: vi.fn().mockReturnValue("token"),
    openAuthInBrowser: vi.fn(),
    fetchJsonOrThrow: vi.fn(),
    clearAuthTokens,
    storeAuthTokens: vi.fn().mockResolvedValue(undefined),
    parseKickUserName: vi.fn(),
    twitchDefaultRedirectUri: "http://localhost/twitch/callback",
    twitchScopes: ["chat:read"],
    twitchScopeVersion: 2,
    kickDefaultRedirectUri: "http://localhost/kick/callback",
    kickScopes: ["user:read"],
    kickScopeVersion: 3,
    youtubeScopes: ["scope"],
    youtubeMissingOauthMessage: "youtube oauth missing",
    assertYouTubeAlphaEnabled: vi.fn(),
    youtubeConfig: vi.fn().mockReturnValue({
      clientId: "",
      clientSecret: "",
      redirectUri: "http://localhost/youtube/callback",
    }),
    saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
    youtubeFetchWithAuth: vi.fn(),
  });
  return { handlers, clearAuthTokens };
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

  it("falls back to kick guest mode when token exchange fails without a client secret", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("bad request", {
        status: 400,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const store = createMockSettingsStore({
        kickClientId: "kick-client",
        kickClientSecret: "",
        kickRedirectUri: "http://localhost/kick/callback",
      });
      const clearAuthTokens = vi.fn().mockResolvedValue(undefined);
      const handlers = createAuthSignInHandlers({
        store: store as never,
        randomToken: vi
          .fn()
          .mockReturnValueOnce("kick-state")
          .mockReturnValueOnce("kick-verifier"),
        openAuthInBrowser: vi
          .fn()
          .mockResolvedValue(
            "http://localhost/kick/callback?code=kick-code&state=kick-state",
          ),
        fetchJsonOrThrow: async <T,>(response: Response, source: string) => {
          if (!response.ok) {
            throw new Error(`${source} request failed (${response.status}).`);
          }
          return (await response.json()) as T;
        },
        clearAuthTokens,
        storeAuthTokens: vi.fn().mockResolvedValue(undefined),
        parseKickUserName: vi.fn(),
        twitchDefaultRedirectUri: "http://localhost/twitch/callback",
        twitchScopes: ["chat:read"],
        twitchScopeVersion: 2,
        kickDefaultRedirectUri: "http://localhost/kick/callback",
        kickScopes: ["user:read"],
        kickScopeVersion: 3,
        youtubeScopes: ["scope"],
        youtubeMissingOauthMessage: "youtube oauth missing",
        assertYouTubeAlphaEnabled: vi.fn(),
        youtubeConfig: vi.fn().mockReturnValue({
          clientId: "",
          clientSecret: "",
          redirectUri: "http://localhost/youtube/callback",
        }),
        saveYouTubeTokens: vi.fn().mockResolvedValue(undefined),
        youtubeFetchWithAuth: vi.fn(),
      });

      const result = await handlers[IPC_CHANNELS.AUTH_KICK_SIGN_IN](
        {} as never,
        undefined as never,
      );

      expect(result.kickGuest).toBe(true);
      expect(result.kickUsername).toBe("guest");
      expect(clearAuthTokens).toHaveBeenCalledWith("kick");
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
