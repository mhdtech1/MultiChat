import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/constants";
import type {
  AppSettings,
  AuthHealthSnapshot,
} from "../../../src/shared/types";
import { createSettingsHandlers } from "../../../src/main/ipc/settingsHandlers";
import {
  createAuthHealthHandlers,
  createAuthSessionHandlers,
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
    set(
      updatesOrKey: Partial<AppSettings> | keyof AppSettings,
      value?: AppSettings[keyof AppSettings],
    ) {
      if (typeof updatesOrKey === "string") {
        state = { ...state, [updatesOrKey]: value };
        return;
      }
      state = { ...state, ...updatesOrKey };
    },
  };
};

describe("createSettingsHandlers", () => {
  it("returns current store state on SETTINGS_GET", async () => {
    const store = createMockSettingsStore({
      theme: "dark",
      updateChannel: "stable",
    });

    const handlers = createSettingsHandlers({
      store: store as never,
      youtubeAlphaEnabled: true,
      tiktokAlphaEnabled: true,
      resolveConfiguredUpdateChannel: () => "stable",
      applyAutoUpdaterChannel: vi.fn(),
      storeAuthTokens: vi.fn().mockResolvedValue(undefined),
      clearAuthTokens: vi.fn().mockResolvedValue(undefined),
    });

    const result = await handlers[IPC_CHANNELS.SETTINGS_GET](
      {} as never,
      undefined as never,
    );
    expect(result).toMatchObject({
      theme: "dark",
      updateChannel: "stable",
    });
  });

  it("filters disabled platforms and persists auth token changes", async () => {
    const store = createMockSettingsStore({
      updateChannel: "stable",
      twitchToken: "",
      sessionSources: [
        {
          id: "twitch-1",
          platform: "twitch",
          channel: "alpha",
          key: "twitch:alpha",
        },
      ],
      sessionTabs: [{ id: "tab-twitch", sourceIds: ["twitch-1"] }],
      sessionActiveTabId: "tab-twitch",
    });
    const applyAutoUpdaterChannel = vi.fn();
    const storeAuthTokens = vi.fn().mockResolvedValue(undefined);
    const clearAuthTokens = vi.fn().mockResolvedValue(undefined);

    const handlers = createSettingsHandlers({
      store: store as never,
      youtubeAlphaEnabled: false,
      tiktokAlphaEnabled: false,
      resolveConfiguredUpdateChannel: () => "stable",
      applyAutoUpdaterChannel,
      storeAuthTokens,
      clearAuthTokens,
    });

    const result = await handlers[IPC_CHANNELS.SETTINGS_SET](
      {} as never,
      {
        updateChannel: "invalid" as never,
        twitchToken: "token-123",
        sessionSources: [
          {
            id: "twitch-1",
            platform: "twitch",
            channel: "alpha",
            key: "twitch:alpha",
          },
          {
            id: "youtube-1",
            platform: "youtube",
            channel: "beta",
            key: "youtube:beta",
          },
        ],
        sessionTabs: [
          { id: "tab-twitch", sourceIds: ["twitch-1"] },
          { id: "tab-youtube", sourceIds: ["youtube-1"] },
        ],
        sessionActiveTabId: "tab-youtube",
      } as never,
    );

    expect(result.updateChannel).toBe("stable");
    expect(result.sessionSources).toEqual([
      {
        id: "twitch-1",
        platform: "twitch",
        channel: "alpha",
        key: "twitch:alpha",
      },
    ]);
    expect(result.sessionTabs).toEqual([
      { id: "tab-twitch", sourceIds: ["twitch-1"] },
    ]);
    expect(result.sessionActiveTabId).toBe("tab-twitch");
    expect(storeAuthTokens).toHaveBeenCalledWith("twitch", {
      accessToken: "token-123",
    });
    expect(applyAutoUpdaterChannel).toHaveBeenCalledWith("stable");
    expect(clearAuthTokens).not.toHaveBeenCalledWith("twitch");
  });

  it("drops legacy client secret fields from renderer settings updates", async () => {
    const store = createMockSettingsStore({
      theme: "dark",
      updateChannel: "stable",
    });

    const handlers = createSettingsHandlers({
      store: store as never,
      youtubeAlphaEnabled: true,
      tiktokAlphaEnabled: true,
      resolveConfiguredUpdateChannel: () => "stable",
      applyAutoUpdaterChannel: vi.fn(),
      storeAuthTokens: vi.fn().mockResolvedValue(undefined),
      clearAuthTokens: vi.fn().mockResolvedValue(undefined),
    });

    const result = await handlers[IPC_CHANNELS.SETTINGS_SET](
      {} as never,
      {
        theme: "light",
        kickClientSecret: "renderer-secret",
        youtubeClientSecret: "renderer-youtube-secret",
      } as never,
    );

    expect(result).toEqual({
      theme: "light",
      updateChannel: "stable",
      youtubeAlphaEnabled: true,
      tiktokAlphaEnabled: true,
    });
  });
});

describe("createAuthHealthHandlers", () => {
  it("returns auth health snapshots for both health channels", async () => {
    const snapshot: AuthHealthSnapshot = {
      twitch: {
        platform: "twitch",
        signedIn: false,
        username: "",
        canSend: false,
        canModerate: false,
        tokenExpiry: null,
        lastCheckedAt: Date.now(),
      },
      kick: {
        platform: "kick",
        signedIn: true,
        username: "mod",
        canSend: true,
        canModerate: true,
        tokenExpiry: null,
        lastCheckedAt: Date.now(),
      },
      youtubeTokenExpiry: null,
      updateChannel: "stable",
    };
    const getAuthHealthSnapshot = vi.fn().mockResolvedValue(snapshot);
    const handlers = createAuthHealthHandlers({ getAuthHealthSnapshot });

    const first = await handlers[IPC_CHANNELS.AUTH_GET_HEALTH](
      {} as never,
      undefined as never,
    );
    const second = await handlers[IPC_CHANNELS.AUTH_TEST_PERMISSIONS](
      {} as never,
      undefined as never,
    );

    expect(first).toEqual(snapshot);
    expect(second).toEqual(snapshot);
    expect(getAuthHealthSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("createAuthSessionHandlers", () => {
  it("handles auth sign-outs and kick refresh", async () => {
    const store = createMockSettingsStore({
      twitchToken: "abc",
      kickAccessToken: "kick",
      youtubeAccessToken: "yt",
    });
    const clearAuthTokens = vi.fn().mockResolvedValue(undefined);
    const refreshKickAccessToken = vi.fn().mockResolvedValue(undefined);
    const onYouTubeSignedOut = vi.fn();

    const handlers = createAuthSessionHandlers({
      store: store as never,
      twitchScopeVersion: 2,
      kickScopeVersion: 3,
      clearAuthTokens,
      refreshKickAccessToken,
      onYouTubeSignedOut,
    });

    await handlers[IPC_CHANNELS.AUTH_TWITCH_SIGN_OUT](
      {} as never,
      undefined as never,
    );
    await handlers[IPC_CHANNELS.AUTH_KICK_SIGN_OUT](
      {} as never,
      undefined as never,
    );
    await handlers[IPC_CHANNELS.AUTH_KICK_REFRESH](
      {} as never,
      undefined as never,
    );
    await handlers[IPC_CHANNELS.AUTH_YOUTUBE_SIGN_OUT](
      {} as never,
      undefined as never,
    );

    expect(refreshKickAccessToken).toHaveBeenCalledTimes(1);
    expect(clearAuthTokens).toHaveBeenCalledWith("twitch");
    expect(clearAuthTokens).toHaveBeenCalledWith("kick");
    expect(clearAuthTokens).toHaveBeenCalledWith("youtube");
    expect(onYouTubeSignedOut).toHaveBeenCalledTimes(1);
  });
});
