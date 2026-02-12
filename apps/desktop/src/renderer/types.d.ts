type AppSettings = {
  theme?: "dark" | "light" | "classic";
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

type ElectronAPI = {
  getSettings: () => Promise<AppSettings>;
  setSettings: (updates: AppSettings) => Promise<AppSettings>;
  writeLog: (message: string) => Promise<void>;
  toggleVerbose: (enabled: boolean) => Promise<void>;
  openOverlay: () => Promise<void>;
  closeOverlay: () => Promise<void>;
  setOverlayLocked: (locked: boolean) => Promise<{ locked: boolean }>;
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
  setUpdateChannel: (channel: "stable" | "beta") => Promise<UpdateStatus>;
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
