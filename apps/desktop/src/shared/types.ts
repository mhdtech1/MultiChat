export type WorkspacePreset = "streamer" | "moddesk" | "viewer";
export type ThemeOption = "dark" | "light" | "classic";
export type Platform = "twitch" | "kick" | "youtube" | "tiktok";
export type UpdateChannel = "stable" | "beta";
export type ModeratorAction = "timeout_60" | "timeout_600" | "ban" | "unban" | "delete";

export type TabSendRule = {
  defaultTarget?: "all" | "first" | "specific";
  sourceId?: string;
  confirmOnSendAll?: boolean;
  blockSendAll?: boolean;
};

export type PinnedMessageSnapshot = {
  platform: Platform;
  channel: string;
  displayName: string;
  message: string;
  timestamp: string;
};

export type LocalTabPoll = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; votes: number }>;
  active: boolean;
  createdAt: string;
};

export type TabAlertRule = {
  keyword?: string;
  sound?: boolean;
  notify?: boolean;
  mentionSound?: boolean;
  mentionNotify?: boolean;
};

export type ChatSource = {
  id: string;
  platform: Platform;
  channel: string;
  key: string;
  liveChatId?: string;
  youtubeChannelId?: string;
  youtubeVideoId?: string;
};

export type ChatTab = {
  id: string;
  sourceIds: string[];
};

export type AppSettings = {
  workspacePreset?: WorkspacePreset;
  theme?: ThemeOption;
  chatTextScale?: number;
  welcomeMode?: boolean;
  mentionMutedTabIds?: string[];
  mentionSnoozeUntilByTab?: Record<string, number>;
  tabSendRules?: Record<string, TabSendRule>;
  pinnedMessageByTabId?: Record<string, PinnedMessageSnapshot>;
  localPollByTabId?: Record<string, LocalTabPoll>;
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
  backgroundMonitorOnClose?: boolean;
  smartFilterSpam?: boolean;
  smartFilterScam?: boolean;
  confirmSendAll?: boolean;
  updateChannel?: UpdateChannel;
  tabAlertRules?: Record<string, TabAlertRule>;
  columns?: number;
  hideCommands?: boolean;
  keywordFilters?: string[];
  highlightKeywords?: string[];
  sessionSources?: ChatSource[];
  sessionTabs?: ChatTab[];
  sessionActiveTabId?: string;
  setupWizardCompleted?: boolean;
  setupWizardVersion?: number;
  setupWizardSendTestCompleted?: boolean;
  lastLaunchedVersion?: string;
  forcedResetAppliedVersion?: string;
};

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  message: string;
  channel: UpdateChannel;
  currentVersion: string;
  availableVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
};

export type AuthPermissionSnapshot = {
  platform: "twitch" | "kick";
  signedIn: boolean;
  username: string;
  canSend: boolean;
  canModerate: boolean;
  tokenExpiry: number | null;
  lastCheckedAt: number;
  error?: string;
};

export type AuthHealthSnapshot = {
  twitch: AuthPermissionSnapshot;
  kick: AuthPermissionSnapshot;
  youtubeTokenExpiry: number | null;
  updateChannel: UpdateChannel;
};

export type ModerationRequest = {
  platform?: "twitch" | "kick";
  channel?: string;
  action?: ModeratorAction;
  username?: string;
  messageId?: string;
  targetUserId?: number;
};

export type TikTokRendererEvent = {
  connectionId: string;
  type: "connected" | "disconnected" | "chat" | "error";
  roomId?: string;
  message?: unknown;
  error?: string;
};
