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
  type MessageBoxOptions
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import electronUpdater from "electron-updater";
import tikTokLiveConnectorCjs from "tiktok-live-connector";

const { autoUpdater } = electronUpdater;
type TikTokConnectorModule = typeof import("tiktok-live-connector");
const tikTokLiveConnector = ((tikTokLiveConnectorCjs as unknown as { default?: TikTokConnectorModule }).default ??
  (tikTokLiveConnectorCjs as unknown as TikTokConnectorModule)) as TikTokConnectorModule;
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = tikTokLiveConnector;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AppSettings = {
  twitchToken?: string;
  twitchUsername?: string;
  twitchGuest?: boolean;
  twitchClientId?: string;
  twitchRedirectUri?: string;
  kickClientId?: string;
  kickClientSecret?: string;
  kickRedirectUri?: string;
  kickAccessToken?: string;
  kickRefreshToken?: string;
  kickUsername?: string;
  kickGuest?: boolean;
  kickScopeVersion?: number;
  youtubeClientId?: string;
  youtubeClientSecret?: string;
  youtubeRedirectUri?: string;
  youtubeAccessToken?: string;
  youtubeRefreshToken?: string;
  youtubeTokenExpiry?: number;
  youtubeUsername?: string;
  youtubeApiKey?: string;
  youtubeLiveChatId?: string;
  youtubeAlphaEnabled?: boolean;
  tiktokAlphaEnabled?: boolean;
  tiktokSessionId?: string;
  tiktokTtTargetIdc?: string;
  tiktokUsername?: string;
  overlayTransparent?: boolean;
  verboseLogs?: boolean;
  columns?: number;
  hideCommands?: boolean;
  keywordFilters?: string[];
  highlightKeywords?: string[];
  sessionSources?: Array<{
    id: string;
    platform: "twitch" | "kick" | "youtube" | "tiktok";
    channel: string;
    key: string;
    liveChatId?: string;
    youtubeChannelId?: string;
    youtubeVideoId?: string;
  }>;
  sessionTabs?: Array<{
    id: string;
    sourceIds: string[];
  }>;
  sessionActiveTabId?: string;
};

type UpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  message: string;
};

const DEV_UPDATE_MESSAGE = "Auto updates are available in packaged builds only.";
const DEFAULT_UPDATE_MESSAGE = "Checking for updates shortly...";
const LEGACY_SIGNATURE_UPDATE_MESSAGE =
  "Updater could not apply this update due to a legacy app signature. Download and install the latest MultiChat release once from GitHub; future restart updates will then work.";
const YOUTUBE_MISSING_OAUTH_MESSAGE =
  "YouTube sign-in is not configured in this build. Configure a YouTube OAuth Client ID (secret optional) and try again.";
const YOUTUBE_READONLY_UNAVAILABLE_MESSAGE = "YouTube read-only is not configured in this build.";
const YOUTUBE_ALPHA_DISABLED_MESSAGE = "YouTube is an alpha-only feature and is disabled in this beta build.";
const TIKTOK_ALPHA_DISABLED_MESSAGE = "TikTok LIVE is an alpha-only feature and is disabled in this beta build.";
const TIKTOK_SIGN_IN_CANCELLED_MESSAGE = "TikTok sign-in was cancelled before completion.";
const TIKTOK_SIGN_IN_TIMEOUT_MESSAGE = "TikTok sign-in timed out. Please try again.";
const TIKTOK_SIGN_IN_REQUIRED_MESSAGE = "Sign in with TikTok before sending messages.";
const TIKTOK_SIGN_KEY_REQUIRED_MESSAGE =
  "TikTok sending is not configured in this build.";
const TIKTOK_AUTH_PARTITION = "persist:multichat-tiktok-auth";
const TIKTOK_AUTH_TIMEOUT_MS = 4 * 60 * 1000;
const TIKTOK_LOGIN_URL = "https://www.tiktok.com/login";
const TIKTOK_SIGN_API_KEY = (process.env.TIKTOK_SIGN_API_KEY ?? "").trim();
const TWITCH_DEFAULT_REDIRECT_URI = "http://localhost:51730/twitch/callback";
const KICK_DEFAULT_REDIRECT_URI = "http://localhost:51730/kick/callback";
const YOUTUBE_DEFAULT_REDIRECT_URI = "http://localhost:51730/youtube/callback";
const TWITCH_MANAGED_CLIENT_ID = "syeui9mom7i5f9060j03tydgpdywbh";
const KICK_MANAGED_CLIENT_ID = "01KGRFF03VYRJMB3W4369Y07CS";
const KICK_MANAGED_CLIENT_SECRET = "29f43591eb0496352c66ea36f55c5c21e3fbc5053ba22568194e0c950c174794";
const YOUTUBE_MANAGED_CLIENT_ID = "1008732662207-rufcsa7rafob02h29docduk7pboim0s8.apps.googleusercontent.com";
const YOUTUBE_MANAGED_CLIENT_SECRET = "";
const YOUTUBE_MANAGED_API_KEY = "";
const TWITCH_SCOPES = ["chat:read", "chat:edit"];
const KICK_SCOPES = ["user:read", "channel:read", "chat:write"];
const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];
const KICK_SCOPE_VERSION = 2;
const YOUTUBE_ALPHA_ENABLED = true;
const TIKTOK_ALPHA_ENABLED = true;

class JsonSettingsStore {
  private readonly filePath: string;
  private readonly defaults: AppSettings;
  private state: AppSettings;

  constructor(defaults: AppSettings) {
    this.defaults = defaults;
    this.filePath = path.join(app.getPath("userData"), "settings.json");
    this.state = { ...defaults, ...this.readFromDisk() };
    this.writeToDisk();
  }

  get store(): AppSettings {
    return { ...this.state };
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.state[key];
  }

  set(updates: Partial<AppSettings>): void;
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  set<K extends keyof AppSettings>(arg1: K | Partial<AppSettings>, arg2?: AppSettings[K]): void {
    if (typeof arg1 === "string") {
      this.state[arg1] = arg2 as AppSettings[K];
    } else {
      this.state = { ...this.state, ...arg1 };
    }
    this.writeToDisk();
  }

  private readFromDisk(): AppSettings {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }
}

const normalizePathname = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
};

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

const fetchJsonOrThrow = async <T>(response: Response, source: string): Promise<T> => {
  const text = await response.text();
  let parsed: any = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
  }
  if (!response.ok) {
    const message =
      (typeof parsed?.message === "string" && parsed.message) ||
      (typeof parsed?.error?.message === "string" && parsed.error.message) ||
      (typeof parsed?.error_description === "string" && parsed.error_description) ||
      `${source} request failed (${response.status}).`;
    throw new Error(message);
  }
  return parsed as T;
};

const AUTH_CALLBACK_TIMEOUT_MS = 3 * 60 * 1000;

const isLoopbackHost = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
};

const sendAuthHtml = (response: ServerResponse<IncomingMessage>, statusCode: number, html: string) => {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, max-age=0"
  });
  response.end(html);
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

const authCompletePage = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MultiChat Sign-In Complete</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; }
      .card { max-width: 540px; padding: 24px; border: 1px solid #334155; border-radius: 12px; background: #111827; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { margin: 0; line-height: 1.5; color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Returning to MultiChat</h1>
      <p>This tab will close automatically. If it stays open, you can close it manually.</p>
    </main>
    <script>
      (() => {
        setTimeout(() => {
          window.open("", "_self");
          window.close();
        }, 250);
      })();
    </script>
  </body>
</html>
`;

const authHashBridgePage = (pathname: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Completing Sign-In...</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; }
      .card { max-width: 540px; padding: 24px; border: 1px solid #334155; border-radius: 12px; background: #111827; }
      p { margin: 0; line-height: 1.5; color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main class="card">
      <p id="status">Finishing sign-in...</p>
    </main>
    <script>
      (() => {
        const status = document.getElementById("status");
        const hash = window.location.hash ? window.location.hash.slice(1) : "";
        if (!hash) {
          if (status) status.textContent = "Sign-in response was missing data. You can close this tab and try again.";
          return;
        }
        const target = ${JSON.stringify(pathname)} + "?oauth_fragment=" + encodeURIComponent(hash);
        window.location.replace(target);
      })();
    </script>
  </body>
</html>
`;

const openAuthInBrowser = async (authUrl: string, redirectUri: string, timeoutMs = AUTH_CALLBACK_TIMEOUT_MS): Promise<string> => {
  const redirect = new URL(redirectUri);

  if (redirect.protocol !== "http:") {
    throw new Error("OAuth redirect URI must use http:// for desktop sign-in.");
  }
  if (!isLoopbackHost(redirect.hostname)) {
    throw new Error("OAuth redirect URI must use localhost or loopback for desktop sign-in.");
  }

  const callbackPath = normalizePathname(redirect.pathname);
  const callbackPort = Number.parseInt(redirect.port || "80", 10);

  return new Promise((resolve, reject) => {
    let settled = false;

    const server = createServer((request, response) => {
      const incoming = new URL(request.url ?? "/", redirect.origin);
      const incomingPath = normalizePathname(incoming.pathname);
      const oauthFragment = incoming.searchParams.get("oauth_fragment");
      const hasDirectCallbackParams =
        incoming.searchParams.has("code") ||
        incoming.searchParams.has("error") ||
        incoming.searchParams.has("state");
      const isExpectedPath = incomingPath === callbackPath;
      const hasOAuthPayload = Boolean(oauthFragment && oauthFragment.length > 0) || hasDirectCallbackParams;

      if (!isExpectedPath && !hasOAuthPayload) {
        sendAuthHtml(response, 404, "<h1>Not found</h1>");
        return;
      }

      if (oauthFragment && oauthFragment.length > 0) {
        sendAuthHtml(response, 200, authCompletePage);
        finish(`${redirect.origin}${incoming.pathname}#${oauthFragment}`);
        return;
      }

      if (hasDirectCallbackParams) {
        sendAuthHtml(response, 200, authCompletePage);
        finish(`${redirect.origin}${incoming.pathname}${incoming.search}`);
        return;
      }

      sendAuthHtml(response, 200, authHashBridgePage(incoming.pathname));
    });

    const timeout = setTimeout(() => {
      finish(undefined, new Error("Sign-in timed out. Please try again."));
    }, timeoutMs);

    const closeServer = () => {
      clearTimeout(timeout);
      server.removeAllListeners("error");
      server.close();
    };

    const finish = (callbackUrl?: string, error?: Error) => {
      if (settled) return;
      settled = true;
      closeServer();
      bringAppToFrontAfterOAuth();
      if (error) {
        reject(error);
        return;
      }
      resolve(callbackUrl ?? "");
    };

    server.on("error", (error) => {
      const text = error instanceof Error ? error.message : String(error);
      finish(undefined, new Error(`Unable to listen for OAuth callback: ${text}`));
    });

    server.listen(callbackPort, () => {
      void shell.openExternal(authUrl).catch((error) => {
        finish(undefined, new Error(`Failed to open default browser: ${String(error)}`));
      });
    });
  });
};

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

  if (typeof record.username === "string" && record.username.length > 0) return record.username;
  if (typeof record.name === "string" && record.name.length > 0) return record.name;
  if (typeof record.slug === "string" && record.slug.length > 0) return record.slug;

  return undefined;
};

const formatUpdaterErrorMessage = (errorText: string) => {
  const lower = errorText.toLowerCase();
  if (
    lower.includes("eperm") &&
    lower.includes("operation not permitted") &&
    lower.includes("rename") &&
    lower.includes("updater")
  ) {
    return "Updater could not replace its pending installer file. Close MultiChat, delete the updater cache folder in %LOCALAPPDATA%, and reopen the app to retry.";
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
    .filter((cookie) => isTikTokCookie(cookie) && typeof cookie.value === "string" && cookie.value.trim().length > 0)
    .sort((left, right) => Number(right.expirationDate ?? 0) - Number(left.expirationDate ?? 0));
  return valid[0]?.value.trim() ?? "";
};

const readTikTokAuthFromSession = async (
  authSession: Session
): Promise<{ sessionId: string; ttTargetIdc: string } | null> => {
  const [sessionCookies, idcCookies] = await Promise.all([
    authSession.cookies.get({ name: "sessionid" }),
    authSession.cookies.get({ name: "tt-target-idc" })
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
    })
  );
};

const openTikTokSignInWindow = async (): Promise<{ sessionId: string; ttTargetIdc: string }> => {
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
        partition: TIKTOK_AUTH_PARTITION
      }
    });

    const onCookieChanged = (_event: unknown, cookie: Cookie) => {
      if (!isTikTokCookie(cookie)) return;
      if (cookie.name !== "sessionid" && cookie.name !== "tt-target-idc") return;
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
      authWindow.webContents.removeListener("did-finish-load", onDidChangeNavigation);
      authWindow.webContents.removeListener("did-navigate", onDidChangeNavigation);
      authWindow.webContents.removeListener("did-navigate-in-page", onDidChangeNavigation);
    };

    const finish = (result?: { sessionId: string; ttTargetIdc: string }, error?: Error) => {
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
      void shell.openExternal(url);
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

const normalizeTikTokChannel = (input: string) => input.trim().replace(/^@+/, "").toLowerCase();

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

type TikTokRendererEvent = {
  connectionId: string;
  type: "connected" | "disconnected" | "chat" | "error";
  roomId?: string;
  message?: NormalizedTikTokChatMessage;
  error?: string;
};

type TikTokConnection = {
  connect: () => Promise<{ roomId?: string | number } | Record<string, unknown>>;
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

const normalizeTikTokChatMessage = (channel: string, payload: unknown): NormalizedTikTokChatMessage | null => {
  const record = asUnknownRecord(payload);
  if (!record) return null;

  const comment = asString(record.comment).trim() || asString(record.message).trim();
  if (!comment) return null;

  const user = asUnknownRecord(record.user) ?? {};
  const username = asString(user.uniqueId).trim() || asString(user.username).trim() || "tiktok-user";
  const displayName = asString(user.nickname).trim() || asString(user.displayName).trim() || username;
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
    createdEpochMillis > 0 ? new Date(createdEpochMillis).toISOString() : new Date().toISOString();

  const color = asString(user.nameColor).trim() || asString(user.color).trim() || undefined;
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
    raw: record
  };
};

const parseKickChatroomId = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const chatroom = record.chatroom;
  if (chatroom && typeof chatroom === "object") {
    const chatroomId = (chatroom as Record<string, unknown>).id;
    if (typeof chatroomId === "number") return chatroomId;
  }

  if (typeof record.chatroom_id === "number") return record.chatroom_id;

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

type YouTubeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
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

const normalizeYouTubeInput = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return "";

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

const youtubeConfig = () => ({
  clientId: store.get("youtubeClientId")?.trim() ?? "",
  clientSecret: store.get("youtubeClientSecret")?.trim() ?? "",
  redirectUri: store.get("youtubeRedirectUri")?.trim() || YOUTUBE_DEFAULT_REDIRECT_URI
});

const getYouTubePublicApiKey = () =>
  (store.get("youtubeApiKey")?.trim() ?? "") || (process.env.YOUTUBE_API_KEY ?? YOUTUBE_MANAGED_API_KEY).trim();

const saveYouTubeTokens = (tokens: { accessToken: string; refreshToken?: string; expiresIn?: number }) => {
  const currentRefresh = store.get("youtubeRefreshToken")?.trim() ?? "";
  const refreshToken = (tokens.refreshToken ?? currentRefresh).trim();
  const expiresIn = Number(tokens.expiresIn ?? 0);
  const expiry =
    Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + Math.max(30, expiresIn - 30) * 1000 : Date.now() + 55 * 60 * 1000;

  store.set({
    youtubeAccessToken: tokens.accessToken.trim(),
    youtubeRefreshToken: refreshToken,
    youtubeTokenExpiry: expiry
  });
};

const refreshYouTubeAccessToken = async (): Promise<string> => {
  const { clientId, clientSecret } = youtubeConfig();
  const refreshToken = store.get("youtubeRefreshToken")?.trim() ?? "";
  if (!clientId || !refreshToken) {
    throw new Error("YouTube sign-in required.");
  }

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  if (clientSecret) {
    tokenParams.set("client_secret", clientSecret);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: tokenParams
  });
  const tokens = await fetchJsonOrThrow<YouTubeTokenResponse>(response, "YouTube token refresh");
  if (!tokens.access_token) {
    throw new Error("YouTube token refresh did not return an access token.");
  }
  saveYouTubeTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in
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

const youtubeFetchWithAuth = async (input: string | URL, init: RequestInit = {}, allowRetry = true): Promise<Response> => {
  const token = await ensureYouTubeAccessToken();
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (response.status === 401 && allowRetry && (store.get("youtubeRefreshToken")?.trim() ?? "").length > 0) {
    await refreshYouTubeAccessToken();
    return youtubeFetchWithAuth(input, init, false);
  }
  return response;
};

const youtubeFetchReadOnly = async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
  const hasOAuthSession = Boolean((store.get("youtubeAccessToken")?.trim() ?? "") || (store.get("youtubeRefreshToken")?.trim() ?? ""));
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
    headers
  });
};

const parseYouTubeChannelFromInput = async (rawInput: string): Promise<{ channelId: string; channelTitle: string }> => {
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
    const payload = await fetchJsonOrThrow<YouTubeChannelsResponse>(response, "YouTube channel lookup");
    const first = Array.isArray(payload.items) ? payload.items[0] : undefined;
    if (first?.id) {
      return {
        channelId: first.id,
        channelTitle: first.snippet?.title?.trim() || input
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
    const payload = await fetchJsonOrThrow<YouTubeChannelsResponse>(response, "YouTube handle lookup");
    const first = Array.isArray(payload.items) ? payload.items[0] : undefined;
    if (first?.id) {
      return {
        channelId: first.id,
        channelTitle: first.snippet?.title?.trim() || handle
      };
    }
  }

  const search = new URL("https://www.googleapis.com/youtube/v3/search");
  search.searchParams.set("part", "snippet");
  search.searchParams.set("type", "channel");
  search.searchParams.set("q", input);
  search.searchParams.set("maxResults", "1");
  const response = await youtubeFetchReadOnly(search);
  const payload = await fetchJsonOrThrow<YouTubeSearchChannelsResponse>(response, "YouTube channel search");
  const first = Array.isArray(payload.items) ? payload.items[0] : undefined;
  const channelId = first?.id?.channelId?.trim();
  if (!channelId) {
    throw new Error(`YouTube channel "${rawInput}" was not found.`);
  }
  return {
    channelId,
    channelTitle: first?.snippet?.channelTitle?.trim() || first?.snippet?.title?.trim() || rawInput
  };
};

const resolveYouTubeLiveChat = async (rawInput: string) => {
  const channel = await parseYouTubeChannelFromInput(rawInput);

  const liveSearch = new URL("https://www.googleapis.com/youtube/v3/search");
  liveSearch.searchParams.set("part", "snippet");
  liveSearch.searchParams.set("channelId", channel.channelId);
  liveSearch.searchParams.set("eventType", "live");
  liveSearch.searchParams.set("type", "video");
  liveSearch.searchParams.set("maxResults", "1");
  liveSearch.searchParams.set("order", "date");
  const searchResponse = await youtubeFetchReadOnly(liveSearch);
  const searchPayload = await fetchJsonOrThrow<YouTubeSearchChannelsResponse>(searchResponse, "YouTube live stream lookup");
  const firstVideo = Array.isArray(searchPayload.items) ? searchPayload.items[0] : undefined;
  const videoId = firstVideo?.id?.videoId?.trim() ?? "";
  if (!videoId) {
    throw new Error(`No active live stream found for ${channel.channelTitle}.`);
  }

  const videoDetails = new URL("https://www.googleapis.com/youtube/v3/videos");
  videoDetails.searchParams.set("part", "liveStreamingDetails,snippet");
  videoDetails.searchParams.set("id", videoId);
  const videoResponse = await youtubeFetchReadOnly(videoDetails);
  const videoPayload = await fetchJsonOrThrow<YouTubeVideosResponse>(videoResponse, "YouTube live chat lookup");
  const video = Array.isArray(videoPayload.items) ? videoPayload.items[0] : undefined;
  const liveChatId = video?.liveStreamingDetails?.activeLiveChatId?.trim() ?? "";
  if (!liveChatId) {
    throw new Error(`Live chat is not available for the current stream on ${channel.channelTitle}.`);
  }

  return {
    channelId: channel.channelId,
    channelTitle: video?.snippet?.channelTitle?.trim() || channel.channelTitle,
    videoId,
    liveChatId
  };
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

const resolveKickChannelViaHttp = async (slug: string): Promise<KickLookupResult> => {
  const response = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Referer: `https://kick.com/${slug}`
    }
  });

  const text = await response.text();
  const payload = text ? parseUnknownJson(text) : {};
  const message =
    payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).message === "string"
      ? ((payload as Record<string, unknown>).message as string)
      : `Kick lookup failed (${response.status}).`;

  return {
    ok: response.ok,
    status: response.status,
    payload,
    message
  };
};

const resolveKickChannelViaBrowser = async (slug: string): Promise<KickLookupResult> => {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      show: false,
      width: 980,
      height: 720,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
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
        message: "Kick browser lookup timed out."
      });
    }, 25_000);

    authWindow.on("closed", () => {
      finalize({
        ok: false,
        status: 0,
        payload: {},
        message: "Kick browser lookup window closed before completion."
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

        const result = (await authWindow.webContents.executeJavaScript(script)) as {
          ok?: boolean;
          status?: number;
          text?: string;
        };

        const payload = result?.text ? parseUnknownJson(result.text) : {};
        const message =
          payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).message === "string"
            ? ((payload as Record<string, unknown>).message as string)
            : `Kick browser lookup failed (${result?.status ?? 0}).`;

        finalize({
          ok: Boolean(result?.ok),
          status: result?.status ?? 0,
          payload,
          message
        });
      } catch (error) {
        finalize({
          ok: false,
          status: 0,
          payload: {},
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    authWindow.loadURL(`https://kick.com/${encodeURIComponent(slug)}`).catch((error) => {
      finalize({
        ok: false,
        status: 0,
        payload: {},
        message: `Failed to open Kick channel page: ${String(error)}`
      });
    });
  });
};

const writeLog = (message: string) => {
  const formatted = `[${new Date().toISOString()}] ${message}`;
  console.log(formatted);
};

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let viewerWindow: BrowserWindow | null = null;
let updateStatus: UpdateStatus = { state: "idle", message: "" };
let store!: JsonSettingsStore;
let updaterInitialized = false;
const tiktokConnections = new Map<string, TikTokConnectionRecord>();

const emitTikTokEvent = (payload: TikTokRendererEvent) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("tiktok:event", payload);
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
      roomId: record.roomId
    });
  }
};

const disconnectAllTikTokConnections = async () => {
  const ids = Array.from(tiktokConnections.keys());
  await Promise.allSettled(ids.map((connectionId) => disconnectTikTokConnection(connectionId)));
};

const updateStatusToRenderer = () => {
  if (mainWindow) {
    mainWindow.webContents.send("updates:status", updateStatus);
  }
};

const setUpdateStatus = (state: UpdateStatus["state"], message: string) => {
  updateStatus = { state, message };
  updateStatusToRenderer();
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
    title: "MultiChat Help Guide",
    message: "How to use MultiChat",
    detail: [
      "1. Sign in with Twitch and/or Kick from the login screen.",
      "2. Open channel tabs by typing a channel username and pressing Enter.",
      "3. Use right-click on a tab to merge it into another tab when needed.",
      "4. Use the composer dropdown to send to one chat or all chats in the active tab.",
      "5. Right-click messages for moderator actions (timeout, ban, unban, delete on Twitch).",
      "6. Use Overlay or Viewer buttons for display-focused windows.",
      "7. Right-click a Twitch/Kick message and use View User Logs for in-app, session-only message history."
    ].join("\n")
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
    status.state === "checking" || status.state === "idle" ? await waitForUpdateTerminalState(12_000) : status;

  const options: MessageBoxOptions = {
    type: finalStatus.state === "error" ? "error" : "info",
    buttons: ["OK"],
    defaultId: 0,
    title: "Check for Updates",
    message: finalStatus.message || "Update check complete."
  };

  if (mainWindow) {
    await dialog.showMessageBox(mainWindow, options);
    return;
  }
  await dialog.showMessageBox(options);
};

const setupAppMenu = () => {
  const isMac = process.platform === "darwin";
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
              { role: "quit" }
            ]
          } as MenuItemConstructorOptions
        ]
      : [
          {
            label: "File",
            submenu: [{ role: "quit" }]
          } as MenuItemConstructorOptions
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
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: isMac
        ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
        : [{ role: "minimize" }, { role: "close" }]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Help Guide",
          click: () => {
            void showHelpGuide();
          }
        },
        {
          label: "Check for Updates",
          click: () => {
            void checkForUpdatesFromMenu();
          }
        },
        { type: "separator" },
        {
          label: "MultiChat Releases",
          click: () => {
            void shell.openExternal("https://github.com/mhdtech1/MultiChat/releases");
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const setupAutoUpdater = () => {
  if (updaterInitialized) return;
  updaterInitialized = true;

  if (!app.isPackaged) {
    setUpdateStatus("not-available", DEV_UPDATE_MESSAGE);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus("checking", "Checking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    setUpdateStatus("available", `Update ${info.version} available. Downloading in background...`);
  });
  autoUpdater.on("update-not-available", () => {
    setUpdateStatus("not-available", "You are on the latest version.");
  });
  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
    setUpdateStatus("downloading", `Downloading update: ${percent}%`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    setUpdateStatus("downloaded", `Update ${info.version} downloaded. It will install when the app restarts.`);
  });
  autoUpdater.on("error", (error) => {
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
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  const indexUrl = app.isPackaged ? path.join(__dirname, "../renderer/index.html") : devServerUrl;
  mainWindow.loadURL(app.isPackaged ? `file://${indexUrl}` : indexUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    void disconnectAllTikTokConnections();
  });
};

const createOverlayWindow = () => {
  if (overlayWindow) return;
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 600,
    transparent: store.get("overlayTransparent") ?? true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  const overlayUrl = app.isPackaged
    ? `file://${path.join(__dirname, "../renderer/index.html")}#overlay`
    : `${devServerUrl}#overlay`;
  overlayWindow.loadURL(overlayUrl);
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
};

const createViewerWindow = () => {
  if (viewerWindow) return;
  viewerWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  const viewerUrl = app.isPackaged
    ? `file://${path.join(__dirname, "../renderer/index.html")}#viewer`
    : `${devServerUrl}#viewer`;
  viewerWindow.loadURL(viewerUrl);
  viewerWindow.on("closed", () => {
    viewerWindow = null;
  });
};

app.whenReady().then(() => {
  store = new JsonSettingsStore({
    columns: 2,
    overlayTransparent: true,
    verboseLogs: false,
    twitchGuest: false,
    kickGuest: false,
    kickScopeVersion: KICK_SCOPE_VERSION,
    twitchClientId: process.env.TWITCH_CLIENT_ID ?? TWITCH_MANAGED_CLIENT_ID,
    twitchRedirectUri: process.env.TWITCH_REDIRECT_URI ?? TWITCH_DEFAULT_REDIRECT_URI,
    kickClientId: process.env.KICK_CLIENT_ID ?? KICK_MANAGED_CLIENT_ID,
    kickClientSecret: process.env.KICK_CLIENT_SECRET ?? KICK_MANAGED_CLIENT_SECRET,
    kickRedirectUri: process.env.KICK_REDIRECT_URI ?? KICK_DEFAULT_REDIRECT_URI,
    youtubeClientId: YOUTUBE_ALPHA_ENABLED ? process.env.YOUTUBE_CLIENT_ID ?? YOUTUBE_MANAGED_CLIENT_ID : "",
    youtubeClientSecret: YOUTUBE_ALPHA_ENABLED ? process.env.YOUTUBE_CLIENT_SECRET ?? YOUTUBE_MANAGED_CLIENT_SECRET : "",
    youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI ?? YOUTUBE_DEFAULT_REDIRECT_URI,
    youtubeApiKey: YOUTUBE_ALPHA_ENABLED ? process.env.YOUTUBE_API_KEY ?? YOUTUBE_MANAGED_API_KEY : "",
    youtubeAlphaEnabled: YOUTUBE_ALPHA_ENABLED,
    tiktokAlphaEnabled: TIKTOK_ALPHA_ENABLED,
    tiktokSessionId: "",
    tiktokTtTargetIdc: "",
    tiktokUsername: ""
  });

  const managedTwitchClientId = (process.env.TWITCH_CLIENT_ID ?? TWITCH_MANAGED_CLIENT_ID).trim();
  if (!store.get("twitchClientId")?.trim() && managedTwitchClientId) {
    store.set("twitchClientId", managedTwitchClientId);
  }
  const managedTwitchRedirectUri = (process.env.TWITCH_REDIRECT_URI ?? TWITCH_DEFAULT_REDIRECT_URI).trim();
  if (!store.get("twitchRedirectUri")?.trim() && managedTwitchRedirectUri) {
    store.set("twitchRedirectUri", managedTwitchRedirectUri);
  }
  const managedKickClientId = (process.env.KICK_CLIENT_ID ?? KICK_MANAGED_CLIENT_ID).trim();
  if (!store.get("kickClientId")?.trim() && managedKickClientId) {
    store.set("kickClientId", managedKickClientId);
  }
  const managedKickClientSecret = (process.env.KICK_CLIENT_SECRET ?? KICK_MANAGED_CLIENT_SECRET).trim();
  if (!store.get("kickClientSecret")?.trim() && managedKickClientSecret) {
    store.set("kickClientSecret", managedKickClientSecret);
  }
  const managedKickRedirectUri = (process.env.KICK_REDIRECT_URI ?? KICK_DEFAULT_REDIRECT_URI).trim();
  if (!store.get("kickRedirectUri")?.trim() && managedKickRedirectUri) {
    store.set("kickRedirectUri", managedKickRedirectUri);
  }
  if (YOUTUBE_ALPHA_ENABLED) {
    const managedYouTubeClientId = (process.env.YOUTUBE_CLIENT_ID ?? YOUTUBE_MANAGED_CLIENT_ID).trim();
    if (!store.get("youtubeClientId")?.trim() && managedYouTubeClientId) {
      store.set("youtubeClientId", managedYouTubeClientId);
    }
    const managedYouTubeClientSecret = (process.env.YOUTUBE_CLIENT_SECRET ?? YOUTUBE_MANAGED_CLIENT_SECRET).trim();
    if (!store.get("youtubeClientSecret")?.trim() && managedYouTubeClientSecret) {
      store.set("youtubeClientSecret", managedYouTubeClientSecret);
    }
    const managedYouTubeRedirectUri = (process.env.YOUTUBE_REDIRECT_URI ?? YOUTUBE_DEFAULT_REDIRECT_URI).trim();
    if (!store.get("youtubeRedirectUri")?.trim() && managedYouTubeRedirectUri) {
      store.set("youtubeRedirectUri", managedYouTubeRedirectUri);
    }
    const managedYouTubeApiKey = (process.env.YOUTUBE_API_KEY ?? YOUTUBE_MANAGED_API_KEY).trim();
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
      youtubeLiveChatId: ""
    });
  }
  if (!TIKTOK_ALPHA_ENABLED) {
    store.set({
      tiktokAlphaEnabled: false,
      tiktokSessionId: "",
      tiktokTtTargetIdc: "",
      tiktokUsername: ""
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
    const existingSources = Array.isArray(store.get("sessionSources")) ? store.get("sessionSources") ?? [] : [];
    const filteredSources = existingSources.filter((source) => !disabledPlatforms.has(source.platform));
    const retainedIds = new Set(filteredSources.map((source) => source.id));
    const existingTabs = Array.isArray(store.get("sessionTabs")) ? store.get("sessionTabs") ?? [] : [];
    const filteredTabs = existingTabs
      .map((tab) => ({ ...tab, sourceIds: tab.sourceIds.filter((sourceId) => retainedIds.has(sourceId)) }))
      .filter((tab) => tab.sourceIds.length > 0);
    const activeTabId = store.get("sessionActiveTabId");
    const nextActiveTabId =
      typeof activeTabId === "string" && filteredTabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : (filteredTabs[0]?.id ?? "");

    store.set({
      sessionSources: filteredSources,
      sessionTabs: filteredTabs,
      sessionActiveTabId: nextActiveTabId
    });
  }

  if (store.get("youtubeAlphaEnabled") !== YOUTUBE_ALPHA_ENABLED || store.get("tiktokAlphaEnabled") !== TIKTOK_ALPHA_ENABLED) {
    store.set({
      youtubeAlphaEnabled: YOUTUBE_ALPHA_ENABLED,
      tiktokAlphaEnabled: TIKTOK_ALPHA_ENABLED
    });
  }

  if (store.get("twitchGuest") && store.get("twitchClientId")?.trim()) {
    store.set({
      twitchGuest: false,
      twitchUsername: store.get("twitchToken") ? store.get("twitchUsername") : ""
    });
  }
  if (store.get("kickGuest") && store.get("kickClientId")?.trim() && store.get("kickClientSecret")?.trim()) {
    store.set({
      kickGuest: false,
      kickUsername: store.get("kickAccessToken") ? store.get("kickUsername") : ""
    });
  }
  if ((store.get("kickScopeVersion") ?? 0) < KICK_SCOPE_VERSION) {
    store.set({
      kickAccessToken: "",
      kickRefreshToken: "",
      kickUsername: "",
      kickGuest: false,
      kickScopeVersion: KICK_SCOPE_VERSION
    });
  }
  createMainWindow();
  setupAppMenu();
  setupAutoUpdater();

  ipcMain.handle("settings:get", () => store.store);
  ipcMain.handle("settings:set", (_event, updates: AppSettings) => {
    const previousTransparent = store.get("overlayTransparent");
    const nextUpdates: Partial<AppSettings> = {
      ...updates,
      youtubeAlphaEnabled: YOUTUBE_ALPHA_ENABLED,
      tiktokAlphaEnabled: TIKTOK_ALPHA_ENABLED
    };

    if (!YOUTUBE_ALPHA_ENABLED) {
      Object.assign(nextUpdates, {
        youtubeAccessToken: "",
        youtubeRefreshToken: "",
        youtubeTokenExpiry: 0,
        youtubeUsername: "",
        youtubeLiveChatId: ""
      });
    }
    if (!TIKTOK_ALPHA_ENABLED) {
      Object.assign(nextUpdates, {
        tiktokSessionId: "",
        tiktokTtTargetIdc: "",
        tiktokUsername: ""
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
      const currentSources = Array.isArray(updates.sessionSources)
        ? updates.sessionSources
        : Array.isArray(store.get("sessionSources"))
          ? store.get("sessionSources") ?? []
          : [];
      const filteredSources = currentSources.filter((source) => !disabledPlatforms.has(source.platform));
      const retainedIds = new Set(filteredSources.map((source) => source.id));
      const currentTabs = Array.isArray(updates.sessionTabs)
        ? updates.sessionTabs
        : Array.isArray(store.get("sessionTabs"))
          ? store.get("sessionTabs") ?? []
          : [];
      const filteredTabs = currentTabs
        .map((tab) => ({
          ...tab,
          sourceIds: tab.sourceIds.filter((sourceId) => retainedIds.has(sourceId))
        }))
        .filter((tab) => tab.sourceIds.length > 0);

      const requestedActiveTabId =
        typeof updates.sessionActiveTabId === "string" ? updates.sessionActiveTabId : (store.get("sessionActiveTabId") ?? "");
      const nextActiveTabId =
        requestedActiveTabId && filteredTabs.some((tab) => tab.id === requestedActiveTabId)
          ? requestedActiveTabId
          : (filteredTabs[0]?.id ?? "");

      Object.assign(nextUpdates, {
        sessionSources: filteredSources,
        sessionTabs: filteredTabs,
        sessionActiveTabId: nextActiveTabId
      });
    }

    store.set(nextUpdates);
    const nextTransparent = store.get("overlayTransparent");
    if (overlayWindow && previousTransparent !== nextTransparent) {
      overlayWindow.close();
      createOverlayWindow();
    }
    return store.store;
  });
  ipcMain.handle("auth:twitch:signIn", async () => {
    const clientId = store.get("twitchClientId")?.trim();
    const redirectUri = store.get("twitchRedirectUri")?.trim() || TWITCH_DEFAULT_REDIRECT_URI;

    if (!clientId) {
      const guestName = `justinfan${Math.floor(Math.random() * 100000)}`;
      store.set({
        twitchToken: "",
        twitchUsername: guestName,
        twitchGuest: true
      });
      return store.store;
    }

    const state = randomToken(24);
    const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "token");
    authUrl.searchParams.set("scope", TWITCH_SCOPES.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("force_verify", "true");

    const callbackUrl = await openAuthInBrowser(authUrl.toString(), redirectUri);
    const hash = callbackUrl.includes("#") ? callbackUrl.slice(callbackUrl.indexOf("#") + 1) : "";
    const params = new URLSearchParams(hash);

    const error = params.get("error");
    if (error) {
      const description = params.get("error_description") ?? "Twitch sign-in failed.";
      throw new Error(description);
    }

    if (params.get("state") !== state) {
      throw new Error("Twitch sign-in was rejected (state mismatch).");
    }

    const accessToken = params.get("access_token");
    if (!accessToken) {
      throw new Error("Twitch did not return an access token.");
    }

    type TwitchValidateResponse = {
      login?: string;
    };

    const validateResponse = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Authorization: `OAuth ${accessToken}`
      }
    });
    const validated = await fetchJsonOrThrow<TwitchValidateResponse>(validateResponse, "Twitch token validation");

    if (!validated.login) {
      throw new Error("Twitch token validation did not include a username.");
    }

    store.set({
      twitchToken: accessToken,
      twitchUsername: validated.login,
      twitchGuest: false,
      twitchRedirectUri: redirectUri
    });

    return store.store;
  });
  ipcMain.handle("auth:twitch:signOut", () => {
    store.set({
      twitchToken: "",
      twitchUsername: "",
      twitchGuest: false
    });
    return store.store;
  });
  ipcMain.handle("auth:kick:signIn", async () => {
    const clientId = store.get("kickClientId")?.trim();
    const clientSecret = store.get("kickClientSecret")?.trim();
    const redirectUri = store.get("kickRedirectUri")?.trim() || KICK_DEFAULT_REDIRECT_URI;

    if (!clientId) {
      store.set({
        kickAccessToken: "",
        kickRefreshToken: "",
        kickUsername: "guest",
        kickGuest: true
      });
      return store.store;
    }
    if (!clientSecret) {
      store.set({
        kickAccessToken: "",
        kickRefreshToken: "",
        kickUsername: "guest",
        kickGuest: true
      });
      return store.store;
    }

    const state = randomToken(24);
    const codeVerifier = randomToken(48);
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    const authUrl = new URL("https://id.kick.com/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", KICK_SCOPES.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const callbackUrl = await openAuthInBrowser(authUrl.toString(), redirectUri);
    const callback = new URL(callbackUrl);
    const error = callback.searchParams.get("error");
    if (error) {
      const description = callback.searchParams.get("error_description") ?? "Kick sign-in failed.";
      throw new Error(description);
    }

    if (callback.searchParams.get("state") !== state) {
      throw new Error("Kick sign-in was rejected (state mismatch).");
    }

    const code = callback.searchParams.get("code");
    if (!code) {
      throw new Error("Kick did not return an authorization code.");
    }

    type KickTokenResponse = {
      access_token?: string;
      refresh_token?: string;
    };

    const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier
      })
    });
    const tokens = await fetchJsonOrThrow<KickTokenResponse>(tokenResponse, "Kick token exchange");

    if (!tokens.access_token) {
      throw new Error("Kick token exchange did not return an access token.");
    }

    const userResponse = await fetch("https://api.kick.com/public/v1/users", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json"
      }
    });
    const userPayload = await fetchJsonOrThrow<unknown>(userResponse, "Kick user profile");
    const username = parseKickUserName(userPayload);

    store.set({
      kickAccessToken: tokens.access_token,
      kickRefreshToken: tokens.refresh_token ?? "",
      kickUsername: username ?? "",
      kickGuest: false,
      kickRedirectUri: redirectUri
    });

    return store.store;
  });
  ipcMain.handle("auth:kick:signOut", () => {
    store.set({
      kickAccessToken: "",
      kickRefreshToken: "",
      kickUsername: "",
      kickGuest: false
    });
    return store.store;
  });
  ipcMain.handle("auth:youtube:signIn", async () => {
    assertYouTubeAlphaEnabled();
    const { clientId, clientSecret, redirectUri } = youtubeConfig();
    if (!clientId) {
      throw new Error(YOUTUBE_MISSING_OAUTH_MESSAGE);
    }

    const state = randomToken(24);
    const codeVerifier = randomToken(48);
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", codeChallenge);

    const callbackUrl = await openAuthInBrowser(authUrl.toString(), redirectUri);
    const callback = new URL(callbackUrl);

    const error = callback.searchParams.get("error");
    if (error) {
      const description = callback.searchParams.get("error_description") ?? "YouTube sign-in failed.";
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
      code_verifier: codeVerifier
    });
    if (clientSecret) {
      tokenParams.set("client_secret", clientSecret);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: tokenParams
    });
    const tokens = await fetchJsonOrThrow<YouTubeTokenResponse>(tokenResponse, "YouTube token exchange");
    if (!tokens.access_token) {
      throw new Error("YouTube token exchange did not return an access token.");
    }

    saveYouTubeTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in
    });

    let username = store.get("youtubeUsername")?.trim() ?? "";
    try {
      const channelResponse = await youtubeFetchWithAuth(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=1"
      );
      const channelPayload = await fetchJsonOrThrow<YouTubeChannelsResponse>(channelResponse, "YouTube profile");
      const first = Array.isArray(channelPayload.items) ? channelPayload.items[0] : undefined;
      username = first?.snippet?.title?.trim() ?? username;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[youtube] profile lookup skipped after sign-in: ${detail}`);
    }

    store.set({
      youtubeUsername: username,
      youtubeRedirectUri: redirectUri
    });

    return store.store;
  });
  ipcMain.handle("auth:youtube:signOut", () => {
    store.set({
      youtubeAccessToken: "",
      youtubeRefreshToken: "",
      youtubeTokenExpiry: 0,
      youtubeUsername: "",
      youtubeLiveChatId: ""
    });
    return store.store;
  });
  ipcMain.handle("auth:tiktok:signIn", async () => {
    assertTikTokAlphaEnabled();
    const authSession = session.fromPartition(TIKTOK_AUTH_PARTITION);
    attemptTikTokBrowserSignIn();
    const credentials = await openTikTokSignInWindow();
    store.set({
      tiktokSessionId: credentials.sessionId,
      tiktokTtTargetIdc: credentials.ttTargetIdc,
      tiktokUsername: store.get("tiktokUsername")?.trim() || "signed-in"
    });
    const resolved = await readTikTokAuthFromSession(authSession);
    if (!resolved) {
      throw new Error("TikTok sign-in completed, but session cookies were not persisted.");
    }
    return store.store;
  });
  ipcMain.handle("auth:tiktok:signOut", async () => {
    const authSession = session.fromPartition(TIKTOK_AUTH_PARTITION);
    await clearTikTokAuthSession(authSession);
    store.set({
      tiktokSessionId: "",
      tiktokTtTargetIdc: "",
      tiktokUsername: ""
    });
    await disconnectAllTikTokConnections();
    return store.store;
  });
  ipcMain.handle("kick:resolveChatroom", async (_event, channel: string) => {
    const slug = channel.trim().toLowerCase();
    if (!slug) {
      throw new Error("Kick channel is required.");
    }

    let lookup = await resolveKickChannelViaHttp(slug);
    if ((!lookup.ok || !parseKickChatroomId(lookup.payload)) && lookup.status === 403) {
      lookup = await resolveKickChannelViaBrowser(slug);
    }

    if (!lookup.ok) {
      throw new Error(lookup.message);
    }

    const chatroomId = parseKickChatroomId(lookup.payload);
    if (!chatroomId) {
      throw new Error("Kick chatroom id not found for this channel.");
    }
    return { chatroomId };
  });
  ipcMain.handle("youtube:resolveLiveChat", async (_event, channel: string) => {
    assertYouTubeAlphaEnabled();
    const input = channel.trim();
    if (!input) {
      throw new Error("YouTube channel is required.");
    }
    const resolved = await resolveYouTubeLiveChat(input);
    store.set({
      youtubeLiveChatId: resolved.liveChatId
    });
    return resolved;
  });
  ipcMain.handle("youtube:fetchMessages", async (_event, payload: { liveChatId?: string; pageToken?: string }) => {
    assertYouTubeAlphaEnabled();
    const liveChatId = payload?.liveChatId?.trim();
    if (!liveChatId) {
      throw new Error("YouTube live chat id is required.");
    }
    const requestUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    requestUrl.searchParams.set("part", "id,snippet,authorDetails");
    requestUrl.searchParams.set("liveChatId", liveChatId);
    requestUrl.searchParams.set("maxResults", "200");
    const pageToken = payload?.pageToken?.trim();
    if (pageToken) {
      requestUrl.searchParams.set("pageToken", pageToken);
    }

    const response = await youtubeFetchReadOnly(requestUrl);
    const data = await fetchJsonOrThrow<{
      nextPageToken?: string;
      pollingIntervalMillis?: number;
      items?: unknown[];
    }>(response, "YouTube live chat messages");

    return {
      nextPageToken: data.nextPageToken,
      pollingIntervalMillis: data.pollingIntervalMillis,
      items: Array.isArray(data.items) ? data.items : []
    };
  });
  ipcMain.handle("youtube:sendMessage", async (_event, payload: { liveChatId?: string; message?: string }) => {
    assertYouTubeAlphaEnabled();
    const liveChatId = payload?.liveChatId?.trim();
    const message = payload?.message?.trim();
    if (!liveChatId) {
      throw new Error("YouTube live chat id is required.");
    }
    if (!message) {
      throw new Error("Message cannot be empty.");
    }

    const endpoint = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    endpoint.searchParams.set("part", "snippet");

    const response = await youtubeFetchWithAuth(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        snippet: {
          liveChatId,
          type: "textMessageEvent",
          textMessageDetails: {
            messageText: message
          }
        }
      })
    });
    await fetchJsonOrThrow<unknown>(response, "YouTube send message");
  });
  ipcMain.handle("tiktok:connect", async (_event, channel: string) => {
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
      enableRequestPolling: true
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
      connectionOptions as ConstructorParameters<typeof TikTokLiveConnection>[1]
    ) as unknown as TikTokConnection;
    const record: TikTokConnectionRecord = {
      connectionId,
      channel: normalizedChannel,
      connection
    };

    tiktokConnections.set(connectionId, record);

    let connectedEventSent = false;
    const emitConnected = () => {
      if (connectedEventSent) return;
      connectedEventSent = true;
      emitTikTokEvent({
        connectionId,
        type: "connected",
        roomId: record.roomId
      });
    };

    connection.on(WebcastEvent.CHAT, (payload: unknown) => {
      const message = normalizeTikTokChatMessage(normalizedChannel, payload);
      if (!message) return;
      emitTikTokEvent({
        connectionId,
        type: "chat",
        roomId: record.roomId,
        message
      });
    });

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
        error: reason || undefined
      });
    });

    connection.on(ControlEvent.ERROR, (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      emitTikTokEvent({
        connectionId,
        type: "error",
        roomId: record.roomId,
        error: text
      });
    });

    try {
      const state = (await connection.connect()) as Record<string, unknown> | null;
      const roomId = asString(asUnknownRecord(state)?.roomId).trim();
      if (roomId) {
        record.roomId = roomId;
      }
      emitConnected();
      return {
        connectionId,
        roomId: record.roomId
      };
    } catch (error) {
      tiktokConnections.delete(connectionId);
      connection.removeAllListeners?.();
      const text = error instanceof Error ? error.message : String(error);
      emitTikTokEvent({
        connectionId,
        type: "error",
        error: text
      });
      throw new Error(`TikTok connect failed: ${text}`);
    }
  });
  ipcMain.handle("tiktok:disconnect", async (_event, connectionId: string) => {
    const id = connectionId.trim();
    if (!id) return;
    await disconnectTikTokConnection(id);
  });
  ipcMain.handle("tiktok:sendMessage", async (_event, payload: { connectionId?: string; message?: string }) => {
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
  });
  ipcMain.handle("log:write", (_event, message: string) => {
    const verbose = store.get("verboseLogs");
    if (verbose) writeLog(message);
  });
  ipcMain.handle("log:toggle", (_event, enabled: boolean) => {
    store.set("verboseLogs", enabled);
  });
  ipcMain.handle("overlay:open", () => createOverlayWindow());
  ipcMain.handle("overlay:close", () => {
    overlayWindow?.close();
  });
  ipcMain.handle("viewer:open", () => createViewerWindow());
  ipcMain.handle("viewer:close", () => {
    viewerWindow?.close();
  });
  ipcMain.handle("updates:check", async () => {
    return requestUpdateCheck();
  });
  ipcMain.handle("updates:download", async () => {
    if (!app.isPackaged) {
      setUpdateStatus("not-available", DEV_UPDATE_MESSAGE);
      return;
    }
    try {
      setUpdateStatus("downloading", "Downloading update...");
      await autoUpdater.downloadUpdate();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setUpdateStatus("error", `Update download failed: ${text}`);
    }
  });
  ipcMain.handle("updates:install", () => {
    if (!app.isPackaged) {
      setUpdateStatus("not-available", DEV_UPDATE_MESSAGE);
      return;
    }
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle("updates:getStatus", () => updateStatus);

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
  void disconnectAllTikTokConnections();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
