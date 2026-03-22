import type {
  AppSettings,
  AuthHealthSnapshot,
  ModerationRequest,
  TikTokRendererEvent,
  UpdateChannel,
  UpdateStatus
} from "../shared/types.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const IPC_CHANNELS = {
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  LOG_WRITE: "log:write",
  LOG_TOGGLE: "log:toggle",
  AUTH_TWITCH_SIGN_IN: "auth:twitch:signIn",
  AUTH_TWITCH_SIGN_OUT: "auth:twitch:signOut",
  AUTH_KICK_SIGN_IN: "auth:kick:signIn",
  AUTH_KICK_SIGN_OUT: "auth:kick:signOut",
  AUTH_KICK_REFRESH: "auth:kick:refresh",
  AUTH_KICK_CONFIGURE_LOCAL: "auth:kick:configureLocal",
  AUTH_YOUTUBE_SIGN_IN: "auth:youtube:signIn",
  AUTH_YOUTUBE_SIGN_OUT: "auth:youtube:signOut",
  AUTH_TIKTOK_SIGN_IN: "auth:tiktok:signIn",
  AUTH_TIKTOK_SIGN_OUT: "auth:tiktok:signOut",
  AUTH_GET_HEALTH: "auth:getHealth",
  AUTH_TEST_PERMISSIONS: "auth:testPermissions",
  MODERATION_ACT: "moderation:act",
  MODERATION_CAN_MODERATE: "moderation:canModerate",
  KICK_RESOLVE_CHATROOM: "kick:resolveChatroom",
  YOUTUBE_RESOLVE_LIVE_CHAT: "youtube:resolveLiveChat",
  YOUTUBE_FETCH_MESSAGES: "youtube:fetchMessages",
  YOUTUBE_SEND_MESSAGE: "youtube:sendMessage",
  TIKTOK_CONNECT: "tiktok:connect",
  TIKTOK_DISCONNECT: "tiktok:disconnect",
  TIKTOK_SEND_MESSAGE: "tiktok:sendMessage",
  TIKTOK_EVENT: "tiktok:event",
  UPDATES_CHECK: "updates:check",
  UPDATES_DOWNLOAD: "updates:download",
  UPDATES_SET_CHANNEL: "updates:setChannel",
  UPDATES_INSTALL: "updates:install",
  UPDATES_GET_STATUS: "updates:getStatus",
  UPDATES_STATUS_EVENT: "updates:status"
} as const;

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  setSettings: (updates: AppSettings): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, updates),
  writeLog: (message: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.LOG_WRITE, message),
  toggleVerbose: (enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.LOG_TOGGLE, enabled),
  signInTwitch: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_TWITCH_SIGN_IN),
  signOutTwitch: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_TWITCH_SIGN_OUT),
  signInKick: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_KICK_SIGN_IN),
  configureKickLocalAuth: (payload: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_KICK_CONFIGURE_LOCAL, payload),
  signOutKick: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_KICK_SIGN_OUT),
  refreshKickAuth: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_KICK_REFRESH),
  signInYouTube: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_YOUTUBE_SIGN_IN),
  signOutYouTube: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_YOUTUBE_SIGN_OUT),
  signInTikTok: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_TIKTOK_SIGN_IN),
  signOutTikTok: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_TIKTOK_SIGN_OUT),
  getAuthHealth: (): Promise<AuthHealthSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_HEALTH),
  testAuthPermissions: (): Promise<AuthHealthSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_TEST_PERMISSIONS),
  moderateChat: (payload: ModerationRequest): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MODERATION_ACT, payload),
  canModerateSource: (payload: { platform: "twitch" | "kick" | "youtube" | "tiktok"; channel: string }): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MODERATION_CAN_MODERATE, payload),
  resolveKickChatroom: (channel: string): Promise<{ chatroomId: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.KICK_RESOLVE_CHATROOM, channel),
  resolveYouTubeLiveChat: (channel: string): Promise<{ liveChatId: string; channelId: string; channelTitle: string; videoId: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_RESOLVE_LIVE_CHAT, channel),
  youtubeFetchMessages: (payload: { liveChatId: string; pageToken?: string }): Promise<{
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    items?: unknown[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_FETCH_MESSAGES, payload),
  youtubeSendMessage: (payload: { liveChatId: string; message: string }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_SEND_MESSAGE, payload),
  tiktokConnect: (channel: string): Promise<{ connectionId: string; roomId?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.TIKTOK_CONNECT, channel),
  tiktokDisconnect: (connectionId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.TIKTOK_DISCONNECT, connectionId),
  tiktokSendMessage: (payload: { connectionId: string; message: string }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.TIKTOK_SEND_MESSAGE, payload),
  onTikTokEvent: (callback: (event: TikTokRendererEvent) => void): (() => void) => {
    const listener = (_event: unknown, payload: TikTokRendererEvent) => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.TIKTOK_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TIKTOK_EVENT, listener);
  },
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_CHECK),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_DOWNLOAD),
  setUpdateChannel: (channel: UpdateChannel): Promise<UpdateStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATES_SET_CHANNEL, channel),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_INSTALL),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_GET_STATUS),
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: UpdateStatus) => {
      callback(status);
    };
    ipcRenderer.on(IPC_CHANNELS.UPDATES_STATUS_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATES_STATUS_EVENT, listener);
  }
};

contextBridge.exposeInMainWorld("electronAPI", api);
