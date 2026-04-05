import {
  app,
  BrowserWindow,
  type Cookie,
  Menu,
  dialog,
  ipcMain,
  shell,
  session,
  type Session,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import electronUpdater from "electron-updater";
import tikTokLiveConnectorCjs from "tiktok-live-connector";
import { AUTH, IPC_CHANNELS } from "../shared/constants.js";
import type {
  AppSettings,
  AuthHealthSnapshot,
  AuthPermissionSnapshot,
  ModerationRequest,
  TikTokRendererEvent,
  UpdateChannel,
  UpdateStatus,
} from "../shared/types.js";
import { JsonSettingsStore } from "./services/settingsStore.js";
import {
  clearAuthTokens,
  getOAuthClientSecret,
  hydrateTokenStateFromSecureStorage,
  migrateLegacySettingsTokens,
  storeOAuthClientSecret,
  storeAuthTokens,
} from "./services/secureStorage.js";
import { openAuthInBrowser as openLoopbackAuthInBrowser } from "./services/loopbackOAuth.js";
import { fetchJsonOrThrow } from "./utils/http.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { cleanupLegacyInstallArtifacts } from "./services/legacyInstallCleanup.js";
import {
  createAuthHealthHandlers,
  createAuthSignInHandlers,
  createAuthSessionHandlers,
  createAuthTikTokHandlers,
} from "./ipc/authHandlers.js";
import { createChatHandlers } from "./ipc/chatHandlers.js";
import { createLogHandlers } from "./ipc/logHandlers.js";
import { createSettingsHandlers } from "./ipc/settingsHandlers.js";
import { createTikTokHandlers } from "./ipc/tiktokHandlers.js";
import { createUpdateHandlers } from "./ipc/updateHandlers.js";

const { autoUpdater } = electronUpdater;
type TikTokConnectorModule = typeof import("tiktok-live-connector");
const tikTokLiveConnector = ((
  tikTokLiveConnectorCjs as unknown as { default?: TikTokConnectorModule }
).default ??
  (tikTokLiveConnectorCjs as unknown as TikTokConnectorModule)) as TikTokConnectorModule;
const { TikTokLiveConnection, WebcastEvent, ControlEvent } =
  tikTokLiveConnector;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEV_UPDATE_MESSAGE =
  "Auto updates are available in packaged builds only.";
const DEFAULT_UPDATE_MESSAGE = "Checking for updates shortly...";
const LEGACY_SIGNATURE_UPDATE_MESSAGE =
  "Updater could not apply this update due to a legacy app signature. Download and install the latest Chatrix release once from GitHub; future restart updates will then work.";
const KICK_REAUTH_REQUIRED_MESSAGE =
  "Kick session expired. Sign in to Kick again.";
const KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE =
  "Kick sign-in is temporarily unavailable. You can still open Kick chats in read-only mode.";
const YOUTUBE_MISSING_OAUTH_MESSAGE =
  "YouTube sign-in is not configured in this build. Configure a YouTube OAuth Client ID (secret optional) and try again.";
const YOUTUBE_READONLY_UNAVAILABLE_MESSAGE =
  "YouTube read-only is not configured in this build.";
const YOUTUBE_ALPHA_DISABLED_MESSAGE =
  "YouTube is an alpha-only feature and is disabled in this beta build.";
const TIKTOK_ALPHA_DISABLED_MESSAGE =
  "TikTok LIVE is an alpha-only feature and is disabled in this beta build.";
const TIKTOK_SIGN_IN_CANCELLED_MESSAGE =
  "TikTok sign-in was cancelled before completion.";
const TIKTOK_SIGN_IN_TIMEOUT_MESSAGE =
  "TikTok sign-in timed out. Please try again.";
const TIKTOK_SIGN_IN_REQUIRED_MESSAGE =
  "Sign in with TikTok before sending messages.";
const TIKTOK_SIGN_KEY_REQUIRED_MESSAGE =
  "TikTok sending is not configured in this build.";
const TIKTOK_AUTH_PARTITION = "persist:chatrix-tiktok-auth";
const TIKTOK_AUTH_TIMEOUT_MS = AUTH.TIKTOK_AUTH_TIMEOUT_MS;
const TIKTOK_LOGIN_URL = "https://www.tiktok.com/login";

const isSafeExternalUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const TIKTOK_SIGN_API_KEY = (process.env.TIKTOK_SIGN_API_KEY ?? "").trim();
const TWITCH_DEFAULT_REDIRECT_URI = "http://localhost:51730/twitch/callback";
const KICK_DEFAULT_REDIRECT_URI = "http://localhost:51730/kick/callback";
const YOUTUBE_DEFAULT_REDIRECT_URI = "http://localhost:51730/youtube/callback";
const TWITCH_MANAGED_CLIENT_ID = "syeui9mom7i5f9060j03tydgpdywbh";
const KICK_MANAGED_CLIENT_ID = "01KGRFF03VYRJMB3W4369Y07CS";
const KICK_MANAGED_CLIENT_SECRET = "";
const KICK_MANAGED_BROKER_EXCHANGE_URL =
  "https://kick-broker.onrender.com/kick/exchange";
const KICK_MANAGED_BROKER_REFRESH_URL =
  "https://kick-broker.onrender.com/kick/refresh";
const KICK_BROKER_HEALTH_TIMEOUT_MS = 10_000;
const KICK_BROKER_WAKE_TIMEOUT_MS = 75_000;
const KICK_BROKER_WAKE_RETRY_MS = 2_500;
const KICK_BROKER_KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;
const YOUTUBE_MANAGED_CLIENT_ID =
  "1008732662207-rufcsa7rafob02h29docduk7pboim0s8.apps.googleusercontent.com";
const YOUTUBE_MANAGED_CLIENT_SECRET = "";
const YOUTUBE_MANAGED_API_KEY = "";
const TWITCH_SCOPE_VERSION = 2;
const TWITCH_SCOPES = [
  "chat:read",
  "chat:edit",
  "moderator:manage:banned_users",
  "moderator:manage:chat_messages",
  "moderator:read:moderators",
];
const KICK_SCOPES = [
  "user:read",
  "channel:read",
  "chat:write",
  "moderation:ban",
  "moderation:chat_message:manage",
];
const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];
const KICK_SCOPE_VERSION = 3;
const YOUTUBE_ALPHA_ENABLED = true;
const TIKTOK_ALPHA_ENABLED = true;
const DEFAULT_UPDATE_CHANNEL: UpdateChannel = "stable";
const FORCE_APP_RESET_VERSION = "0.1.35";

const randomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("base64url");

const AUTH_CALLBACK_TIMEOUT_MS = AUTH.OAUTH_CALLBACK_TIMEOUT_MS;

const resolveManagedClientSecret = async (
  platform: "kick" | "youtube",
  envValue: string | undefined,
  managedValue: string,
) => {
  const configured = (envValue ?? managedValue).trim();
  if (configured) return configured;
  return (await getOAuthClientSecret(platform))?.trim() ?? "";
};

const getKickClientSecret = () =>
  resolveManagedClientSecret(
    "kick",
    process.env.KICK_CLIENT_SECRET,
    KICK_MANAGED_CLIENT_SECRET,
  );

const getYouTubeClientSecret = () =>
  resolveManagedClientSecret(
    "youtube",
    process.env.YOUTUBE_CLIENT_SECRET,
    YOUTUBE_MANAGED_CLIENT_SECRET,
  );

type KickTokenBrokerConfig = {
  exchangeUrl: string;
  refreshUrl: string;
};

const normalizeOptionalHttpUrl = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const getKickTokenBrokerConfig = (): KickTokenBrokerConfig | null => {
  const exchangeUrl =
    normalizeOptionalHttpUrl(process.env.KICK_TOKEN_BROKER_EXCHANGE_URL) ||
    KICK_MANAGED_BROKER_EXCHANGE_URL;
  const refreshUrl =
    normalizeOptionalHttpUrl(process.env.KICK_TOKEN_BROKER_REFRESH_URL) ||
    KICK_MANAGED_BROKER_REFRESH_URL;
  if (!exchangeUrl || !refreshUrl) {
    return null;
  }
  return { exchangeUrl, refreshUrl };
};

let kickBrokerWarmupPromise: Promise<void> | null = null;
let kickBrokerKeepAliveTimer: NodeJS.Timeout | null = null;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const getKickTokenBrokerHealthUrl = (): string | null => {
  const config = getKickTokenBrokerConfig();
  if (!config) {
    return null;
  }
  try {
    return new URL("/health", config.exchangeUrl).toString();
  } catch {
    return null;
  }
};

const fetchKickTokenBrokerHealth = async (
  timeoutMs = KICK_BROKER_HEALTH_TIMEOUT_MS,
): Promise<boolean> => {
  const healthUrl = getKickTokenBrokerHealthUrl();
  if (!healthUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const ensureKickTokenBrokerReady = async (): Promise<void> => {
  if (!getKickTokenBrokerConfig()) {
    return;
  }
  if (kickBrokerWarmupPromise) {
    return kickBrokerWarmupPromise;
  }

  kickBrokerWarmupPromise = (async () => {
    const deadline = Date.now() + KICK_BROKER_WAKE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await fetchKickTokenBrokerHealth()) {
        return;
      }
      await sleep(KICK_BROKER_WAKE_RETRY_MS);
    }
    throw new Error(
      "Kick auth service is waking up. Please wait a moment and try again.",
    );
  })().finally(() => {
    kickBrokerWarmupPromise = null;
  });

  return kickBrokerWarmupPromise;
};

const warmKickTokenBrokerInBackground = (): void => {
  if (!getKickTokenBrokerConfig()) {
    return;
  }
  void ensureKickTokenBrokerReady().catch((error) => {
    console.info(
      "[kick-broker] warmup skipped:",
      error instanceof Error ? error.message : String(error),
    );
  });
};

const startKickTokenBrokerKeepAlive = (): void => {
  if (kickBrokerKeepAliveTimer || !getKickTokenBrokerConfig()) {
    return;
  }
  warmKickTokenBrokerInBackground();
  kickBrokerKeepAliveTimer = setInterval(() => {
    warmKickTokenBrokerInBackground();
  }, KICK_BROKER_KEEPALIVE_INTERVAL_MS);
};

const stopKickTokenBrokerKeepAlive = (): void => {
  if (!kickBrokerKeepAliveTimer) {
    return;
  }
  clearInterval(kickBrokerKeepAliveTimer);
  kickBrokerKeepAliveTimer = null;
};

function bringAppToFrontAfterOAuth() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  }
  if (app.isReady()) {
    app.focus({ steal: true });
  }
}

const openAuthInBrowser = (
  authUrl: string,
  redirectUri: string,
  expectedState?: string,
  timeoutMs = AUTH_CALLBACK_TIMEOUT_MS,
) =>
  openLoopbackAuthInBrowser(authUrl, redirectUri, {
    timeoutMs,
    expectedState,
    onComplete: bringAppToFrontAfterOAuth,
  });

const attemptTikTokBrowserSignIn = () => {
  // Best effort only: TikTok LIVE auth for this app is cookie-based and must complete in the app auth session.
  void shell.openExternal(TIKTOK_LOGIN_URL).catch(() => {
    // no-op
  });
};

const parseKickUserName = (response: unknown): string | undefined => {
  if (!response || typeof response !== "object") return undefined;

  const maybeData = (response as { data?: unknown }).data;
  const user = Array.isArray(maybeData) ? maybeData[0] : maybeData;

  if (!user || typeof user !== "object") return undefined;
  const record = user as Record<string, unknown>;

  if (typeof record.username === "string" && record.username.length > 0)
    return record.username;
  if (typeof record.name === "string" && record.name.length > 0)
    return record.name;
  if (typeof record.slug === "string" && record.slug.length > 0)
    return record.slug;

  return undefined;
};

const hydrateAccountIdentityFromStoredTokens = async (
  settingsStore: JsonSettingsStore,
) => {
  const updates: Partial<AppSettings> = {};

  const twitchToken = settingsStore.get("twitchToken")?.trim() ?? "";
  const twitchUsername = settingsStore.get("twitchUsername")?.trim() ?? "";
  if (twitchToken && !twitchUsername) {
    try {
      const response = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: {
          Authorization: `OAuth ${twitchToken}`,
        },
      });
      const payload = await fetchJsonOrThrow<{ login?: string }>(
        response,
        "Twitch token validation",
      );
      const login = payload.login?.trim() ?? "";
      if (login) {
        updates.twitchUsername = login;
        updates.twitchGuest = false;
      }
    } catch (error) {
      console.warn(
        "[auth] unable to restore Twitch username from stored token",
        error,
      );
    }
  }

  const kickAccessToken = settingsStore.get("kickAccessToken")?.trim() ?? "";
  const kickUsername = settingsStore.get("kickUsername")?.trim() ?? "";
  if (kickAccessToken && !kickUsername) {
    try {
      const response = await fetch("https://api.kick.com/public/v1/users", {
        headers: {
          Authorization: `Bearer ${kickAccessToken}`,
          Accept: "application/json",
        },
      });
      const payload = await fetchJsonOrThrow<unknown>(
        response,
        "Kick user profile",
      );
      const restoredKickUsername = parseKickUserName(payload)?.trim() ?? "";
      if (restoredKickUsername) {
        updates.kickUsername = restoredKickUsername;
        updates.kickGuest = false;
      }
    } catch (error) {
      console.warn(
        "[auth] unable to restore Kick username from stored token",
        error,
      );
    }
  }

  if (Object.keys(updates).length > 0) {
    settingsStore.set(updates);
  }
};

const migrateLegacyOAuthClientSecretsFromSettings = async (
  settingsStore: JsonSettingsStore,
) => {
  const rawState = settingsStore.store as Record<string, unknown>;
  const legacyKickClientSecret =
    typeof rawState.kickClientSecret === "string"
      ? rawState.kickClientSecret.trim()
      : "";
  const legacyYouTubeClientSecret =
    typeof rawState.youtubeClientSecret === "string"
      ? rawState.youtubeClientSecret.trim()
      : "";

  if (
    legacyKickClientSecret &&
    !(process.env.KICK_CLIENT_SECRET ?? KICK_MANAGED_CLIENT_SECRET).trim()
  ) {
    const existingKickClientSecret = await getOAuthClientSecret("kick");
    if (!existingKickClientSecret?.trim()) {
      await storeOAuthClientSecret("kick", legacyKickClientSecret);
    }
  }

  if (
    legacyYouTubeClientSecret &&
    !(process.env.YOUTUBE_CLIENT_SECRET ?? YOUTUBE_MANAGED_CLIENT_SECRET).trim()
  ) {
    const existingYouTubeClientSecret = await getOAuthClientSecret("youtube");
    if (!existingYouTubeClientSecret?.trim()) {
      await storeOAuthClientSecret("youtube", legacyYouTubeClientSecret);
    }
  }

  if (legacyKickClientSecret || legacyYouTubeClientSecret) {
    settingsStore.removeKeys(["kickClientSecret", "youtubeClientSecret"]);
  }
};

const formatUpdaterErrorMessage = (errorText: string) => {
  const lower = errorText.toLowerCase();
  if (
    lower.includes("eperm") &&
    lower.includes("operation not permitted") &&
    lower.includes("rename") &&
    lower.includes("updater")
  ) {
    return "Updater could not replace its pending installer file. Close Chatrix, delete the updater cache folder in %LOCALAPPDATA%, and reopen the app to retry.";
  }
  if (
    lower.includes("code signature") ||
    lower.includes("code requirement") ||
    lower.includes("shipit") ||
    lower.includes("did not pass validation")
  ) {
    return LEGACY_SIGNATURE_UPDATE_MESSAGE;
  }
  return `Updater error: ${errorText}`;
};

const assertYouTubeAlphaEnabled = () => {
  if (!YOUTUBE_ALPHA_ENABLED) {
    throw new Error(YOUTUBE_ALPHA_DISABLED_MESSAGE);
  }
};

const assertTikTokAlphaEnabled = () => {
  if (!TIKTOK_ALPHA_ENABLED) {
    throw new Error(TIKTOK_ALPHA_DISABLED_MESSAGE);
  }
};

const isTikTokCookie = (cookie: Cookie) => {
  const domain = (cookie.domain ?? "").trim().toLowerCase();
  return domain.includes("tiktok.com");
};

const pickCookieValue = (cookies: Cookie[]): string => {
  const valid = cookies
    .filter(
      (cookie) =>
        isTikTokCookie(cookie) &&
        typeof cookie.value === "string" &&
        cookie.value.trim().length > 0,
    )
    .sort(
      (left, right) =>
        Number(right.expirationDate ?? 0) - Number(left.expirationDate ?? 0),
    );
  return valid[0]?.value.trim() ?? "";
};

const readTikTokAuthFromSession = async (
  authSession: Session,
): Promise<{ sessionId: string; ttTargetIdc: string } | null> => {
  const [sessionCookies, idcCookies] = await Promise.all([
    authSession.cookies.get({ name: "sessionid" }),
    authSession.cookies.get({ name: "tt-target-idc" }),
  ]);
  const sessionId = pickCookieValue(sessionCookies);
  const ttTargetIdc = pickCookieValue(idcCookies);
  if (!sessionId || !ttTargetIdc) return null;
  return { sessionId, ttTargetIdc };
};

const cookieRemovalUrl = (cookie: Cookie): string | null => {
  const rawDomain = (cookie.domain ?? "").trim();
  if (!rawDomain) return null;
  const domain = rawDomain.startsWith(".") ? rawDomain.slice(1) : rawDomain;
  if (!domain) return null;
  const pathValue = (cookie.path ?? "/").trim();
  const cookiePath = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  const protocol = cookie.secure ? "https" : "http";
  return `${protocol}://${domain}${cookiePath}`;
};

const clearTikTokAuthSession = async (authSession: Session): Promise<void> => {
  const cookies = await authSession.cookies.get({});
  const targets = cookies.filter((cookie) => isTikTokCookie(cookie));
  await Promise.allSettled(
    targets.map(async (cookie) => {
      const url = cookieRemovalUrl(cookie);
      if (!url) return;
      try {
        await authSession.cookies.remove(url, cookie.name);
      } catch {
        // best effort cleanup only
      }
    }),
  );
};

const openTikTokSignInWindow = async (): Promise<{
  sessionId: string;
  ttTargetIdc: string;
}> => {
  const authSession = session.fromPartition(TIKTOK_AUTH_PARTITION);
  const existing = await readTikTokAuthFromSession(authSession);
  if (existing) return existing;

  return new Promise((resolve, reject) => {
    let settled = false;
    const authWindow = new BrowserWindow({
      width: 520,
      height: 780,
      minWidth: 420,
      minHeight: 620,
      autoHideMenuBar: true,
      show: false,
      title: "Sign in to TikTok",
      parent: mainWindow ?? undefined,
      modal: Boolean(mainWindow),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: TIKTOK_AUTH_PARTITION,
      },
    });

    const onCookieChanged = (_event: unknown, cookie: Cookie) => {
      if (!isTikTokCookie(cookie)) return;
      if (cookie.name !== "sessionid" && cookie.name !== "tt-target-idc")
        return;
      void tryCaptureAuthCookies();
    };

    const onDidChangeNavigation = () => {
      void tryCaptureAuthCookies();
    };

    const onReadyToShow = () => {
      if (!authWindow.isDestroyed()) authWindow.show();
    };

    const onClosed = () => {
      if (settled) return;
      finish(undefined, new Error(TIKTOK_SIGN_IN_CANCELLED_MESSAGE));
    };

    const timeout = setTimeout(() => {
      finish(undefined, new Error(TIKTOK_SIGN_IN_TIMEOUT_MESSAGE));
      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }
    }, TIKTOK_AUTH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      authSession.cookies.removeListener("changed", onCookieChanged);
      authWindow.removeListener("ready-to-show", onReadyToShow);
      authWindow.removeListener("closed", onClosed);
      authWindow.webContents.removeListener(
        "did-finish-load",
        onDidChangeNavigation,
      );
      authWindow.webContents.removeListener(
        "did-navigate",
        onDidChangeNavigation,
      );
      authWindow.webContents.removeListener(
        "did-navigate-in-page",
        onDidChangeNavigation,
      );
    };

    const finish = (
      result?: { sessionId: string; ttTargetIdc: string },
      error?: Error,
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      bringAppToFrontAfterOAuth();
      if (error) {
        reject(error);
        return;
      }
      if (!result) {
        reject(new Error(TIKTOK_SIGN_IN_CANCELLED_MESSAGE));
        return;
      }
      resolve(result);
    };

    const tryCaptureAuthCookies = async () => {
      try {
        const credentials = await readTikTokAuthFromSession(authSession);
        if (!credentials) return;
        finish(credentials);
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
      } catch {
        // keep auth flow alive and let user retry in window
      }
    };

    authSession.cookies.on("changed", onCookieChanged);
    authWindow.webContents.on("did-finish-load", onDidChangeNavigation);
    authWindow.webContents.on("did-navigate", onDidChangeNavigation);
    authWindow.webContents.on("did-navigate-in-page", onDidChangeNavigation);
    authWindow.once("ready-to-show", onReadyToShow);
    authWindow.once("closed", onClosed);
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });

    void authWindow.loadURL(TIKTOK_LOGIN_URL).catch((error) => {
      const text = error instanceof Error ? error.message : String(error);
      finish(undefined, new Error(`Failed to open TikTok sign-in: ${text}`));
    });
  });
};

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const asString = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
};

const normalizeTikTokChannel = (input: string) =>
  input.trim().replace(/^@+/, "").toLowerCase();

const isLikelyTikTokOfflineError = (value: string) => {
  const text = value.toLowerCase();
  if (!text.trim()) return false;
  return (
    text.includes("offline") ||
    text.includes("not live") ||
    text.includes("live has ended") ||
    text.includes("no active live") ||
    text.includes("failed to retrieve room id") ||
    text.includes("room id not found") ||
    text.includes("room not found") ||
    text.includes("channel is offline")
  );
};

type NormalizedTikTokChatMessage = {
  id: string;
  platform: "tiktok";
  channel: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: string;
  badges?: string[];
  color?: string;
  raw?: Record<string, unknown>;
};

type TikTokConnection = {
  connect: () => Promise<
    { roomId?: string | number } | Record<string, unknown>
  >;
  disconnect: () => Promise<void>;
  sendMessage?: (content: string) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeAllListeners?: (...args: unknown[]) => void;
};

type TikTokConnectionRecord = {
  connectionId: string;
  channel: string;
  roomId?: string;
  connection: TikTokConnection;
};

const parseTikTokBadges = (rawBadges: unknown): string[] => {
  if (!Array.isArray(rawBadges)) return [];
  const parsed: string[] = [];
  for (const badge of rawBadges) {
    const asText = asString(badge).trim();
    if (asText) {
      parsed.push(asText);
      continue;
    }
    const record = asUnknownRecord(badge);
    const type = asString(record?.type).trim();
    const name = asString(record?.name).trim();
    const title = asString(record?.title).trim();
    const value = type || name || title;
    if (value) parsed.push(value);
  }
  return parsed;
};

const normalizeTikTokChatMessage = (
  channel: string,
  payload: unknown,
): NormalizedTikTokChatMessage | null => {
  const record = asUnknownRecord(payload);
  if (!record) return null;

  const comment =
    asString(record.comment).trim() || asString(record.message).trim();
  if (!comment) return null;

  const user = asUnknownRecord(record.user) ?? {};
  const username =
    asString(user.uniqueId).trim() ||
    asString(user.username).trim() ||
    "tiktok-user";
  const displayName =
    asString(user.nickname).trim() ||
    asString(user.displayName).trim() ||
    username;
  const messageId =
    asString(record.msgId).trim() ||
    asString(record.messageId).trim() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const createdEpochRaw = Number(asString(record.createTime));
  const createdEpochMillis =
    Number.isFinite(createdEpochRaw) && createdEpochRaw > 0
      ? createdEpochRaw < 1_000_000_000_000
        ? createdEpochRaw * 1000
        : createdEpochRaw
      : 0;
  const createdAt =
    createdEpochMillis > 0
      ? new Date(createdEpochMillis).toISOString()
      : new Date().toISOString();

  const color =
    asString(user.nameColor).trim() || asString(user.color).trim() || undefined;
  const badges = parseTikTokBadges(user.badges);

  return {
    id: messageId,
    platform: "tiktok",
    channel,
    username,
    displayName,
    message: comment,
    timestamp: createdAt,
    badges: badges.length > 0 ? badges : undefined,
    color,
    raw: record,
  };
};

const normalizeTikTokFollowMessage = (
  channel: string,
  payload: unknown,
): NormalizedTikTokChatMessage | null => {
  const record = asUnknownRecord(payload);
  if (!record) return null;

  const user = asUnknownRecord(record.user) ?? {};
  const username =
    asString(user.uniqueId).trim() ||
    asString(user.username).trim() ||
    "tiktok-user";
  const displayName =
    asString(user.nickname).trim() ||
    asString(user.displayName).trim() ||
    username;
  const messageId =
    asString(record.msgId).trim() ||
    asString(record.messageId).trim() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdEpochRaw = Number(asString(record.createTime));
  const createdEpochMillis =
    Number.isFinite(createdEpochRaw) && createdEpochRaw > 0
      ? createdEpochRaw < 1_000_000_000_000
        ? createdEpochRaw * 1000
        : createdEpochRaw
      : 0;
  const createdAt =
    createdEpochMillis > 0
      ? new Date(createdEpochMillis).toISOString()
      : new Date().toISOString();

  return {
    id: messageId,
    platform: "tiktok",
    channel,
    username,
    displayName,
    message: `${displayName} followed`,
    timestamp: createdAt,
    raw: {
      ...record,
      eventType: "follow",
    },
  };
};

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const parseKickChatroomId = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const chatroom = record.chatroom;
  if (chatroom && typeof chatroom === "object") {
    const chatroomId = parsePositiveInteger(
      (chatroom as Record<string, unknown>).id,
    );
    if (chatroomId) return chatroomId;
  }

  const directChatroomId = parsePositiveInteger(record.chatroom_id);
  if (directChatroomId) return directChatroomId;

  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      const nested = parseKickChatroomId(item);
      if (nested) return nested;
    }
  } else if (record.data && typeof record.data === "object") {
    const nested = parseKickChatroomId(record.data);
    if (nested) return nested;
  }

  return null;
};

const parseKickUserId = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  for (const direct of [
    record.broadcaster_user_id,
    record.user_id,
    record.id,
  ]) {
    const parsed = parsePositiveInteger(direct);
    if (parsed) return parsed;
  }

  const user = asUnknownRecord(record.user);
  for (const direct of [user?.id, user?.user_id]) {
    const parsed = parsePositiveInteger(direct);
    if (parsed) return parsed;
  }

  const sender = asUnknownRecord(record.sender);
  for (const direct of [sender?.id, sender?.user_id]) {
    const parsed = parsePositiveInteger(direct);
    if (parsed) return parsed;
  }

  const broadcaster = asUnknownRecord(record.broadcaster);
  for (const direct of [broadcaster?.id, broadcaster?.user_id]) {
    const parsed = parsePositiveInteger(direct);
    if (parsed) return parsed;
  }

  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      const nested = parseKickUserId(item);
      if (nested) return nested;
    }
  } else if (record.data && typeof record.data === "object") {
    const nested = parseKickUserId(record.data);
    if (nested) return nested;
  }

  return null;
};

type YouTubeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type KickOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
};

type YouTubeChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
  }>;
};

type YouTubeSearchChannelsResponse = {
  items?: Array<{
    id?: {
      channelId?: string;
      videoId?: string;
    };
    snippet?: {
      channelTitle?: string;
      title?: string;
    };
  }>;
};

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      channelTitle?: string;
      title?: string;
    };
    liveStreamingDetails?: {
      activeLiveChatId?: string;
    };
  }>;
};

type YouTubeWebChatSession = {
  liveChatId: string;
  channelId: string;
  channelTitle: string;
  videoId: string;
  apiKey: string;
  clientVersion: string;
  visitorData?: string;
  continuation: string;
  updatedAt: number;
};

const normalizeYouTubeInput = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    }
    if (host.includes("youtube.com")) {
      const watchId = parsed.searchParams.get("v")?.trim() ?? "";
      if (watchId) return watchId;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1]) return parts[1].replace(/^@/, "");
      if (parts[0] === "c" && parts[1]) return parts[1].replace(/^@/, "");
      if (parts[0] === "user" && parts[1]) return parts[1].replace(/^@/, "");
      if (parts[0]?.startsWith("@")) return parts[0].slice(1);
      if ((parts[0] === "shorts" || parts[0] === "live") && parts[1])
        return parts[1];
    }
  } catch {
    // Not a URL; fall back to plain-channel parsing.
  }

  const normalized = trimmed.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
  const compact = normalized.split(/[?#]/)[0];

  if (compact.startsWith("channel/")) {
    return compact.slice("channel/".length).split("/")[0].replace(/^@/, "");
  }
  if (compact.startsWith("c/")) {
    return compact.slice("c/".length).split("/")[0].replace(/^@/, "");
  }
  if (compact.startsWith("user/")) {
    return compact.slice("user/".length).split("/")[0].replace(/^@/, "");
  }

  return compact.split("/")[0].replace(/^@/, "");
};

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const extractYouTubeVideoId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : "";
    }
    if (host.includes("youtube.com")) {
      const watchId = url.searchParams.get("v")?.trim() ?? "";
      if (YOUTUBE_VIDEO_ID_REGEX.test(watchId)) {
        return watchId;
      }
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (
        pathParts[0] === "shorts" &&
        pathParts[1] &&
        YOUTUBE_VIDEO_ID_REGEX.test(pathParts[1])
      ) {
        return pathParts[1];
      }
      if (
        pathParts[0] === "live" &&
        pathParts[1] &&
        YOUTUBE_VIDEO_ID_REGEX.test(pathParts[1])
      ) {
        return pathParts[1];
      }
    }
  } catch {
    // Input may not be a URL.
  }
  const fallbackMatch = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (fallbackMatch?.[1] && YOUTUBE_VIDEO_ID_REGEX.test(fallbackMatch[1])) {
    return fallbackMatch[1];
  }
  return "";
};

const htmlEntityDecode = (value: string) =>
  value
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u0025/g, "%")
    .replace(/\\u002f/g, "/");

const matchFromHtml = (html: string, regex: RegExp): string => {
  const match = html.match(regex);
  return typeof match?.[1] === "string"
    ? htmlEntityDecode(match[1]).trim()
    : "";
};

const parseYouTubeTextRuns = (runs: unknown): string => {
  if (!Array.isArray(runs)) return "";
  return runs
    .map((entry) => {
      const record = asUnknownRecord(entry);
      const text = asString(record?.text);
      if (text) return text;
      const emoji = asUnknownRecord(record?.emoji);
      const shortcuts = Array.isArray(emoji?.shortcuts) ? emoji?.shortcuts : [];
      const shortcut = shortcuts.find((item) => typeof item === "string");
      return typeof shortcut === "string" ? shortcut : "";
    })
    .join("");
};

const parseYouTubeAuthorBadges = (
  badges: unknown,
): {
  isChatOwner?: boolean;
  isChatModerator?: boolean;
  isChatSponsor?: boolean;
} => {
  if (!Array.isArray(badges)) return {};
  let isChatOwner = false;
  let isChatModerator = false;
  let isChatSponsor = false;

  for (const badge of badges) {
    const record = asUnknownRecord(badge);
    const renderer = asUnknownRecord(record?.liveChatAuthorBadgeRenderer);
    if (!renderer) continue;
    const icon = asUnknownRecord(renderer.icon);
    const iconType = asString(icon?.iconType).toLowerCase();
    const tooltip = asString(renderer.tooltip).toLowerCase();

    if (
      iconType.includes("owner") ||
      iconType.includes("broadcaster") ||
      tooltip.includes("owner") ||
      tooltip.includes("broadcaster")
    ) {
      isChatOwner = true;
      isChatModerator = true;
    } else if (
      iconType.includes("moderator") ||
      tooltip.includes("moderator")
    ) {
      isChatModerator = true;
    }

    if (
      iconType.includes("member") ||
      iconType.includes("sponsor") ||
      tooltip.includes("member") ||
      tooltip.includes("sponsor")
    ) {
      isChatSponsor = true;
    }
  }

  return { isChatOwner, isChatModerator, isChatSponsor };
};

const normalizeYouTubeWebActions = (
  actions: unknown,
): Array<{
  id: string;
  snippet: { displayMessage: string; publishedAt: string };
  authorDetails: {
    channelId: string;
    displayName: string;
    isChatModerator?: boolean;
    isChatOwner?: boolean;
    isChatSponsor?: boolean;
  };
}> => {
  if (!Array.isArray(actions)) return [];
  const items: Array<{
    id: string;
    snippet: { displayMessage: string; publishedAt: string };
    authorDetails: {
      channelId: string;
      displayName: string;
      isChatModerator?: boolean;
      isChatOwner?: boolean;
      isChatSponsor?: boolean;
    };
  }> = [];

  for (const action of actions) {
    const record = asUnknownRecord(action);
    const addChatItem = asUnknownRecord(record?.addChatItemAction);
    const item = asUnknownRecord(addChatItem?.item);
    const renderer = asUnknownRecord(item?.liveChatTextMessageRenderer);
    if (!renderer) continue;

    const id = asString(renderer.id).trim();
    const message = parseYouTubeTextRuns(
      asUnknownRecord(renderer.message)?.runs,
    );
    if (!id || !message) continue;

    const authorName =
      asString(asUnknownRecord(renderer.authorName)?.simpleText).trim() ||
      "YouTube user";
    const channelId = asString(renderer.authorExternalChannelId).trim();
    const timestampUsecRaw = Number(asString(renderer.timestampUsec));
    const publishedAt =
      Number.isFinite(timestampUsecRaw) && timestampUsecRaw > 0
        ? new Date(Math.floor(timestampUsecRaw / 1000)).toISOString()
        : new Date().toISOString();
    const badges = parseYouTubeAuthorBadges(renderer.authorBadges);

    items.push({
      id,
      snippet: {
        displayMessage: message,
        publishedAt,
      },
      authorDetails: {
        channelId,
        displayName: authorName,
        ...badges,
      },
    });
  }

  return items;
};

const extractYouTubeWebContinuation = (
  payload: unknown,
): { continuation?: string; pollingIntervalMillis?: number } => {
  const root = asUnknownRecord(payload);
  const continuationContents = asUnknownRecord(root?.continuationContents);
  const liveChatContinuation = asUnknownRecord(
    continuationContents?.liveChatContinuation,
  );
  const continuations = Array.isArray(liveChatContinuation?.continuations)
    ? liveChatContinuation.continuations
    : [];

  for (const entry of continuations) {
    const record = asUnknownRecord(entry);
    const timed = asUnknownRecord(record?.timedContinuationData);
    if (timed) {
      const continuation = asString(timed.continuation).trim();
      const timeoutMs = Number(asString(timed.timeoutMs));
      return {
        continuation: continuation || undefined,
        pollingIntervalMillis:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.max(1000, Math.min(15000, timeoutMs))
            : undefined,
      };
    }
    const invalidation = asUnknownRecord(record?.invalidationContinuationData);
    if (invalidation) {
      const continuation = asString(invalidation.continuation).trim();
      const timeoutMs = Number(asString(invalidation.invalidationTimeoutMs));
      return {
        continuation: continuation || undefined,
        pollingIntervalMillis:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.max(1000, Math.min(15000, timeoutMs))
            : undefined,
      };
    }
    const reload = asUnknownRecord(record?.reloadContinuationData);
    if (reload) {
      const continuation = asString(reload.continuation).trim();
      return { continuation: continuation || undefined };
    }
  }
  return {};
};

const cleanupYouTubeWebSessions = () => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [key, session] of youtubeWebChatSessions.entries()) {
    if (session.updatedAt < cutoff) {
      youtubeWebChatSessions.delete(key);
    }
  }
};

const buildYouTubeLiveUrl = (rawInput: string) => {
  const directVideoId = extractYouTubeVideoId(rawInput);
  if (directVideoId) {
    return `https://www.youtube.com/watch?v=${directVideoId}`;
  }
  const normalized = normalizeYouTubeInput(rawInput);
  if (!normalized) {
    throw new Error("YouTube channel is required.");
  }
  if (normalized.startsWith("UC")) {
    return `https://www.youtube.com/channel/${normalized}/live`;
  }
  return `https://www.youtube.com/@${normalized}/live`;
};

const fetchYouTubeHtml = async (url: string, source: string) => {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`${source} failed (${response.status}).`);
  }
  return {
    html: await response.text(),
    finalUrl: response.url,
  };
};

const findYouTubeLiveVideoViaSearch = async (
  rawInput: string,
): Promise<string> => {
  const query = normalizeYouTubeInput(rawInput) || rawInput.trim();
  if (!query) return "";
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgJAAQ%253D%253D`;
  const { html } = await fetchYouTubeHtml(
    searchUrl,
    "YouTube live search lookup",
  );
  const fromVideoId = matchFromHtml(html, /"videoId":"([A-Za-z0-9_-]{11})"/);
  if (fromVideoId && YOUTUBE_VIDEO_ID_REGEX.test(fromVideoId)) {
    return fromVideoId;
  }
  const fromWatchLink = matchFromHtml(
    html,
    /"url":"\\\/watch\?v=([A-Za-z0-9_-]{11})/,
  );
  if (fromWatchLink && YOUTUBE_VIDEO_ID_REGEX.test(fromWatchLink)) {
    return fromWatchLink;
  }
  return "";
};

const resolveYouTubeLiveChatViaWeb = async (rawInput: string) => {
  cleanupYouTubeWebSessions();
  const liveUrl = buildYouTubeLiveUrl(rawInput);
  let liveHtml = "";
  let liveFinalUrl = liveUrl;
  try {
    const livePage = await fetchYouTubeHtml(
      liveUrl,
      "YouTube live page lookup",
    );
    liveHtml = livePage.html;
    liveFinalUrl = livePage.finalUrl;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!text.includes("(404)")) {
      throw error;
    }
  }

  const redirectedVideoId = extractYouTubeVideoId(liveFinalUrl);
  const pageVideoId =
    redirectedVideoId ||
    matchFromHtml(
      liveHtml,
      /"canonicalBaseUrl":"\\\/watch\?v=([A-Za-z0-9_-]{11})"/,
    ) ||
    matchFromHtml(liveHtml, /"videoId":"([A-Za-z0-9_-]{11})"/) ||
    (await findYouTubeLiveVideoViaSearch(rawInput));
  if (!pageVideoId) {
    throw new Error(`No active live stream found for ${rawInput}.`);
  }

  const watchUrl = `https://www.youtube.com/watch?v=${pageVideoId}`;
  const watchHtml =
    liveFinalUrl.includes("/watch") &&
    redirectedVideoId === pageVideoId &&
    liveHtml
      ? liveHtml
      : (await fetchYouTubeHtml(watchUrl, "YouTube watch page lookup")).html;

  const apiKey = matchFromHtml(watchHtml, /"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVersion = matchFromHtml(
    watchHtml,
    /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/,
  );
  const visitorData = matchFromHtml(watchHtml, /"VISITOR_DATA":"([^"]+)"/);
  const continuation =
    matchFromHtml(
      watchHtml,
      /"reloadContinuationData":\{"continuation":"([^"]+)"/,
    ) ||
    matchFromHtml(
      watchHtml,
      /"timedContinuationData":\{"timeoutMs":[0-9]+,"continuation":"([^"]+)"/,
    ) ||
    matchFromHtml(
      watchHtml,
      /"invalidationContinuationData":\{"invalidationId":"[^"]+","invalidationTimeoutMs":[0-9]+,"continuation":"([^"]+)"/,
    );
  const channelId = matchFromHtml(watchHtml, /"channelId":"(UC[^"]+)"/);
  const channelTitle =
    matchFromHtml(watchHtml, /"ownerChannelName":"([^"]+)"/) ||
    matchFromHtml(watchHtml, /<meta property="og:title" content="([^"]+)"/) ||
    normalizeYouTubeInput(rawInput);

  if (!apiKey || !clientVersion || !continuation) {
    throw new Error(
      "YouTube read-only web fallback could not extract live chat metadata for this stream.",
    );
  }

  const liveChatId = `web:${pageVideoId}`;
  youtubeWebChatSessions.set(liveChatId, {
    liveChatId,
    channelId: channelId || normalizeYouTubeInput(rawInput),
    channelTitle,
    videoId: pageVideoId,
    apiKey,
    clientVersion,
    visitorData: visitorData || undefined,
    continuation,
    updatedAt: Date.now(),
  });

  return {
    channelId: channelId || normalizeYouTubeInput(rawInput),
    channelTitle,
    videoId: pageVideoId,
    liveChatId,
  };
};

const fetchYouTubeWebLiveMessages = async (payload: {
  liveChatId: string;
  pageToken?: string;
}) => {
  cleanupYouTubeWebSessions();
  const session = youtubeWebChatSessions.get(payload.liveChatId);
  if (!session) {
    throw new Error(
      "YouTube web chat session expired. Re-open the YouTube tab.",
    );
  }

  const continuation = (
    payload.pageToken?.trim() || session.continuation
  ).trim();
  if (!continuation) {
    throw new Error("YouTube web chat continuation token is missing.");
  }

  const endpoint = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false&key=${encodeURIComponent(session.apiKey)}`;
  const body: Record<string, unknown> = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: session.clientVersion,
        hl: "en",
        gl: "US",
        ...(session.visitorData ? { visitorData: session.visitorData } : {}),
      },
    },
    continuation,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://www.youtube.com",
      Referer: `https://www.youtube.com/watch?v=${session.videoId}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`YouTube web chat polling failed (${response.status}).`);
  }
  const parsed = (await response.json()) as unknown;
  const root = asUnknownRecord(parsed);
  const liveChatContinuation = asUnknownRecord(
    asUnknownRecord(root?.continuationContents)?.liveChatContinuation,
  );
  const actions = liveChatContinuation?.actions;
  const normalizedItems = normalizeYouTubeWebActions(actions);
  const continuationInfo = extractYouTubeWebContinuation(parsed);
  if (continuationInfo.continuation) {
    session.continuation = continuationInfo.continuation;
  }
  session.updatedAt = Date.now();
  youtubeWebChatSessions.set(payload.liveChatId, session);

  return {
    nextPageToken: continuationInfo.continuation ?? session.continuation,
    pollingIntervalMillis: continuationInfo.pollingIntervalMillis ?? 3000,
    items: normalizedItems,
  };
};

const youtubeConfig = async () => ({
  clientId: store.get("youtubeClientId")?.trim() ?? "",
  clientSecret: await getYouTubeClientSecret(),
  redirectUri:
    store.get("youtubeRedirectUri")?.trim() || YOUTUBE_DEFAULT_REDIRECT_URI,
});

const decodeJwtExp = (token: string): number | null => {
  const raw = token.trim();
  if (!raw.includes(".")) return null;
  const [, payload] = raw.split(".");
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { exp?: unknown };
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp))
      return null;
    return Math.max(0, parsed.exp * 1000);
  } catch {
    return null;
  }
};

const testTwitchPermissions = async (): Promise<AuthPermissionSnapshot> => {
  const now = Date.now();
  const token = store.get("twitchToken")?.trim() ?? "";
  const username = store.get("twitchUsername")?.trim() ?? "";
  const authConfigured = Boolean(store.get("twitchClientId")?.trim());
  const signedIn = token.length > 0;
  if (!signedIn) {
    return {
      platform: "twitch",
      signedIn: false,
      username,
      canSend: false,
      canModerate: false,
      authConfigured,
      readOnlyAvailable: true,
      tokenExpiry: null,
      lastCheckedAt: now,
    };
  }

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Authorization: `OAuth ${token}`,
      },
    });
    const payload = await fetchJsonOrThrow<{
      login?: string;
      expires_in?: number;
      scopes?: unknown;
    }>(response, "Twitch token validation");
    const expiresIn =
      typeof payload.expires_in === "number" ? payload.expires_in : 0;
    const scopes = new Set(
      Array.isArray(payload.scopes)
        ? payload.scopes.filter(
            (scope): scope is string => typeof scope === "string",
          )
        : [],
    );
    return {
      platform: "twitch",
      signedIn: true,
      username: payload.login?.trim() || username,
      canSend: true,
      canModerate:
        scopes.has("moderator:manage:banned_users") &&
        scopes.has("moderator:manage:chat_messages"),
      authConfigured,
      readOnlyAvailable: true,
      tokenExpiry: expiresIn > 0 ? now + expiresIn * 1000 : null,
      lastCheckedAt: now,
    };
  } catch (error) {
    return {
      platform: "twitch",
      signedIn: true,
      username,
      canSend: false,
      canModerate: false,
      authConfigured,
      readOnlyAvailable: true,
      tokenExpiry: null,
      lastCheckedAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const testKickPermissions = async (): Promise<AuthPermissionSnapshot> => {
  const now = Date.now();
  const token = store.get("kickAccessToken")?.trim() ?? "";
  const username = store.get("kickUsername")?.trim() ?? "";
  const authConfigured = Boolean(
    store.get("kickClientId")?.trim() &&
    ((await getKickClientSecret()) || getKickTokenBrokerConfig()),
  );
  const signedIn = token.length > 0;
  if (!signedIn) {
    return {
      platform: "kick",
      signedIn: false,
      username,
      canSend: false,
      canModerate: false,
      authConfigured,
      readOnlyAvailable: true,
      tokenExpiry: null,
      lastCheckedAt: now,
    };
  }

  try {
    const response = await fetch("https://api.kick.com/public/v1/users", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    await fetchJsonOrThrow<unknown>(response, "Kick user profile");
    return {
      platform: "kick",
      signedIn: true,
      username,
      canSend: true,
      canModerate: false,
      authConfigured,
      readOnlyAvailable: true,
      tokenExpiry: decodeJwtExp(token),
      lastCheckedAt: now,
    };
  } catch (error) {
    return {
      platform: "kick",
      signedIn: true,
      username,
      canSend: false,
      canModerate: false,
      authConfigured,
      readOnlyAvailable: true,
      tokenExpiry: decodeJwtExp(token),
      lastCheckedAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const getAuthHealthSnapshot = async (): Promise<AuthHealthSnapshot> => {
  const [twitch, kick] = await Promise.all([
    testTwitchPermissions(),
    testKickPermissions(),
  ]);
  const youtubeTokenExpiry = Number(store.get("youtubeTokenExpiry") ?? 0);
  return {
    twitch,
    kick,
    youtubeTokenExpiry:
      Number.isFinite(youtubeTokenExpiry) && youtubeTokenExpiry > 0
        ? youtubeTokenExpiry
        : null,
    updateChannel: resolveConfiguredUpdateChannel(),
  };
};

const refreshKickAccessToken = async (): Promise<string> => {
  const clientId = store.get("kickClientId")?.trim() ?? "";
  const clientSecret = await getKickClientSecret();
  const kickTokenBrokerConfig = getKickTokenBrokerConfig();
  const refreshToken = store.get("kickRefreshToken")?.trim() ?? "";
  if (!clientId || !refreshToken) {
    throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
  }

  let tokens: KickOAuthTokenResponse;
  try {
    if (kickTokenBrokerConfig) {
      await ensureKickTokenBrokerReady();
      const response = await fetch(kickTokenBrokerConfig.refreshUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          refreshToken,
          clientId,
        }),
      });
      tokens = await fetchJsonOrThrow<KickOAuthTokenResponse>(
        response,
        "Kick broker token refresh",
      );
    } else {
      if (!clientSecret) {
        throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
      }
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      tokenParams.set("client_secret", clientSecret);
      const response = await fetch("https://id.kick.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenParams,
      });
      tokens = await fetchJsonOrThrow<KickOAuthTokenResponse>(
        response,
        "Kick token refresh",
      );
    }
  } catch {
    throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
  }

  const accessToken = tokens.access_token?.trim() ?? "";
  if (!accessToken) {
    throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
  }

  const nextRefreshToken = tokens.refresh_token?.trim() || refreshToken;
  store.set({
    kickAccessToken: accessToken,
    kickRefreshToken: nextRefreshToken,
    kickGuest: false,
  });
  await storeAuthTokens("kick", {
    accessToken,
    refreshToken: nextRefreshToken,
  });

  return accessToken;
};

const getYouTubePublicApiKey = () =>
  (store.get("youtubeApiKey")?.trim() ?? "") ||
  (process.env.YOUTUBE_API_KEY ?? YOUTUBE_MANAGED_API_KEY).trim();

const saveYouTubeTokens = async (tokens: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}) => {
  const currentRefresh = store.get("youtubeRefreshToken")?.trim() ?? "";
  const refreshToken = (tokens.refreshToken ?? currentRefresh).trim();
  const expiresIn = Number(tokens.expiresIn ?? 0);
  const expiry =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? Date.now() + Math.max(30, expiresIn - 30) * 1000
      : Date.now() + 55 * 60 * 1000;

  store.set({
    youtubeAccessToken: tokens.accessToken.trim(),
    youtubeRefreshToken: refreshToken,
    youtubeTokenExpiry: expiry,
  });
  await storeAuthTokens("youtube", {
    accessToken: tokens.accessToken.trim(),
    refreshToken,
  });
};

const refreshYouTubeAccessToken = async (): Promise<string> => {
  const { clientId, clientSecret } = await youtubeConfig();
  const refreshToken = store.get("youtubeRefreshToken")?.trim() ?? "";
  if (!clientId || !refreshToken) {
    throw new Error("YouTube sign-in required.");
  }

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (clientSecret) {
    tokenParams.set("client_secret", clientSecret);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: tokenParams,
  });
  const tokens = await fetchJsonOrThrow<YouTubeTokenResponse>(
    response,
    "YouTube token refresh",
  );
  if (!tokens.access_token) {
    throw new Error("YouTube token refresh did not return an access token.");
  }
  await saveYouTubeTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });
  return tokens.access_token;
};

const ensureYouTubeAccessToken = async (): Promise<string> => {
  const accessToken = store.get("youtubeAccessToken")?.trim() ?? "";
  const expiry = Number(store.get("youtubeTokenExpiry") ?? 0);
  if (accessToken && Number.isFinite(expiry) && expiry > Date.now() + 60_000) {
    return accessToken;
  }
  if (accessToken && !store.get("youtubeRefreshToken")) {
    return accessToken;
  }
  return refreshYouTubeAccessToken();
};

const youtubeFetchWithAuth = async (
  input: string | URL,
  init: RequestInit = {},
  allowRetry = true,
): Promise<Response> => {
  const token = await ensureYouTubeAccessToken();
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    allowRetry &&
    (store.get("youtubeRefreshToken")?.trim() ?? "").length > 0
  ) {
    await refreshYouTubeAccessToken();
    return youtubeFetchWithAuth(input, init, false);
  }
  return response;
};

const youtubeFetchReadOnly = async (
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const hasOAuthSession = Boolean(
    (store.get("youtubeAccessToken")?.trim() ?? "") ||
    (store.get("youtubeRefreshToken")?.trim() ?? ""),
  );
  if (hasOAuthSession) {
    try {
      const authedResponse = await youtubeFetchWithAuth(input, init);
      if (authedResponse.status !== 401 && authedResponse.status !== 403) {
        return authedResponse;
      }
    } catch {
      // Fall through to API-key mode.
    }
  }

  const apiKey = getYouTubePublicApiKey();
  if (!apiKey) {
    throw new Error(YOUTUBE_READONLY_UNAVAILABLE_MESSAGE);
  }

  const url = new URL(typeof input === "string" ? input : input.toString());
  if (!url.searchParams.get("key")) {
    url.searchParams.set("key", apiKey);
  }

  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
  });
};

const parseYouTubeChannelFromInput = async (
  rawInput: string,
): Promise<{ channelId: string; channelTitle: string }> => {
  const input = normalizeYouTubeInput(rawInput);
  if (!input) {
    throw new Error("YouTube channel is required.");
  }

  if (input.startsWith("UC") && input.length >= 20) {
    const byId = new URL("https://www.googleapis.com/youtube/v3/channels");
    byId.searchParams.set("part", "snippet");
    byId.searchParams.set("id", input);
    byId.searchParams.set("maxResults", "1");
    const response = await youtubeFetchReadOnly(byId);
    const payload = await fetchJsonOrThrow<YouTubeChannelsResponse>(
      response,
      "YouTube channel lookup",
    );
    const first = Array.isArray(payload.items) ? payload.items[0] : undefined;
    if (first?.id) {
      return {
        channelId: first.id,
        channelTitle: first.snippet?.title?.trim() || input,
      };
    }
  }

  const handle = input.replace(/^@/, "");
  if (handle) {
    const byHandle = new URL("https://www.googleapis.com/youtube/v3/channels");
    byHandle.searchParams.set("part", "snippet");
    byHandle.searchParams.set("forHandle", handle);
    byHandle.searchParams.set("maxResults", "1");
    const response = await youtubeFetchReadOnly(byHandle);
    const payload = await fetchJsonOrThrow<YouTubeChannelsResponse>(
      response,
      "YouTube handle lookup",
    );
    const first = Array.isArray(payload.items) ? payload.items[0] : undefined;
    if (first?.id) {
      return {
        channelId: first.id,
        channelTitle: first.snippet?.title?.trim() || handle,
      };
    }
  }

  const search = new URL("https://www.googleapis.com/youtube/v3/search");
  search.searchParams.set("part", "snippet");
  search.searchParams.set("type", "channel");
  search.searchParams.set("q", input);
  search.searchParams.set("maxResults", "1");
  const response = await youtubeFetchReadOnly(search);
  const payload = await fetchJsonOrThrow<YouTubeSearchChannelsResponse>(
    response,
    "YouTube channel search",
  );
  const first = Array.isArray(payload.items) ? payload.items[0] : undefined;
  const channelId = first?.id?.channelId?.trim();
  if (!channelId) {
    throw new Error(`YouTube channel "${rawInput}" was not found.`);
  }
  return {
    channelId,
    channelTitle:
      first?.snippet?.channelTitle?.trim() ||
      first?.snippet?.title?.trim() ||
      rawInput,
  };
};

const resolveYouTubeLiveChat = async (rawInput: string) => {
  const directVideoId = extractYouTubeVideoId(rawInput);
  if (directVideoId) {
    // Direct video links/IDs are most reliable via web fallback and avoid channel lookup mismatches.
    return resolveYouTubeLiveChatViaWeb(rawInput);
  }

  const hasOAuthSession = Boolean(
    (store.get("youtubeAccessToken")?.trim() ?? "") ||
    (store.get("youtubeRefreshToken")?.trim() ?? ""),
  );
  const hasApiKey = Boolean(getYouTubePublicApiKey());
  const canUseDataApi = hasOAuthSession || hasApiKey;

  if (!canUseDataApi) {
    return resolveYouTubeLiveChatViaWeb(rawInput);
  }

  try {
    const channel = await parseYouTubeChannelFromInput(rawInput);

    const liveSearch = new URL("https://www.googleapis.com/youtube/v3/search");
    liveSearch.searchParams.set("part", "snippet");
    liveSearch.searchParams.set("channelId", channel.channelId);
    liveSearch.searchParams.set("eventType", "live");
    liveSearch.searchParams.set("type", "video");
    liveSearch.searchParams.set("maxResults", "1");
    liveSearch.searchParams.set("order", "date");
    const searchResponse = await youtubeFetchReadOnly(liveSearch);
    const searchPayload = await fetchJsonOrThrow<YouTubeSearchChannelsResponse>(
      searchResponse,
      "YouTube live stream lookup",
    );
    const firstVideo = Array.isArray(searchPayload.items)
      ? searchPayload.items[0]
      : undefined;
    const videoId = firstVideo?.id?.videoId?.trim() ?? "";
    if (!videoId) {
      throw new Error(
        `No active live stream found for ${channel.channelTitle}.`,
      );
    }

    const videoDetails = new URL(
      "https://www.googleapis.com/youtube/v3/videos",
    );
    videoDetails.searchParams.set("part", "liveStreamingDetails,snippet");
    videoDetails.searchParams.set("id", videoId);
    const videoResponse = await youtubeFetchReadOnly(videoDetails);
    const videoPayload = await fetchJsonOrThrow<YouTubeVideosResponse>(
      videoResponse,
      "YouTube live chat lookup",
    );
    const video = Array.isArray(videoPayload.items)
      ? videoPayload.items[0]
      : undefined;
    const liveChatId =
      video?.liveStreamingDetails?.activeLiveChatId?.trim() ?? "";
    if (!liveChatId) {
      throw new Error(
        `Live chat is not available for the current stream on ${channel.channelTitle}.`,
      );
    }

    return {
      channelId: channel.channelId,
      channelTitle:
        video?.snippet?.channelTitle?.trim() || channel.channelTitle,
      videoId,
      liveChatId,
    };
  } catch (primaryError) {
    try {
      return await resolveYouTubeLiveChatViaWeb(rawInput);
    } catch (fallbackError) {
      const primaryText =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      const fallbackText =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      throw new Error(
        `${primaryText} (web fallback also failed: ${fallbackText})`,
      );
    }
  }
};

type KickLookupResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  message: string;
};

const parseUnknownJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

const resolveKickChannelViaHttp = async (
  slug: string,
): Promise<KickLookupResult> => {
  const response = await fetch(
    `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`,
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: `https://kick.com/${slug}`,
      },
    },
  );

  const text = await response.text();
  const payload = text ? parseUnknownJson(text) : {};
  const message =
    payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).message === "string"
      ? ((payload as Record<string, unknown>).message as string)
      : `Kick lookup failed (${response.status}).`;

  return {
    ok: response.ok,
    status: response.status,
    payload,
    message,
  };
};

const resolveKickChannelViaBrowser = async (
  slug: string,
): Promise<KickLookupResult> => {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      show: false,
      width: 980,
      height: 720,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;
    const finalize = (result: KickLookupResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      authWindow.removeAllListeners("closed");
      authWindow.webContents.removeAllListeners("did-finish-load");
      if (!authWindow.isDestroyed()) {
        authWindow.destroy();
      }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finalize({
        ok: false,
        status: 0,
        payload: {},
        message: "Kick browser lookup timed out.",
      });
    }, 25_000);

    authWindow.on("closed", () => {
      finalize({
        ok: false,
        status: 0,
        payload: {},
        message: "Kick browser lookup window closed before completion.",
      });
    });

    authWindow.webContents.on("did-finish-load", async () => {
      try {
        const script = `
          (async () => {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const path = ${JSON.stringify(`/api/v2/channels/${slug}`)};
            for (let attempt = 0; attempt < 8; attempt += 1) {
              try {
                const response = await fetch(path, {
                  credentials: "include",
                  headers: { Accept: "application/json, text/plain, */*" }
                });
                const text = await response.text();
                if (response.ok) {
                  return { ok: true, status: response.status, text };
                }
                if (response.status !== 403) {
                  return { ok: false, status: response.status, text };
                }
              } catch (error) {
                return { ok: false, status: 0, text: String(error) };
              }
              await sleep(1200);
            }
            return { ok: false, status: 403, text: "Request blocked by security policy." };
          })()
        `;

        const result = (await authWindow.webContents.executeJavaScript(
          script,
        )) as {
          ok?: boolean;
          status?: number;
          text?: string;
        };

        const payload = result?.text ? parseUnknownJson(result.text) : {};
        const message =
          payload &&
          typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).message === "string"
            ? ((payload as Record<string, unknown>).message as string)
            : `Kick browser lookup failed (${result?.status ?? 0}).`;

        finalize({
          ok: Boolean(result?.ok),
          status: result?.status ?? 0,
          payload,
          message,
        });
      } catch (error) {
        finalize({
          ok: false,
          status: 0,
          payload: {},
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    authWindow
      .loadURL(`https://kick.com/${encodeURIComponent(slug)}`)
      .catch((error) => {
        finalize({
          ok: false,
          status: 0,
          payload: {},
          message: `Failed to open Kick channel page: ${String(error)}`,
        });
      });
  });
};

const normalizeLogin = (value: string) =>
  value.trim().replace(/^@+/, "").toLowerCase();

const resolveKickChannelLookup = async (
  slug: string,
): Promise<KickLookupResult> => {
  let lookup = await resolveKickChannelViaHttp(slug);
  if (
    (!lookup.ok ||
      (!parseKickChatroomId(lookup.payload) &&
        !parseKickUserId(lookup.payload))) &&
    lookup.status === 403
  ) {
    lookup = await resolveKickChannelViaBrowser(slug);
  }
  return lookup;
};

type TwitchValidatePayload = {
  login?: string;
  user_id?: string;
  scopes?: unknown;
};

type TwitchAuthContext = {
  accessToken: string;
  clientId: string;
  login: string;
  userId: string;
  scopes: Set<string>;
};

const getTwitchAuthContext = async (): Promise<TwitchAuthContext> => {
  const accessToken = store.get("twitchToken")?.trim() ?? "";
  const clientId = store.get("twitchClientId")?.trim() ?? "";
  if (!accessToken || !clientId) {
    throw new Error(
      "Twitch sign-in required. Sign in again to use moderation.",
    );
  }
  const response = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: {
      Authorization: `OAuth ${accessToken}`,
    },
  });
  const payload = await fetchJsonOrThrow<TwitchValidatePayload>(
    response,
    "Twitch token validation",
  );
  const login = payload.login?.trim() ?? "";
  const userId = payload.user_id?.trim() ?? "";
  if (!login || !userId) {
    throw new Error("Twitch token validation did not return account details.");
  }
  const scopes = new Set(
    Array.isArray(payload.scopes)
      ? payload.scopes.filter(
          (scope): scope is string => typeof scope === "string",
        )
      : [],
  );
  return {
    accessToken,
    clientId,
    login,
    userId,
    scopes,
  };
};

const twitchApiFetchJson = async <T>(
  context: TwitchAuthContext,
  input: string | URL,
  init: RequestInit = {},
  source = "Twitch API",
): Promise<T> => {
  const headers = new Headers(init.headers ?? {});
  headers.set("Client-ID", context.clientId);
  headers.set("Authorization", `Bearer ${context.accessToken}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const response = await fetch(input, {
    ...init,
    headers,
  });
  if (
    (response.status === 401 || response.status === 403) &&
    source.toLowerCase().includes("moderat")
  ) {
    throw new Error(
      "Twitch moderation is unauthorized for this account. Re-sign in to Twitch to grant mod scopes.",
    );
  }
  return fetchJsonOrThrow<T>(response, source);
};

const getTwitchUserByLogin = async (
  context: TwitchAuthContext,
  login: string,
  source: string,
) => {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    throw new Error("Twitch username is required.");
  }
  const requestUrl = new URL("https://api.twitch.tv/helix/users");
  requestUrl.searchParams.set("login", normalized);
  const payload = await twitchApiFetchJson<{
    data?: Array<{ id?: string; login?: string }>;
  }>(context, requestUrl, {}, source);
  const first = Array.isArray(payload.data) ? payload.data[0] : undefined;
  const id = first?.id?.trim() ?? "";
  if (!id) {
    throw new Error(`Twitch user "${normalized}" was not found.`);
  }
  return {
    id,
    login: first?.login?.trim() ?? normalized,
  };
};

const canModerateTwitchChannel = async (channel: string): Promise<boolean> => {
  const normalizedChannel = normalizeLogin(channel);
  if (!normalizedChannel) return false;
  const context = await getTwitchAuthContext();
  if (normalizeLogin(context.login) === normalizedChannel) {
    return true;
  }
  if (!context.scopes.has("moderator:read:moderators")) {
    return false;
  }
  const broadcaster = await getTwitchUserByLogin(
    context,
    normalizedChannel,
    "Twitch channel lookup",
  );
  const requestUrl = new URL(
    "https://api.twitch.tv/helix/moderation/moderators",
  );
  requestUrl.searchParams.set("broadcaster_id", broadcaster.id);
  requestUrl.searchParams.set("user_id", context.userId);
  const payload = await twitchApiFetchJson<{ data?: unknown[] }>(
    context,
    requestUrl,
    {},
    "Twitch moderator lookup",
  );
  return Array.isArray(payload.data) && payload.data.length > 0;
};

const moderateTwitch = async (request: ModerationRequest): Promise<void> => {
  const action = request.action;
  const normalizedChannel = normalizeLogin(request.channel ?? "");
  if (!action) {
    throw new Error("Twitch moderation action is required.");
  }
  if (!normalizedChannel) {
    throw new Error("Twitch channel is required for moderation.");
  }
  const context = await getTwitchAuthContext();
  const broadcaster = await getTwitchUserByLogin(
    context,
    normalizedChannel,
    "Twitch channel lookup",
  );

  if (action === "delete") {
    if (!context.scopes.has("moderator:manage:chat_messages")) {
      throw new Error(
        "Missing Twitch scope moderator:manage:chat_messages. Re-sign in to Twitch.",
      );
    }
    const messageId = (request.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("Twitch message id is required to delete a message.");
    }
    const requestUrl = new URL("https://api.twitch.tv/helix/moderation/chat");
    requestUrl.searchParams.set("broadcaster_id", broadcaster.id);
    requestUrl.searchParams.set("moderator_id", context.userId);
    requestUrl.searchParams.set("message_id", messageId);
    await twitchApiFetchJson<Record<string, unknown>>(
      context,
      requestUrl,
      {
        method: "DELETE",
      },
      "Twitch delete message",
    );
    return;
  }

  if (!context.scopes.has("moderator:manage:banned_users")) {
    throw new Error(
      "Missing Twitch scope moderator:manage:banned_users. Re-sign in to Twitch.",
    );
  }
  const normalizedUser = normalizeLogin(request.username ?? "");
  if (!normalizedUser) {
    throw new Error("Twitch username is required for this moderation action.");
  }
  const target = await getTwitchUserByLogin(
    context,
    normalizedUser,
    "Twitch target user lookup",
  );
  if (action === "unban") {
    const requestUrl = new URL("https://api.twitch.tv/helix/moderation/bans");
    requestUrl.searchParams.set("broadcaster_id", broadcaster.id);
    requestUrl.searchParams.set("moderator_id", context.userId);
    requestUrl.searchParams.set("user_id", target.id);
    await twitchApiFetchJson<Record<string, unknown>>(
      context,
      requestUrl,
      {
        method: "DELETE",
      },
      "Twitch unban user",
    );
    return;
  }

  const durationSeconds =
    action === "timeout_60" ? 60 : action === "timeout_600" ? 600 : 0;
  const body = {
    data: {
      user_id: target.id,
      ...(durationSeconds > 0 ? { duration: durationSeconds } : {}),
    },
  };
  const requestUrl = new URL("https://api.twitch.tv/helix/moderation/bans");
  requestUrl.searchParams.set("broadcaster_id", broadcaster.id);
  requestUrl.searchParams.set("moderator_id", context.userId);
  await twitchApiFetchJson<Record<string, unknown>>(
    context,
    requestUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    durationSeconds > 0 ? "Twitch timeout user" : "Twitch ban user",
  );
};

const parseKickTokenScopes = (token: string): Set<string> => {
  const trimmed = token.trim();
  if (!trimmed.includes(".")) return new Set();
  const [, payloadPart] = trimmed.split(".");
  if (!payloadPart) return new Set();
  try {
    const payloadText = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(payloadText) as {
      scope?: unknown;
      scopes?: unknown;
    };
    const scopes = new Set<string>();
    if (typeof payload.scope === "string") {
      for (const scope of payload.scope
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)) {
        scopes.add(scope);
      }
    }
    if (Array.isArray(payload.scopes)) {
      for (const scope of payload.scopes) {
        if (typeof scope === "string" && scope.trim()) {
          scopes.add(scope.trim());
        }
      }
    }
    return scopes;
  } catch {
    return new Set();
  }
};

const kickApiFetchRaw = async (
  input: string | URL,
  init: RequestInit = {},
  source = "Kick API",
  allowRetry = true,
): Promise<Response> => {
  const firstToken =
    store.get("kickAccessToken")?.trim() || (await refreshKickAccessToken());
  const doFetch = async (token: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    return fetch(input, {
      ...init,
      headers,
    });
  };

  let response = await doFetch(firstToken);
  if (response.status === 401 && allowRetry) {
    const refreshedToken = await refreshKickAccessToken();
    response = await doFetch(refreshedToken);
  }
  if (response.status === 401) {
    throw new Error(KICK_REAUTH_REQUIRED_MESSAGE);
  }
  if (response.status === 403 && source.toLowerCase().includes("moderat")) {
    const body = await response.text();
    const payload = body ? parseUnknownJson(body) : {};
    const detail =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).message === "string"
        ? ((payload as Record<string, unknown>).message as string)
        : "";
    const suffix = detail ? ` (${detail})` : "";
    throw new Error(
      `Kick moderation is unauthorized for this channel or account${suffix}.`,
    );
  }
  return response;
};

const kickApiFetchJson = async <T>(
  input: string | URL,
  init: RequestInit = {},
  source = "Kick API",
  allowRetry = true,
): Promise<T> => {
  const response = await kickApiFetchRaw(input, init, source, allowRetry);
  return fetchJsonOrThrow<T>(response, source);
};

const resolveKickBroadcasterUserId = async (
  channel: string,
): Promise<number> => {
  const slug = normalizeLogin(channel);
  if (!slug) {
    throw new Error("Kick channel is required.");
  }
  const params = new URLSearchParams();
  params.append("slug", slug);
  try {
    const channelPayload = await kickApiFetchJson<unknown>(
      `https://api.kick.com/public/v1/channels?${params.toString()}`,
      {},
      "Kick channel lookup",
    );
    const apiUserId = parseKickUserId(channelPayload);
    if (apiUserId) {
      return apiUserId;
    }
  } catch {
    // Fall through to unauthenticated lookup fallback.
  }
  const lookup = await resolveKickChannelLookup(slug);
  if (!lookup.ok) {
    throw new Error(lookup.message);
  }
  const userId = parseKickUserId(lookup.payload);
  if (!userId) {
    throw new Error("Kick broadcaster user id was not found for this channel.");
  }
  return userId;
};

const resolveKickTargetUserId = async (
  request: ModerationRequest,
): Promise<number> => {
  if (
    Number.isFinite(request.targetUserId) &&
    Number(request.targetUserId) > 0
  ) {
    return Number(request.targetUserId);
  }
  const username = normalizeLogin(request.username ?? "");
  if (!username) {
    throw new Error("Kick username is required for this moderation action.");
  }
  const params = new URLSearchParams();
  params.append("slug", username);
  try {
    const channelPayload = await kickApiFetchJson<unknown>(
      `https://api.kick.com/public/v1/channels?${params.toString()}`,
      {},
      "Kick user lookup",
    );
    const userIdFromApi = parseKickUserId(channelPayload);
    if (userIdFromApi) {
      return userIdFromApi;
    }
  } catch {
    // Fall through to website lookup fallback.
  }

  const lookup = await resolveKickChannelLookup(username);
  if (lookup.ok) {
    const userId = parseKickUserId(lookup.payload);
    if (userId) {
      return userId;
    }
  } else {
    throw new Error(lookup.message);
  }

  throw new Error(
    "Kick user lookup failed for this username. Ask the user to send a recent message so Chatrix can capture their user ID.",
  );
};

const canModerateKickChannel = async (channel: string): Promise<boolean> => {
  const normalizedChannel = normalizeLogin(channel);
  if (!normalizedChannel) return false;

  const token = store.get("kickAccessToken")?.trim() ?? "";
  if (!token) return false;

  const scopes = parseKickTokenScopes(token);
  const hasModerationScope =
    scopes.has("moderation:ban") ||
    scopes.has("moderation:chat_message:manage");
  if (!hasModerationScope) return false;

  const kickUsername = normalizeLogin(store.get("kickUsername")?.trim() ?? "");
  if (kickUsername && kickUsername === normalizedChannel) {
    return true;
  }

  const broadcasterUserId =
    await resolveKickBroadcasterUserId(normalizedChannel);
  const probeResponse = await kickApiFetchRaw(
    "https://api.kick.com/public/v1/moderation/bans",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_user_id: broadcasterUserId,
        user_id: 0,
        duration: 1,
      }),
    },
    "Kick permission probe",
  );

  if (probeResponse.ok) return true;
  if (
    probeResponse.status === 400 ||
    probeResponse.status === 404 ||
    probeResponse.status === 422
  )
    return true;
  if (probeResponse.status === 403) return false;
  return false;
};

const moderateKick = async (request: ModerationRequest): Promise<void> => {
  const action = request.action;
  if (!action) {
    throw new Error("Kick moderation action is required.");
  }

  if (action === "delete") {
    const messageId = (request.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("Kick message id is required to delete a message.");
    }
    await kickApiFetchJson<Record<string, unknown>>(
      `https://api.kick.com/public/v1/chat/${encodeURIComponent(messageId)}`,
      {
        method: "DELETE",
      },
      "Kick delete message",
    );
    return;
  }

  const broadcasterUserId = await resolveKickBroadcasterUserId(
    request.channel ?? "",
  );
  const targetUserId = await resolveKickTargetUserId(request);
  if (action === "unban") {
    await kickApiFetchJson<Record<string, unknown>>(
      "https://api.kick.com/public/v1/moderation/bans",
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          broadcaster_user_id: broadcasterUserId,
          user_id: targetUserId,
        }),
      },
      "Kick unban user",
    );
    return;
  }

  const timeoutMinutes =
    action === "timeout_60" ? 1 : action === "timeout_600" ? 10 : 0;
  const body: Record<string, unknown> = {
    broadcaster_user_id: broadcasterUserId,
    user_id: targetUserId,
  };
  if (timeoutMinutes > 0) {
    body.duration = timeoutMinutes;
  }
  await kickApiFetchJson<Record<string, unknown>>(
    "https://api.kick.com/public/v1/moderation/bans",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMinutes > 0 ? "Kick timeout user" : "Kick ban user",
  );
};

const canModerateYouTubeChannel = (_channel: string): boolean =>
  Boolean(
    (store.get("youtubeAccessToken")?.trim() ?? "") ||
    (store.get("youtubeRefreshToken")?.trim() ?? ""),
  );

const buildYouTubeBanCacheKey = (liveChatId: string, targetChannelId: string) =>
  `${liveChatId}:${targetChannelId}`;

const resolveYouTubeTargetChannelId = (request: ModerationRequest): string => {
  const channelId = (request.targetChannelId ?? request.username ?? "").trim();
  if (!channelId) {
    throw new Error(
      "YouTube target channel id is required for this moderation action.",
    );
  }
  return channelId;
};

const moderateYouTube = async (request: ModerationRequest): Promise<void> => {
  const action = request.action;
  if (!action) {
    throw new Error("YouTube moderation action is required.");
  }

  const liveChatId = (request.liveChatId ?? "").trim();
  if (!liveChatId) {
    throw new Error("YouTube live chat id is required for moderation.");
  }
  if (liveChatId.startsWith("web:")) {
    throw new Error(
      "YouTube web read-only sessions do not support moderation.",
    );
  }

  if (!canModerateYouTubeChannel(request.channel ?? "")) {
    throw new Error(
      "YouTube sign-in required. Sign in again to use moderation.",
    );
  }

  if (action === "delete") {
    const messageId = (request.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("YouTube message id is required to delete a message.");
    }
    const endpoint = new URL(
      "https://www.googleapis.com/youtube/v3/liveChat/messages",
    );
    endpoint.searchParams.set("id", messageId);
    const response = await youtubeFetchWithAuth(endpoint, {
      method: "DELETE",
    });
    await fetchJsonOrThrow<Record<string, unknown>>(
      response,
      "YouTube delete message",
    );
    return;
  }

  const targetChannelId = resolveYouTubeTargetChannelId(request);
  const cacheKey = buildYouTubeBanCacheKey(liveChatId, targetChannelId);

  if (action === "unban") {
    const cachedBanId = youtubeBanIdsByTarget.get(cacheKey)?.trim() ?? "";
    if (!cachedBanId) {
      throw new Error(
        "YouTube unban is only available after Chatrix created that ban in this session.",
      );
    }
    const endpoint = new URL(
      "https://www.googleapis.com/youtube/v3/liveChat/bans",
    );
    endpoint.searchParams.set("id", cachedBanId);
    const response = await youtubeFetchWithAuth(endpoint, {
      method: "DELETE",
    });
    await fetchJsonOrThrow<Record<string, unknown>>(
      response,
      "YouTube unban user",
    );
    youtubeBanIdsByTarget.delete(cacheKey);
    return;
  }

  const durationSeconds =
    action === "timeout_60" ? 60 : action === "timeout_600" ? 600 : 0;
  const endpoint = new URL(
    "https://www.googleapis.com/youtube/v3/liveChat/bans",
  );
  endpoint.searchParams.set("part", "snippet");
  const response = await youtubeFetchWithAuth(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        liveChatId,
        type: durationSeconds > 0 ? "temporary" : "permanent",
        ...(durationSeconds > 0 ? { banDurationSeconds: durationSeconds } : {}),
        bannedUserDetails: {
          channelId: targetChannelId,
        },
      },
    }),
  });
  const payload = await fetchJsonOrThrow<{ id?: string }>(
    response,
    durationSeconds > 0 ? "YouTube timeout user" : "YouTube ban user",
  );
  const banId = payload.id?.trim() ?? "";
  if (banId) {
    youtubeBanIdsByTarget.set(cacheKey, banId);
  }
};

const runModerationAction = async (
  request: ModerationRequest,
): Promise<void> => {
  if (request.platform === "twitch") {
    await moderateTwitch(request);
    return;
  }
  if (request.platform === "kick") {
    await moderateKick(request);
    return;
  }
  if (request.platform === "youtube") {
    await moderateYouTube(request);
    return;
  }
  throw new Error("Unsupported moderation platform.");
};

const writeLog = (message: string) => {
  const formatted = `[${new Date().toISOString()}] ${message}`;
  console.info(formatted);
};

let mainWindow: BrowserWindow | null = null;
let store!: JsonSettingsStore;
let updaterInitialized = false;
const tiktokConnections = new Map<string, TikTokConnectionRecord>();
const youtubeWebChatSessions = new Map<string, YouTubeWebChatSession>();
const youtubeBanIdsByTarget = new Map<string, string>();
let pendingAutoInstallTimer: ReturnType<typeof setTimeout> | null = null;
let updateInstallTriggered = false;
const isWindows = process.platform === "win32";
let appIsQuitting = false;

const normalizeReleaseNotes = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          const note = (entry as Record<string, unknown>).note;
          if (typeof note === "string") return note.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
};

const normalizeIsoDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const asDate = new Date(String(value));
  return Number.isNaN(asDate.getTime()) ? undefined : asDate.toISOString();
};

const resolveConfiguredUpdateChannel = (): UpdateChannel => {
  const configured = store?.get("updateChannel");
  return configured === "beta" ? "beta" : DEFAULT_UPDATE_CHANNEL;
};

const createInitialUpdateStatus = (): UpdateStatus => ({
  state: "idle",
  message: "",
  channel: DEFAULT_UPDATE_CHANNEL,
  currentVersion: app.getVersion(),
});

let updateStatus: UpdateStatus = createInitialUpdateStatus();

const emitTikTokEvent = (payload: TikTokRendererEvent) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.TIKTOK_EVENT, payload);
};

const disconnectTikTokConnection = async (connectionId: string) => {
  const record = tiktokConnections.get(connectionId);
  if (!record) return;
  tiktokConnections.delete(connectionId);
  try {
    await record.connection.disconnect();
  } catch {
    // no-op
  } finally {
    record.connection.removeAllListeners?.();
    emitTikTokEvent({
      connectionId,
      type: "disconnected",
      roomId: record.roomId,
    });
  }
};

const disconnectAllTikTokConnections = async () => {
  const ids = Array.from(tiktokConnections.keys());
  await Promise.allSettled(
    ids.map((connectionId) => disconnectTikTokConnection(connectionId)),
  );
};

const connectTikTokChannel = async (channel: string) => {
  assertTikTokAlphaEnabled();
  const normalizedChannel = normalizeTikTokChannel(channel);
  if (!normalizedChannel) {
    throw new Error("TikTok channel is required.");
  }

  const sessionId = store.get("tiktokSessionId")?.trim() ?? "";
  const ttTargetIdc = store.get("tiktokTtTargetIdc")?.trim() ?? "";
  const activeSignApiKey = TIKTOK_SIGN_API_KEY;
  const hasAuthenticatedSession = Boolean(sessionId && ttTargetIdc);

  const connectionOptions: Record<string, unknown> = {
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false,
    enableRequestPolling: true,
  };
  if (activeSignApiKey) {
    connectionOptions.signApiKey = activeSignApiKey;
  }
  if (hasAuthenticatedSession) {
    connectionOptions.sessionId = sessionId;
    connectionOptions.ttTargetIdc = ttTargetIdc;
    connectionOptions.authenticateWs = false;
  }

  const connectionId = randomToken(18);
  const connection = new TikTokLiveConnection(
    normalizedChannel,
    connectionOptions as ConstructorParameters<typeof TikTokLiveConnection>[1],
  ) as unknown as TikTokConnection;
  const record: TikTokConnectionRecord = {
    connectionId,
    channel: normalizedChannel,
    connection,
  };

  tiktokConnections.set(connectionId, record);

  let connectedEventSent = false;
  const emitConnected = () => {
    if (connectedEventSent) return;
    connectedEventSent = true;
    emitTikTokEvent({
      connectionId,
      type: "connected",
      roomId: record.roomId,
    });
  };

  connection.on(WebcastEvent.CHAT, (payload: unknown) => {
    const message = normalizeTikTokChatMessage(normalizedChannel, payload);
    if (!message) return;
    emitTikTokEvent({
      connectionId,
      type: "chat",
      roomId: record.roomId,
      message,
    });
  });

  const followEventName = (WebcastEvent as Record<string, string | undefined>)
    .FOLLOW;
  if (followEventName) {
    connection.on(followEventName, (payload: unknown) => {
      const message = normalizeTikTokFollowMessage(normalizedChannel, payload);
      if (!message) return;
      emitTikTokEvent({
        connectionId,
        type: "chat",
        roomId: record.roomId,
        message,
      });
    });
  }

  connection.on(ControlEvent.CONNECTED, (state: unknown) => {
    const roomId = asString(asUnknownRecord(state)?.roomId).trim();
    if (roomId) {
      record.roomId = roomId;
    }
    emitConnected();
  });

  connection.on(ControlEvent.DISCONNECTED, (payload: unknown) => {
    const reason = asString(asUnknownRecord(payload)?.reason).trim();
    if (tiktokConnections.has(connectionId)) {
      tiktokConnections.delete(connectionId);
      connection.removeAllListeners?.();
    }
    emitTikTokEvent({
      connectionId,
      type: "disconnected",
      roomId: record.roomId,
      error: reason || undefined,
    });
  });

  connection.on(ControlEvent.ERROR, (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    emitTikTokEvent({
      connectionId,
      type: "error",
      roomId: record.roomId,
      error: text,
    });
  });

  try {
    const state = (await connection.connect()) as Record<
      string,
      unknown
    > | null;
    const roomId = asString(asUnknownRecord(state)?.roomId).trim();
    if (roomId) {
      record.roomId = roomId;
    }
    emitConnected();
    return {
      connectionId,
      roomId: record.roomId,
    };
  } catch (error) {
    tiktokConnections.delete(connectionId);
    connection.removeAllListeners?.();
    const text = error instanceof Error ? error.message : String(error);
    emitTikTokEvent({
      connectionId,
      type: "error",
      error: text,
    });
    if (isLikelyTikTokOfflineError(text)) {
      throw new Error(
        `TikTok channel @${normalizedChannel} is offline right now.`,
      );
    }
    throw new Error(`TikTok connect failed: ${text}`);
  }
};

const sendTikTokMessage = async (payload: {
  connectionId?: string;
  message?: string;
}) => {
  assertTikTokAlphaEnabled();
  const connectionId = payload?.connectionId?.trim();
  const message = payload?.message?.trim();
  const sessionId = store.get("tiktokSessionId")?.trim() ?? "";
  const ttTargetIdc = store.get("tiktokTtTargetIdc")?.trim() ?? "";
  const activeSignApiKey = TIKTOK_SIGN_API_KEY;
  if (!connectionId) {
    throw new Error("TikTok connection id is required.");
  }
  if (!message) {
    throw new Error("Message cannot be empty.");
  }
  if (!sessionId || !ttTargetIdc) {
    throw new Error(TIKTOK_SIGN_IN_REQUIRED_MESSAGE);
  }
  if (!activeSignApiKey) {
    throw new Error(TIKTOK_SIGN_KEY_REQUIRED_MESSAGE);
  }
  const record = tiktokConnections.get(connectionId);
  if (!record) {
    throw new Error("TikTok connection is not ready.");
  }
  if (typeof record.connection.sendMessage !== "function") {
    throw new Error("TikTok sending is not enabled for this alpha build.");
  }
  try {
    await record.connection.sendMessage(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    throw new Error(`TikTok send failed: ${text}`);
  }
};

const signInTikTok = async () => {
  assertTikTokAlphaEnabled();
  const authSession = session.fromPartition(TIKTOK_AUTH_PARTITION);
  attemptTikTokBrowserSignIn();
  const credentials = await openTikTokSignInWindow();
  store.set({
    tiktokSessionId: credentials.sessionId,
    tiktokTtTargetIdc: credentials.ttTargetIdc,
    tiktokUsername: store.get("tiktokUsername")?.trim() || "signed-in",
  });
  const resolved = await readTikTokAuthFromSession(authSession);
  if (!resolved) {
    throw new Error(
      "TikTok sign-in completed, but session cookies were not persisted.",
    );
  }
  return store.store;
};

const signOutTikTok = async () => {
  const authSession = session.fromPartition(TIKTOK_AUTH_PARTITION);
  await clearTikTokAuthSession(authSession);
  store.set({
    tiktokSessionId: "",
    tiktokTtTargetIdc: "",
    tiktokUsername: "",
  });
  await disconnectAllTikTokConnections();
  return store.store;
};

const updateStatusToRenderer = () => {
  if (mainWindow) {
    mainWindow.webContents.send(
      IPC_CHANNELS.UPDATES_STATUS_EVENT,
      updateStatus,
    );
  }
};

const clearPendingAutoInstallTimer = () => {
  if (!pendingAutoInstallTimer) return;
  clearTimeout(pendingAutoInstallTimer);
  pendingAutoInstallTimer = null;
};

const installDownloadedUpdateNow = () => {
  if (updateInstallTriggered) return;
  updateInstallTriggered = true;
  clearPendingAutoInstallTimer();
  try {
    setUpdateStatus("downloaded", "Installing update and restarting...");
    if (isWindows) {
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    updateInstallTriggered = false;
    const text = error instanceof Error ? error.message : String(error);
    setUpdateStatus("error", `Update install failed: ${text}`);
  }
};

const scheduleAutoInstallAfterDownload = (delayMs = 1800) => {
  clearPendingAutoInstallTimer();
  pendingAutoInstallTimer = setTimeout(() => {
    pendingAutoInstallTimer = null;
    installDownloadedUpdateNow();
  }, delayMs);
};

const setUpdateStatus = (
  state: UpdateStatus["state"],
  message: string,
  extras: Partial<UpdateStatus> = {},
) => {
  const channel = extras.channel ?? resolveConfiguredUpdateChannel();
  updateStatus = {
    ...updateStatus,
    ...extras,
    state,
    message,
    channel,
    currentVersion: app.getVersion(),
  };
  updateStatusToRenderer();
};

const applyAutoUpdaterChannel = (channel: UpdateChannel) => {
  autoUpdater.allowPrerelease = channel === "beta";
  try {
    const updaterWithChannel = autoUpdater as unknown as { channel?: string };
    updaterWithChannel.channel = channel === "beta" ? "beta" : undefined;
  } catch {
    // keep defaults when runtime doesn't expose channel assignment
  }
  setUpdateStatus(updateStatus.state, updateStatus.message, { channel });
};

const waitForUpdateTerminalState = async (timeoutMs = 12_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (
      updateStatus.state === "available" ||
      updateStatus.state === "not-available" ||
      updateStatus.state === "downloading" ||
      updateStatus.state === "downloaded" ||
      updateStatus.state === "error"
    ) {
      return updateStatus;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return updateStatus;
};

const requestUpdateCheck = async () => {
  if (!app.isPackaged) {
    setUpdateStatus("not-available", DEV_UPDATE_MESSAGE);
    return updateStatus;
  }
  updateInstallTriggered = false;
  try {
    setUpdateStatus("checking", "Checking for updates...");
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    setUpdateStatus("error", formatUpdaterErrorMessage(text));
  }
  return updateStatus;
};

const showHelpGuide = async () => {
  const options: MessageBoxOptions = {
    type: "info",
    buttons: ["Close"],
    defaultId: 0,
    title: "Chatrix Help Guide",
    message: "How to use Chatrix",
    detail: [
      "1. Sign in with Twitch or Kick to unlock full app features and chat sending.",
      "2. You can still open YouTube, TikTok, and Kick chats in read-only mode without login.",
      "3. Add a channel with the Platform + Username fields. Each channel opens in its own tab.",
      "4. Right-click any tab to merge chats only when you explicitly want a combined tab.",
      "5. The send dropdown is tab-aware: send to one chat, or [ALL] writable chats in the active tab.",
      "6. Scroll lock: if you scroll up, live autoscroll pauses. Use 'Go to newest message' to resume.",
      "7. Right-click messages for moderation actions (shown only when you are mod/broadcaster on single-source tabs).",
      "8. Right-click a Twitch/Kick user and choose 'View User Logs' to see session-only history (not saved to disk).",
      "9. Use Help > Check for Updates to manually verify updates anytime.",
      "10. Open Menu > Auth Manager to validate Twitch/Kick send permissions and active-tab mod capability.",
      "11. Open Menu > Connection Health for per-platform status, reconnect reasons, token expiry, and last error.",
      "12. Open Menu > Mention Inbox to jump directly to pings across open chats.",
    ].join("\n"),
  };

  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options);
    return;
  }
  await dialog.showMessageBox(options);
};

const showAboutApp = async () => {
  const options: MessageBoxOptions = {
    type: "info",
    buttons: ["OK"],
    defaultId: 0,
    title: "About Chatrix",
    message: `Chatrix v${app.getVersion()}`,
    detail: [
      `Version: ${app.getVersion()}`,
      `Platform: ${process.platform} (${process.arch})`,
      `Electron: ${process.versions.electron}`,
      `Chromium: ${process.versions.chrome}`,
      `Node.js: ${process.versions.node}`,
    ].join("\n"),
  };

  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options);
    return;
  }
  await dialog.showMessageBox(options);
};

const checkForUpdatesFromMenu = async () => {
  const status = await requestUpdateCheck();
  const finalStatus =
    status.state === "checking" || status.state === "idle"
      ? await waitForUpdateTerminalState(12_000)
      : status;

  if (isWindows) {
    // Windows update checks stay in-app only (no OS modal popups).
    return;
  }

  const options: MessageBoxOptions = {
    type: finalStatus.state === "error" ? "error" : "info",
    buttons: ["OK"],
    defaultId: 0,
    title: "Check for Updates",
    message: finalStatus.message || "Update check complete.",
    detail:
      finalStatus.releaseNotes && finalStatus.releaseNotes.trim()
        ? `Release notes (${finalStatus.availableVersion ?? "latest"}):\n\n${finalStatus.releaseNotes.trim()}`
        : undefined,
  };

  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options);
    return;
  }
  await dialog.showMessageBox(options);
};

const setupAppMenu = () => {
  const isMac = process.platform === "darwin";
  const revealMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  };
  const helpSubmenu: MenuItemConstructorOptions[] = [
    ...(!isMac
      ? [
          {
            label: "About Chatrix",
            click: () => {
              void showAboutApp();
            },
          } as MenuItemConstructorOptions,
          { type: "separator" } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "Help Guide",
      click: () => {
        void showHelpGuide();
      },
    },
    {
      label: "Check for Updates",
      click: () => {
        void checkForUpdatesFromMenu();
      },
    },
    { type: "separator" },
    {
      label: "Chatrix Releases",
      click: () => {
        void shell.openExternal("https://github.com/mhdtech1/Chatrix/releases");
      },
    },
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } as MenuItemConstructorOptions,
        ]
      : [
          {
            label: "File",
            submenu: [{ role: "quit" }],
          } as MenuItemConstructorOptions,
        ]),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(!app.isPackaged ? [{ role: "toggleDevTools" as const }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: isMac
        ? [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            {
              label: "Show Chatrix",
              click: () => {
                revealMainWindow();
              },
            },
            { type: "separator" },
            { role: "front" },
          ]
        : [{ role: "minimize" }, { role: "close" }],
    },
    {
      label: "Help",
      submenu: helpSubmenu,
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const setupAutoUpdater = () => {
  if (updaterInitialized) return;
  updaterInitialized = true;

  applyAutoUpdaterChannel(resolveConfiguredUpdateChannel());

  if (!app.isPackaged) {
    setUpdateStatus("not-available", DEV_UPDATE_MESSAGE);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  if (isWindows) {
    const windowsUpdater = autoUpdater as unknown as {
      autoRunAppAfterInstall?: boolean;
      disableWebInstaller?: boolean;
    };
    windowsUpdater.autoRunAppAfterInstall = true;
    windowsUpdater.disableWebInstaller = true;
  }

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus("checking", "Checking for updates...", {
      availableVersion: undefined,
      releaseDate: undefined,
      releaseNotes: undefined,
    });
  });
  autoUpdater.on("update-available", (info) => {
    updateInstallTriggered = false;
    const availableVersion =
      typeof info.version === "string" ? info.version : undefined;
    const infoRecord = info as unknown as Record<string, unknown>;
    setUpdateStatus(
      "available",
      `Update ${availableVersion ?? "new version"} available. Downloading in background...`,
      {
        availableVersion,
        releaseDate: normalizeIsoDate(infoRecord.releaseDate),
        releaseNotes: normalizeReleaseNotes(infoRecord.releaseNotes),
      },
    );
  });
  autoUpdater.on("update-not-available", () => {
    updateInstallTriggered = false;
    setUpdateStatus("not-available", "You are on the latest version.", {
      availableVersion: undefined,
      releaseDate: undefined,
      releaseNotes: undefined,
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
    setUpdateStatus("downloading", `Downloading update: ${percent}%`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    const availableVersion =
      typeof info.version === "string" ? info.version : undefined;
    const infoRecord = info as unknown as Record<string, unknown>;
    setUpdateStatus(
      "downloaded",
      `Update ${availableVersion ?? "new version"} downloaded. Restarting to apply update...`,
      {
        availableVersion,
        releaseDate: normalizeIsoDate(infoRecord.releaseDate),
        releaseNotes: normalizeReleaseNotes(infoRecord.releaseNotes),
      },
    );
    scheduleAutoInstallAfterDownload();
  });
  autoUpdater.on("error", (error) => {
    clearPendingAutoInstallTimer();
    updateInstallTriggered = false;
    const text = error instanceof Error ? error.message : String(error);
    setUpdateStatus("error", formatUpdaterErrorMessage(text));
  });

  setUpdateStatus("idle", DEFAULT_UPDATE_MESSAGE);
  setTimeout(() => {
    void requestUpdateCheck();
  }, 2000);
};

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "../preload/preload.cjs"),
    },
  });

  const devServerUrl =
    process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  const indexUrl = app.isPackaged
    ? path.join(__dirname, "../renderer/index.html")
    : devServerUrl;
  mainWindow.loadURL(app.isPackaged ? `file://${indexUrl}` : indexUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    const shouldHideToBackground =
      process.platform === "darwin" &&
      !appIsQuitting &&
      store.get("backgroundMonitorOnClose") !== false;
    if (!shouldHideToBackground) {
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    void disconnectAllTikTokConnections();
  });
};

app.whenReady().then(async () => {
  store = new JsonSettingsStore({
    workspacePreset: "streamer",
    theme: "dark",
    chatTextScale: 100,
    welcomeMode: false,
    mentionMutedTabIds: [],
    mentionSnoozeUntilByTab: {},
    tabSendRules: {},
    pinnedMessageByTabId: {},
    localPollByTabId: {},
    columns: 2,
    verboseLogs: false,
    performanceMode: false,
    backgroundMonitorOnClose: true,
    smartFilterSpam: true,
    smartFilterScam: true,
    autoBanOnMessage: false,
    confirmSendAll: true,
    updateChannel: DEFAULT_UPDATE_CHANNEL,
    twitchGuest: false,
    twitchScopeVersion: TWITCH_SCOPE_VERSION,
    kickGuest: false,
    kickScopeVersion: KICK_SCOPE_VERSION,
    twitchClientId: process.env.TWITCH_CLIENT_ID ?? TWITCH_MANAGED_CLIENT_ID,
    twitchRedirectUri:
      process.env.TWITCH_REDIRECT_URI ?? TWITCH_DEFAULT_REDIRECT_URI,
    kickClientId: process.env.KICK_CLIENT_ID ?? KICK_MANAGED_CLIENT_ID,
    kickRedirectUri: process.env.KICK_REDIRECT_URI ?? KICK_DEFAULT_REDIRECT_URI,
    youtubeClientId: YOUTUBE_ALPHA_ENABLED
      ? (process.env.YOUTUBE_CLIENT_ID ?? YOUTUBE_MANAGED_CLIENT_ID)
      : "",
    youtubeRedirectUri:
      process.env.YOUTUBE_REDIRECT_URI ?? YOUTUBE_DEFAULT_REDIRECT_URI,
    youtubeApiKey: YOUTUBE_ALPHA_ENABLED
      ? (process.env.YOUTUBE_API_KEY ?? YOUTUBE_MANAGED_API_KEY)
      : "",
    youtubeAlphaEnabled: YOUTUBE_ALPHA_ENABLED,
    tiktokAlphaEnabled: TIKTOK_ALPHA_ENABLED,
    tiktokSessionId: "",
    tiktokTtTargetIdc: "",
    tiktokUsername: "",
    setupWizardCompleted: false,
    setupWizardVersion: 0,
    setupWizardSendTestCompleted: false,
  });

  try {
    await migrateLegacySettingsTokens(store);
    await migrateLegacyOAuthClientSecretsFromSettings(store);
    await hydrateTokenStateFromSecureStorage(store);
    await hydrateAccountIdentityFromStoredTokens(store);
  } catch (error) {
    console.warn("[auth] unable to migrate/hydrate secure tokens", error);
  }

  const currentVersion = app.getVersion();
  const lastLaunchedVersion = store.get("lastLaunchedVersion")?.trim() ?? "";
  const forcedResetAppliedVersion =
    store.get("forcedResetAppliedVersion")?.trim() ?? "";
  const shouldApplyForcedReset =
    currentVersion === FORCE_APP_RESET_VERSION &&
    forcedResetAppliedVersion !== FORCE_APP_RESET_VERSION &&
    store.hasPersistedState &&
    lastLaunchedVersion !== currentVersion;

  if (shouldApplyForcedReset) {
    store.reset({
      forcedResetAppliedVersion: FORCE_APP_RESET_VERSION,
      lastLaunchedVersion: currentVersion,
    });
  } else if (lastLaunchedVersion !== currentVersion) {
    store.set({
      lastLaunchedVersion: currentVersion,
    });
  }

  const managedTwitchClientId = (
    process.env.TWITCH_CLIENT_ID ?? TWITCH_MANAGED_CLIENT_ID
  ).trim();
  if (!store.get("twitchClientId")?.trim() && managedTwitchClientId) {
    store.set("twitchClientId", managedTwitchClientId);
  }
  const managedTwitchRedirectUri = (
    process.env.TWITCH_REDIRECT_URI ?? TWITCH_DEFAULT_REDIRECT_URI
  ).trim();
  if (!store.get("twitchRedirectUri")?.trim() && managedTwitchRedirectUri) {
    store.set("twitchRedirectUri", managedTwitchRedirectUri);
  }
  const managedKickClientId = (
    process.env.KICK_CLIENT_ID ?? KICK_MANAGED_CLIENT_ID
  ).trim();
  if (!store.get("kickClientId")?.trim() && managedKickClientId) {
    store.set("kickClientId", managedKickClientId);
  }
  const managedKickRedirectUri = (
    process.env.KICK_REDIRECT_URI ?? KICK_DEFAULT_REDIRECT_URI
  ).trim();
  if (!store.get("kickRedirectUri")?.trim() && managedKickRedirectUri) {
    store.set("kickRedirectUri", managedKickRedirectUri);
  }
  if (YOUTUBE_ALPHA_ENABLED) {
    const managedYouTubeClientId = (
      process.env.YOUTUBE_CLIENT_ID ?? YOUTUBE_MANAGED_CLIENT_ID
    ).trim();
    if (!store.get("youtubeClientId")?.trim() && managedYouTubeClientId) {
      store.set("youtubeClientId", managedYouTubeClientId);
    }
    const managedYouTubeRedirectUri = (
      process.env.YOUTUBE_REDIRECT_URI ?? YOUTUBE_DEFAULT_REDIRECT_URI
    ).trim();
    if (!store.get("youtubeRedirectUri")?.trim() && managedYouTubeRedirectUri) {
      store.set("youtubeRedirectUri", managedYouTubeRedirectUri);
    }
    const managedYouTubeApiKey = (
      process.env.YOUTUBE_API_KEY ?? YOUTUBE_MANAGED_API_KEY
    ).trim();
    if (!store.get("youtubeApiKey")?.trim() && managedYouTubeApiKey) {
      store.set("youtubeApiKey", managedYouTubeApiKey);
    }
  } else {
    store.set({
      youtubeAlphaEnabled: false,
      youtubeAccessToken: "",
      youtubeRefreshToken: "",
      youtubeTokenExpiry: 0,
      youtubeUsername: "",
      youtubeLiveChatId: "",
    });
    await clearAuthTokens("youtube");
  }
  if (!TIKTOK_ALPHA_ENABLED) {
    store.set({
      tiktokAlphaEnabled: false,
      tiktokSessionId: "",
      tiktokTtTargetIdc: "",
      tiktokUsername: "",
    });
  }

  const disabledPlatforms = new Set<string>();
  if (!YOUTUBE_ALPHA_ENABLED) {
    disabledPlatforms.add("youtube");
  }
  if (!TIKTOK_ALPHA_ENABLED) {
    disabledPlatforms.add("tiktok");
  }

  if (disabledPlatforms.size > 0) {
    const existingSources = Array.isArray(store.get("sessionSources"))
      ? (store.get("sessionSources") ?? [])
      : [];
    const filteredSources = existingSources.filter(
      (source) => !disabledPlatforms.has(source.platform),
    );
    const retainedIds = new Set(filteredSources.map((source) => source.id));
    const existingTabs = Array.isArray(store.get("sessionTabs"))
      ? (store.get("sessionTabs") ?? [])
      : [];
    const filteredTabs = existingTabs
      .map((tab) => ({
        ...tab,
        sourceIds: tab.sourceIds.filter((sourceId) =>
          retainedIds.has(sourceId),
        ),
      }))
      .filter((tab) => tab.sourceIds.length > 0);
    const activeTabId = store.get("sessionActiveTabId");
    const nextActiveTabId =
      typeof activeTabId === "string" &&
      filteredTabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : (filteredTabs[0]?.id ?? "");

    store.set({
      sessionSources: filteredSources,
      sessionTabs: filteredTabs,
      sessionActiveTabId: nextActiveTabId,
    });
  }

  if (
    store.get("youtubeAlphaEnabled") !== YOUTUBE_ALPHA_ENABLED ||
    store.get("tiktokAlphaEnabled") !== TIKTOK_ALPHA_ENABLED
  ) {
    store.set({
      youtubeAlphaEnabled: YOUTUBE_ALPHA_ENABLED,
      tiktokAlphaEnabled: TIKTOK_ALPHA_ENABLED,
    });
  }

  if (store.get("twitchGuest") && store.get("twitchClientId")?.trim()) {
    store.set({
      twitchGuest: false,
      twitchUsername: store.get("twitchToken")
        ? store.get("twitchUsername")
        : "",
    });
  }
  if ((store.get("twitchScopeVersion") ?? 0) < TWITCH_SCOPE_VERSION) {
    store.set({
      twitchToken: "",
      twitchUsername: "",
      twitchGuest: false,
      twitchScopeVersion: TWITCH_SCOPE_VERSION,
    });
    await clearAuthTokens("twitch");
  }
  if (
    store.get("kickGuest") &&
    store.get("kickClientId")?.trim() &&
    (await getKickClientSecret())
  ) {
    store.set({
      kickGuest: false,
      kickUsername: store.get("kickAccessToken")
        ? store.get("kickUsername")
        : "",
    });
  }
  if ((store.get("kickScopeVersion") ?? 0) < KICK_SCOPE_VERSION) {
    store.set({
      kickAccessToken: "",
      kickRefreshToken: "",
      kickUsername: "",
      kickGuest: false,
      kickScopeVersion: KICK_SCOPE_VERSION,
    });
    await clearAuthTokens("kick");
  }
  if (
    store.get("updateChannel") !== "stable" &&
    store.get("updateChannel") !== "beta"
  ) {
    store.set({
      updateChannel: DEFAULT_UPDATE_CHANNEL,
    });
  }
  if (app.isPackaged) {
    void cleanupLegacyInstallArtifacts({
      platform: process.platform,
      currentExePath: app.getPath("exe"),
      homeDir: app.getPath("home"),
      localAppDataDir: process.env.LOCALAPPDATA,
      logger: (message) => console.info(message),
    });
  }
  startKickTokenBrokerKeepAlive();
  createMainWindow();
  setupAppMenu();
  setupAutoUpdater();

  registerIpcHandlers(
    ipcMain,
    createSettingsHandlers({
      store,
      youtubeAlphaEnabled: YOUTUBE_ALPHA_ENABLED,
      tiktokAlphaEnabled: TIKTOK_ALPHA_ENABLED,
      resolveConfiguredUpdateChannel,
      applyAutoUpdaterChannel,
      storeAuthTokens,
      clearAuthTokens,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createAuthSignInHandlers({
      store,
      randomToken,
      openAuthInBrowser,
      fetchJsonOrThrow,
      clearAuthTokens,
      storeOAuthClientSecret,
      storeAuthTokens,
      parseKickUserName,
      twitchDefaultRedirectUri: TWITCH_DEFAULT_REDIRECT_URI,
      twitchScopes: TWITCH_SCOPES,
      twitchScopeVersion: TWITCH_SCOPE_VERSION,
      kickDefaultRedirectUri: KICK_DEFAULT_REDIRECT_URI,
      kickScopes: KICK_SCOPES,
      kickScopeVersion: KICK_SCOPE_VERSION,
      kickWriteAuthUnavailableMessage: KICK_WRITE_AUTH_UNAVAILABLE_MESSAGE,
      getKickClientSecret,
      getKickTokenExchangeUrl: () =>
        getKickTokenBrokerConfig()?.exchangeUrl ?? null,
      ensureKickTokenBrokerReady,
      youtubeScopes: YOUTUBE_SCOPES,
      youtubeMissingOauthMessage: YOUTUBE_MISSING_OAUTH_MESSAGE,
      assertYouTubeAlphaEnabled,
      youtubeConfig,
      saveYouTubeTokens,
      youtubeFetchWithAuth,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createAuthSessionHandlers({
      store,
      twitchScopeVersion: TWITCH_SCOPE_VERSION,
      kickScopeVersion: KICK_SCOPE_VERSION,
      clearAuthTokens,
      refreshKickAccessToken,
      onYouTubeSignedOut: () => {
        youtubeBanIdsByTarget.clear();
      },
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createAuthTikTokHandlers({
      signIn: signInTikTok,
      signOut: signOutTikTok,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createAuthHealthHandlers({
      getAuthHealthSnapshot,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createChatHandlers({
      store,
      normalizeLogin,
      runModerationAction,
      canModerateTwitchChannel,
      canModerateYouTubeChannel,
      canModerateKickChannel,
      resolveKickChannelLookup,
      parseKickChatroomId,
      assertYouTubeAlphaEnabled,
      resolveYouTubeLiveChat,
      fetchYouTubeWebLiveMessages,
      youtubeFetchReadOnly,
      youtubeFetchWithAuth,
      fetchJsonOrThrow,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createTikTokHandlers({
      connect: connectTikTokChannel,
      disconnect: async (connectionId) => {
        const id = connectionId.trim();
        if (!id) return;
        await disconnectTikTokConnection(id);
      },
      sendMessage: sendTikTokMessage,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createLogHandlers({
      store,
      writeLog,
    }),
  );
  registerIpcHandlers(
    ipcMain,
    createUpdateHandlers({
      store,
      isPackaged: app.isPackaged,
      devUpdateMessage: DEV_UPDATE_MESSAGE,
      requestUpdateCheck,
      downloadUpdate: () => autoUpdater.downloadUpdate(),
      setUpdateStatus,
      applyAutoUpdaterChannel,
      installDownloadedUpdateNow,
      getUpdateStatus: () => updateStatus,
    }),
  );

  if (process.env.E2E_SMOKE === "1") {
    setTimeout(() => {
      app.quit();
    }, 2000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  appIsQuitting = true;
  clearPendingAutoInstallTimer();
  stopKickTokenBrokerKeepAlive();
  void disconnectAllTikTokConnections();
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    return;
  }
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
