import { IPC_CHANNELS } from "../../shared/constants.js";
import type { AppSettings, UpdateChannel } from "../../shared/types.js";
import type { JsonSettingsStore } from "../services/settingsStore.js";
import type { IpcHandlerRegistry } from "./handlers.js";

type AuthTokenPlatform = "twitch" | "kick" | "youtube";

type StoreAuthTokens = (
  platform: AuthTokenPlatform,
  tokens: { accessToken: string; refreshToken?: string },
) => Promise<void>;

type ClearAuthTokens = (platform: AuthTokenPlatform) => Promise<void>;

type CreateSettingsHandlersOptions = {
  store: JsonSettingsStore;
  youtubeAlphaEnabled: boolean;
  tiktokAlphaEnabled: boolean;
  resolveConfiguredUpdateChannel: () => UpdateChannel;
  applyAutoUpdaterChannel: (channel: UpdateChannel) => void;
  storeAuthTokens: StoreAuthTokens;
  clearAuthTokens: ClearAuthTokens;
};

export function createSettingsHandlers(
  options: CreateSettingsHandlersOptions,
): IpcHandlerRegistry {
  const {
    store,
    youtubeAlphaEnabled,
    tiktokAlphaEnabled,
    resolveConfiguredUpdateChannel,
    applyAutoUpdaterChannel,
    storeAuthTokens,
    clearAuthTokens,
  } = options;

  return {
    [IPC_CHANNELS.SETTINGS_GET]: () => store.store,
    [IPC_CHANNELS.SETTINGS_SET]: async (_event, updates: unknown) => {
      const rawRequestedUpdates =
        updates && typeof updates === "object"
          ? ({ ...updates } as Record<string, unknown>)
          : {};
      delete rawRequestedUpdates.kickClientSecret;
      delete rawRequestedUpdates.youtubeClientSecret;
      const requestedUpdates = rawRequestedUpdates as AppSettings;
      const nextUpdates: Partial<AppSettings> = {
        ...requestedUpdates,
        updateChannel:
          requestedUpdates.updateChannel === "beta"
            ? "beta"
            : requestedUpdates.updateChannel === "stable"
              ? "stable"
              : resolveConfiguredUpdateChannel(),
        youtubeAlphaEnabled,
        tiktokAlphaEnabled,
      };

      if (!youtubeAlphaEnabled) {
        Object.assign(nextUpdates, {
          youtubeAccessToken: "",
          youtubeRefreshToken: "",
          youtubeTokenExpiry: 0,
          youtubeUsername: "",
          youtubeLiveChatId: "",
        });
      }
      if (!tiktokAlphaEnabled) {
        Object.assign(nextUpdates, {
          tiktokSessionId: "",
          tiktokTtTargetIdc: "",
          tiktokUsername: "",
        });
      }

      const disabledPlatforms = new Set<string>();
      if (!youtubeAlphaEnabled) {
        disabledPlatforms.add("youtube");
      }
      if (!tiktokAlphaEnabled) {
        disabledPlatforms.add("tiktok");
      }

      if (disabledPlatforms.size > 0) {
        const currentSources = Array.isArray(requestedUpdates.sessionSources)
          ? requestedUpdates.sessionSources
          : Array.isArray(store.get("sessionSources"))
            ? (store.get("sessionSources") ?? [])
            : [];
        const filteredSources = currentSources.filter(
          (source) => !disabledPlatforms.has(source.platform),
        );
        const retainedIds = new Set(filteredSources.map((source) => source.id));
        const currentTabs = Array.isArray(requestedUpdates.sessionTabs)
          ? requestedUpdates.sessionTabs
          : Array.isArray(store.get("sessionTabs"))
            ? (store.get("sessionTabs") ?? [])
            : [];
        const filteredTabs = currentTabs
          .map((tab) => ({
            ...tab,
            sourceIds: tab.sourceIds.filter((sourceId) =>
              retainedIds.has(sourceId),
            ),
          }))
          .filter((tab) => tab.sourceIds.length > 0);

        const requestedActiveTabId =
          typeof requestedUpdates.sessionActiveTabId === "string"
            ? requestedUpdates.sessionActiveTabId
            : (store.get("sessionActiveTabId") ?? "");
        const nextActiveTabId =
          requestedActiveTabId &&
          filteredTabs.some((tab) => tab.id === requestedActiveTabId)
            ? requestedActiveTabId
            : (filteredTabs[0]?.id ?? "");

        Object.assign(nextUpdates, {
          sessionSources: filteredSources,
          sessionTabs: filteredTabs,
          sessionActiveTabId: nextActiveTabId,
        });
      }

      const prevTwitchToken = String(store.get("twitchToken") ?? "").trim();
      const prevKickAccessToken = String(
        store.get("kickAccessToken") ?? "",
      ).trim();
      const prevKickRefreshToken = String(
        store.get("kickRefreshToken") ?? "",
      ).trim();
      const prevYouTubeAccessToken = String(
        store.get("youtubeAccessToken") ?? "",
      ).trim();
      const prevYouTubeRefreshToken = String(
        store.get("youtubeRefreshToken") ?? "",
      ).trim();

      const nextTwitchToken =
        typeof nextUpdates.twitchToken === "string"
          ? nextUpdates.twitchToken.trim()
          : prevTwitchToken;
      const nextKickAccessToken =
        typeof nextUpdates.kickAccessToken === "string"
          ? nextUpdates.kickAccessToken.trim()
          : prevKickAccessToken;
      const nextKickRefreshToken =
        typeof nextUpdates.kickRefreshToken === "string"
          ? nextUpdates.kickRefreshToken.trim()
          : prevKickRefreshToken;
      const nextYouTubeAccessToken =
        typeof nextUpdates.youtubeAccessToken === "string"
          ? nextUpdates.youtubeAccessToken.trim()
          : prevYouTubeAccessToken;
      const nextYouTubeRefreshToken =
        typeof nextUpdates.youtubeRefreshToken === "string"
          ? nextUpdates.youtubeRefreshToken.trim()
          : prevYouTubeRefreshToken;

      store.set(nextUpdates);
      if (
        typeof nextUpdates.twitchToken === "string" &&
        nextTwitchToken !== prevTwitchToken
      ) {
        if (nextTwitchToken) {
          await storeAuthTokens("twitch", { accessToken: nextTwitchToken });
        } else {
          await clearAuthTokens("twitch");
        }
      }
      if (
        (typeof nextUpdates.kickAccessToken === "string" ||
          typeof nextUpdates.kickRefreshToken === "string") &&
        (nextKickAccessToken !== prevKickAccessToken ||
          nextKickRefreshToken !== prevKickRefreshToken)
      ) {
        if (nextKickAccessToken || nextKickRefreshToken) {
          await storeAuthTokens("kick", {
            accessToken: nextKickAccessToken,
            refreshToken: nextKickRefreshToken,
          });
        } else {
          await clearAuthTokens("kick");
        }
      }
      if (
        (typeof nextUpdates.youtubeAccessToken === "string" ||
          typeof nextUpdates.youtubeRefreshToken === "string") &&
        (nextYouTubeAccessToken !== prevYouTubeAccessToken ||
          nextYouTubeRefreshToken !== prevYouTubeRefreshToken)
      ) {
        if (nextYouTubeAccessToken || nextYouTubeRefreshToken) {
          await storeAuthTokens("youtube", {
            accessToken: nextYouTubeAccessToken,
            refreshToken: nextYouTubeRefreshToken,
          });
        } else {
          await clearAuthTokens("youtube");
        }
      }
      if (
        nextUpdates.updateChannel === "stable" ||
        nextUpdates.updateChannel === "beta"
      ) {
        applyAutoUpdaterChannel(nextUpdates.updateChannel);
      }
      return store.store;
    },
  };
}
