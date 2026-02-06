import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto from "node:crypto";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

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
  youtubeApiKey?: string;
  youtubeLiveChatId?: string;
  overlayTransparent?: boolean;
  verboseLogs?: boolean;
  columns?: number;
  hideCommands?: boolean;
  keywordFilters?: string[];
  highlightKeywords?: string[];
  sessionSources?: Array<{
    id: string;
    platform: "twitch" | "kick";
    channel: string;
    key: string;
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

type ChatLogEntry = {
  platform: "twitch" | "kick" | "youtube";
  channel: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: string;
};

const DEV_UPDATE_MESSAGE = "Auto updates are available in packaged builds only.";
const DEFAULT_UPDATE_MESSAGE = "Checking for updates shortly...";
const TWITCH_DEFAULT_REDIRECT_URI = "http://localhost:51730/twitch/callback";
const KICK_DEFAULT_REDIRECT_URI = "http://localhost:51730/kick/callback";
const TWITCH_MANAGED_CLIENT_ID = "syeui9mom7i5f9060j03tydgpdywbh";
const KICK_MANAGED_CLIENT_ID = "01KGRFF03VYRJMB3W4369Y07CS";
const KICK_MANAGED_CLIENT_SECRET = "29f43591eb0496352c66ea36f55c5c21e3fbc5053ba22568194e0c950c174794";
const TWITCH_SCOPES = ["chat:read", "chat:edit"];
const KICK_SCOPES = ["user:read", "channel:read", "chat:write"];
const KICK_SCOPE_VERSION = 2;

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

class AuthPopupClosedError extends Error {
  constructor() {
    super("Sign-in window closed before authentication completed.");
  }
}

const normalizePathname = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
};

const matchesRedirectUri = (candidateUrl: string, redirectUri: string) => {
  try {
    const candidate = new URL(candidateUrl);
    const redirect = new URL(redirectUri);
    return candidate.origin === redirect.origin && normalizePathname(candidate.pathname) === normalizePathname(redirect.pathname);
  } catch {
    return false;
  }
};

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

const fetchJsonOrThrow = async <T>(response: Response, source: string): Promise<T> => {
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = typeof parsed?.message === "string" ? parsed.message : `${source} request failed (${response.status}).`;
    throw new Error(message);
  }
  return parsed as T;
};

const openAuthPopup = async (authUrl: string, redirectUri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 760,
      parent: mainWindow ?? undefined,
      modal: Boolean(mainWindow),
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    let settled = false;

    const finish = (callbackUrl?: string, error?: Error) => {
      if (settled) return;
      settled = true;

      authWindow.removeAllListeners("closed");
      authWindow.webContents.removeAllListeners("will-redirect");
      authWindow.webContents.removeAllListeners("will-navigate");
      authWindow.webContents.removeAllListeners("did-fail-load");

      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }

      if (error) {
        reject(error);
        return;
      }
      resolve(callbackUrl ?? "");
    };

    const onNavigate = (event: Electron.Event, targetUrl: string) => {
      if (!matchesRedirectUri(targetUrl, redirectUri)) return;
      event.preventDefault();
      finish(targetUrl);
    };

    authWindow.webContents.on("will-redirect", onNavigate);
    authWindow.webContents.on("will-navigate", onNavigate);
    authWindow.webContents.on("did-fail-load", (_event, _code, _description, validatedUrl) => {
      if (matchesRedirectUri(validatedUrl, redirectUri)) {
        finish(validatedUrl);
      }
    });

    authWindow.on("closed", () => {
      finish(undefined, new AuthPopupClosedError());
    });

    authWindow.loadURL(authUrl).catch((error) => {
      finish(undefined, new Error(`Failed to open auth window: ${String(error)}`));
    });
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

const logFilePath = () => path.join(app.getPath("userData"), "app.log");
const chatLogsDirPath = () => path.join(app.getPath("userData"), "chat-logs");

const sanitizePathSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 80) || "unknown";

const writeLog = (message: string) => {
  const formatted = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFilePath(), formatted);
};

const appendChatLog = (entry: ChatLogEntry) => {
  const timestamp = new Date(entry.timestamp);
  const safeTimestamp = Number.isFinite(timestamp.getTime()) ? timestamp : new Date();
  const day = safeTimestamp.toISOString().slice(0, 10);
  const platform = sanitizePathSegment(entry.platform);
  const channel = sanitizePathSegment(entry.channel);
  const folder = path.join(chatLogsDirPath(), day, platform);
  const filePath = path.join(folder, `${channel}.log`);
  fs.mkdirSync(folder, { recursive: true });

  const display = entry.displayName || entry.username || "unknown";
  const line = `[${safeTimestamp.toISOString()}] ${display}: ${entry.message.replace(/\r?\n/g, " ")}\n`;
  fs.appendFileSync(filePath, line, "utf8");
};

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let viewerWindow: BrowserWindow | null = null;
let updateStatus: UpdateStatus = { state: "idle", message: "" };
let store!: JsonSettingsStore;
let updaterInitialized = false;

const updateStatusToRenderer = () => {
  if (mainWindow) {
    mainWindow.webContents.send("updates:status", updateStatus);
  }
};

const setUpdateStatus = (state: UpdateStatus["state"], message: string) => {
  updateStatus = { state, message };
  updateStatusToRenderer();
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
    setUpdateStatus("error", `Updater error: ${text}`);
  });

  setUpdateStatus("idle", DEFAULT_UPDATE_MESSAGE);
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      const text = error instanceof Error ? error.message : String(error);
      setUpdateStatus("error", `Update check failed: ${text}`);
    });
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
    kickRedirectUri: process.env.KICK_REDIRECT_URI ?? KICK_DEFAULT_REDIRECT_URI
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
  setupAutoUpdater();

  ipcMain.handle("settings:get", () => store.store);
  ipcMain.handle("settings:set", (_event, updates: AppSettings) => {
    const previousTransparent = store.get("overlayTransparent");
    store.set(updates);
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

    const callbackUrl = await openAuthPopup(authUrl.toString(), redirectUri);
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

    const callbackUrl = await openAuthPopup(authUrl.toString(), redirectUri);
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
  ipcMain.handle("log:write", (_event, message: string) => {
    const verbose = store.get("verboseLogs");
    if (verbose) writeLog(message);
  });
  ipcMain.handle("log:toggle", (_event, enabled: boolean) => {
    store.set("verboseLogs", enabled);
  });
  ipcMain.handle("chatlog:append", (_event, entry: ChatLogEntry) => {
    appendChatLog(entry);
  });
  ipcMain.handle("chatlog:openDir", async () => {
    const dir = chatLogsDirPath();
    fs.mkdirSync(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) {
      throw new Error(error);
    }
    return dir;
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
    if (!app.isPackaged) {
      setUpdateStatus("not-available", DEV_UPDATE_MESSAGE);
      return updateStatus;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setUpdateStatus("error", `Update check failed: ${text}`);
    }
    return updateStatus;
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

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
