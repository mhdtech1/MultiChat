import type {
  AppSettings,
  AuthHealthSnapshot,
  ModerationRequest,
  TikTokRendererEvent,
  UpdateChannel,
  UpdateStatus,
  OverlayFeedEvent
} from "../shared/types";

type ElectronAPI = {
  getSettings: () => Promise<AppSettings>;
  setSettings: (updates: AppSettings) => Promise<AppSettings>;
  writeLog: (message: string) => Promise<void>;
  toggleVerbose: (enabled: boolean) => Promise<void>;
  openOverlay: () => Promise<void>;
  closeOverlay: () => Promise<void>;
  setOverlayLocked: (locked: boolean) => Promise<{ locked: boolean }>;
  getObsOverlayUrl: () => Promise<string>;
  pushObsOverlayEvent: (payload: OverlayFeedEvent) => void;
  signInTwitch: () => Promise<AppSettings>;
  signOutTwitch: () => Promise<AppSettings>;
  signInKick: () => Promise<AppSettings>;
  signOutKick: () => Promise<AppSettings>;
  refreshKickAuth: () => Promise<AppSettings>;
  signInYouTube: () => Promise<AppSettings>;
  signOutYouTube: () => Promise<AppSettings>;
  signInTikTok: () => Promise<AppSettings>;
  signOutTikTok: () => Promise<AppSettings>;
  getAuthHealth: () => Promise<AuthHealthSnapshot>;
  testAuthPermissions: () => Promise<AuthHealthSnapshot>;
  moderateChat: (payload: ModerationRequest) => Promise<void>;
  canModerateSource: (payload: { platform: "twitch" | "kick" | "youtube" | "tiktok"; channel: string }) => Promise<boolean>;
  resolveKickChatroom: (channel: string) => Promise<{ chatroomId: number }>;
  resolveYouTubeLiveChat: (channel: string) => Promise<{
    liveChatId: string;
    channelId: string;
    channelTitle: string;
    videoId: string;
  }>;
  youtubeFetchMessages: (payload: { liveChatId: string; pageToken?: string }) => Promise<{
    nextPageToken?: string;
    pollingIntervalMillis?: number;
    items?: unknown[];
  }>;
  youtubeSendMessage: (payload: { liveChatId: string; message: string }) => Promise<void>;
  tiktokConnect: (channel: string) => Promise<{ connectionId: string; roomId?: string }>;
  tiktokDisconnect: (connectionId: string) => Promise<void>;
  tiktokSendMessage: (payload: { connectionId: string; message: string }) => Promise<void>;
  onTikTokEvent: (callback: (event: TikTokRendererEvent) => void) => () => void;
  checkForUpdates: () => Promise<UpdateStatus>;
  downloadUpdate: () => Promise<void>;
  setUpdateChannel: (channel: UpdateChannel) => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
