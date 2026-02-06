const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

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
  overlayTransparent?: boolean;
  verboseLogs?: boolean;
  columns?: number;
  hideCommands?: boolean;
  keywordFilters?: string[];
  highlightKeywords?: string[];
  sessionSources?: Array<{
    id: string;
    platform: "twitch" | "kick" | "youtube";
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

type ChatLogEntry = {
  platform: "twitch" | "kick" | "youtube";
  channel: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: string;
};

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  setSettings: (updates: AppSettings): Promise<AppSettings> => ipcRenderer.invoke("settings:set", updates),
  writeLog: (message: string): Promise<void> => ipcRenderer.invoke("log:write", message),
  toggleVerbose: (enabled: boolean): Promise<void> => ipcRenderer.invoke("log:toggle", enabled),
  appendChatLog: (entry: ChatLogEntry): Promise<void> => ipcRenderer.invoke("chatlog:append", entry),
  openChatLogsDir: (): Promise<string> => ipcRenderer.invoke("chatlog:openDir"),
  openOverlay: (): Promise<void> => ipcRenderer.invoke("overlay:open"),
  closeOverlay: (): Promise<void> => ipcRenderer.invoke("overlay:close"),
  openViewer: (): Promise<void> => ipcRenderer.invoke("viewer:open"),
  closeViewer: (): Promise<void> => ipcRenderer.invoke("viewer:close"),
  signInTwitch: (): Promise<AppSettings> => ipcRenderer.invoke("auth:twitch:signIn"),
  signOutTwitch: (): Promise<AppSettings> => ipcRenderer.invoke("auth:twitch:signOut"),
  signInKick: (): Promise<AppSettings> => ipcRenderer.invoke("auth:kick:signIn"),
  signOutKick: (): Promise<AppSettings> => ipcRenderer.invoke("auth:kick:signOut"),
  signInYouTube: (): Promise<AppSettings> => ipcRenderer.invoke("auth:youtube:signIn"),
  signOutYouTube: (): Promise<AppSettings> => ipcRenderer.invoke("auth:youtube:signOut"),
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
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:check"),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke("updates:download"),
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
