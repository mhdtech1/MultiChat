const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

type AppSettings = {
  workspacePreset?: "streamer" | "moddesk" | "viewer";
  theme?: "dark" | "light" | "classic";
  mentionMutedTabIds?: string[];
  mentionSnoozeUntilByTab?: Record<string, number>;
  tabSendRules?: Record<string, {
    defaultTarget?: "all" | "first" | "specific";
    sourceId?: string;
    confirmOnSendAll?: boolean;
    blockSendAll?: boolean;
  }>;
  pinnedMessageByTabId?: Record<string, {
    platform: "twitch" | "kick" | "youtube" | "tiktok";
    channel: string;
    displayName: string;
    message: string;
    timestamp: string;
  }>;
  localPollByTabId?: Record<string, {
    id: string;
    question: string;
    options: Array<{ id: string; label: string; votes: number }>;
    active: boolean;
    createdAt: string;
  }>;
  twitchToken?: string;
  twitchUsername?: string;
  twitchGuest?: boolean;
  twitchScopeVersion?: number;
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
  verboseLogs?: boolean;
  performanceMode?: boolean;
  smartFilterSpam?: boolean;
  smartFilterScam?: boolean;
  confirmSendAll?: boolean;
  updateChannel?: "stable" | "beta";
  tabAlertRules?: Record<string, {
    keyword?: string;
    sound?: boolean;
    notify?: boolean;
  }>;
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
  setupWizardCompleted?: boolean;
  setupWizardVersion?: number;
  setupWizardSendTestCompleted?: boolean;
  lastLaunchedVersion?: string;
  forcedResetAppliedVersion?: string;
};

type UpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  message: string;
  channel: "stable" | "beta";
  currentVersion: string;
  availableVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
};

type AuthPermissionSnapshot = {
  platform: "twitch" | "kick";
  signedIn: boolean;
  username: string;
  canSend: boolean;
  canModerate: boolean;
  tokenExpiry: number | null;
  lastCheckedAt: number;
  error?: string;
};

type AuthHealthSnapshot = {
  twitch: AuthPermissionSnapshot;
  kick: AuthPermissionSnapshot;
  youtubeTokenExpiry: number | null;
  updateChannel: "stable" | "beta";
};

type TikTokRendererEvent = {
  connectionId: string;
  type: "connected" | "disconnected" | "chat" | "error";
  roomId?: string;
  message?: unknown;
  error?: string;
};

type ModeratorAction = "timeout_60" | "timeout_600" | "ban" | "unban" | "delete";

type ModerationRequest = {
  platform: "twitch" | "kick";
  channel: string;
  action: ModeratorAction;
  username?: string;
  messageId?: string;
  targetUserId?: number;
};

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (updates: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:set", updates),
  writeLog: (message: string): Promise<void> => ipcRenderer.invoke("log:write", message),
  toggleVerbose: (enabled: boolean): Promise<void> => ipcRenderer.invoke("log:toggle", enabled),
  openOverlay: (): Promise<void> => ipcRenderer.invoke("overlay:open"),
  closeOverlay: (): Promise<void> => ipcRenderer.invoke("overlay:close"),
  setOverlayLocked: (locked: boolean): Promise<{ locked: boolean }> =>
    ipcRenderer.invoke("overlay:setLocked", locked),
  signInTwitch: (): Promise<AppSettings> => ipcRenderer.invoke("auth:twitch:signIn"),
  signOutTwitch: (): Promise<AppSettings> => ipcRenderer.invoke("auth:twitch:signOut"),
  signInKick: (): Promise<AppSettings> => ipcRenderer.invoke("auth:kick:signIn"),
  signOutKick: (): Promise<AppSettings> => ipcRenderer.invoke("auth:kick:signOut"),
  refreshKickAuth: (): Promise<AppSettings> => ipcRenderer.invoke("auth:kick:refresh"),
  signInYouTube: (): Promise<AppSettings> => ipcRenderer.invoke("auth:youtube:signIn"),
  signOutYouTube: (): Promise<AppSettings> => ipcRenderer.invoke("auth:youtube:signOut"),
  signInTikTok: (): Promise<AppSettings> => ipcRenderer.invoke("auth:tiktok:signIn"),
  signOutTikTok: (): Promise<AppSettings> => ipcRenderer.invoke("auth:tiktok:signOut"),
  getAuthHealth: (): Promise<AuthHealthSnapshot> => ipcRenderer.invoke("auth:getHealth"),
  testAuthPermissions: (): Promise<AuthHealthSnapshot> => ipcRenderer.invoke("auth:testPermissions"),
  moderateChat: (payload: ModerationRequest): Promise<void> => ipcRenderer.invoke("moderation:act", payload),
  canModerateSource: (payload: { platform: "twitch" | "kick"; channel: string }): Promise<boolean> =>
    ipcRenderer.invoke("moderation:canModerate", payload),
  resolveKickChatroom: (channel: string): Promise<{ chatroomId: number }> =>
    ipcRenderer.invoke("kick:resolveChatroom", channel),
  resolveYouTubeLiveChat: (channel: string): Promise<{ liveChatId: string; channelId: string; channelTitle: string; videoId: string }> =>
    ipcRenderer.invoke("youtube:resolveLiveChat", channel),
  youtubeFetchMessages: (payload: { liveChatId: string; pageToken?: string }): Promise<{
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    items?: unknown[];
  }> => ipcRenderer.invoke("youtube:fetchMessages", payload),
  youtubeSendMessage: (payload: { liveChatId: string; message: string }): Promise<void> =>
    ipcRenderer.invoke("youtube:sendMessage", payload),
  tiktokConnect: (channel: string): Promise<{ connectionId: string; roomId?: string }> =>
    ipcRenderer.invoke("tiktok:connect", channel),
  tiktokDisconnect: (connectionId: string): Promise<void> => ipcRenderer.invoke("tiktok:disconnect", connectionId),
  tiktokSendMessage: (payload: { connectionId: string; message: string }): Promise<void> =>
    ipcRenderer.invoke("tiktok:sendMessage", payload),
  onTikTokEvent: (callback: (event: TikTokRendererEvent) => void): (() => void) => {
    const listener = (_event: unknown, payload: TikTokRendererEvent) => {
      callback(payload);
    };
    ipcRenderer.on("tiktok:event", listener);
    return () => ipcRenderer.removeListener("tiktok:event", listener);
  },
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:check"),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke("updates:download"),
  setUpdateChannel: (channel: "stable" | "beta"): Promise<UpdateStatus> => ipcRenderer.invoke("updates:setChannel", channel),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("updates:install"),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:getStatus"),
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => {
      callback(status);
    };
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  }
};

contextBridge.exposeInMainWorld("electronAPI", api);
