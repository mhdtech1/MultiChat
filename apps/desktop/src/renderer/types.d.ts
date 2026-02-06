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

type ElectronAPI = {
  getSettings: () => Promise<AppSettings>;
  setSettings: (updates: AppSettings) => Promise<AppSettings>;
  writeLog: (message: string) => Promise<void>;
  toggleVerbose: (enabled: boolean) => Promise<void>;
  appendChatLog: (entry: ChatLogEntry) => Promise<void>;
  openChatLogsDir: () => Promise<string>;
  openOverlay: () => Promise<void>;
  closeOverlay: () => Promise<void>;
  openViewer: () => Promise<void>;
  closeViewer: () => Promise<void>;
  signInTwitch: () => Promise<AppSettings>;
  signOutTwitch: () => Promise<AppSettings>;
  signInKick: () => Promise<AppSettings>;
  signOutKick: () => Promise<AppSettings>;
  resolveKickChatroom: (channel: string) => Promise<{ chatroomId: number }>;
  checkForUpdates: () => Promise<UpdateStatus>;
  downloadUpdate: () => Promise<void>;
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
