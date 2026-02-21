import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ChatAdapter, ChatAdapterStatus, ChatMessage } from "@multichat/chat-core";
import { KickAdapter, TikTokAdapter, TwitchAdapter, YouTubeAdapter } from "@multichat/chat-core";

const mode = window.location.hash.replace("#", "");
const broadcast = new BroadcastChannel("multichat-chat");
const hotkeys = {
  focusSearch: "Control+Shift+F"
};

type Platform = "twitch" | "kick" | "youtube" | "tiktok";
type WorkspacePreset = "streamer" | "moddesk" | "viewer";
const SEND_TARGET_TAB_ALL = "__all_in_tab__";

type TabSendRule = {
  defaultTarget?: "all" | "first" | "specific";
  sourceId?: string;
  confirmOnSendAll?: boolean;
  blockSendAll?: boolean;
};

type PinnedMessageSnapshot = {
  platform: Platform;
  channel: string;
  displayName: string;
  message: string;
  timestamp: string;
};

type LocalTabPoll = {
  id: string;
  question: string;
  options: Array<{ id: string; label: string; votes: number }>;
  active: boolean;
  createdAt: string;
};

type Settings = {
  uiMode?: "simple" | "advanced";
  workspacePreset?: WorkspacePreset;
  theme?: "dark" | "light" | "classic";
  streamSafeMode?: boolean;
  welcomeMode?: boolean;
  mentionMutedTabIds?: string[];
  mentionSnoozeUntilByTab?: Record<string, number>;
  tabSendRules?: Record<string, TabSendRule>;
  pinnedMessageByTabId?: Record<string, PinnedMessageSnapshot>;
  localPollByTabId?: Record<string, LocalTabPoll>;
  collaborationMode?: boolean;
  chatDeckMode?: boolean;
  dockedPanels?: {
    mentions?: boolean;
    modHistory?: boolean;
    userCard?: boolean;
    globalTimeline?: boolean;
  };
  tabGroups?: Record<string, string>;
  mutedGroups?: string[];
  deckWidths?: Record<string, number>;
  streamDelayMode?: boolean;
  streamDelaySeconds?: number;
  spoilerBlurDelayed?: boolean;
  globalSearchMode?: boolean;
  notificationScene?: "live" | "chatting" | "offline";
  accountProfiles?: Array<{
    id: string;
    name: string;
    twitchToken?: string;
    twitchUsername?: string;
    kickAccessToken?: string;
    kickRefreshToken?: string;
    kickUsername?: string;
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
    mentionSound?: boolean;
    mentionNotify?: boolean;
  }>;
  hideCommands?: boolean;
  keywordFilters?: string[];
  highlightKeywords?: string[];
  sessionSources?: Array<{
    id: string;
    platform: Platform;
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
  setupWizardVersion?: number;
  setupWizardSendTestCompleted?: boolean;
  savedLayouts?: Record<string, {
    name: string;
    sources: Array<{
      id: string;
      platform: Platform;
      channel: string;
      key: string;
      liveChatId?: string;
      youtubeChannelId?: string;
      youtubeVideoId?: string;
    }>;
    tabs: Array<{
      id: string;
      sourceIds: string[];
    }>;
    activeTabId?: string;
  }>;
  setupWizardCompleted?: boolean;
};

type ChatSource = {
  id: string;
  platform: Platform;
  channel: string;
  key: string;
  liveChatId?: string;
  youtubeChannelId?: string;
  youtubeVideoId?: string;
};

type ChatTab = {
  id: string;
  sourceIds: string[];
};

type TabMenuState = {
  x: number;
  y: number;
  tabId: string;
};

type MessageMenuState = {
  x: number;
  y: number;
  message: ChatMessage;
};

type UserLogTarget = {
  platform: "twitch" | "kick";
  username: string;
  displayName: string;
};

type ModeratorAction = "timeout_60" | "timeout_600" | "ban" | "unban" | "delete";
type ReplayWindow = 0 | 5 | 10 | 30;
type TabAlertProfile = "custom" | "default" | "quiet" | "mod-heavy" | "tournament";
type RoleBadge = {
  key: string;
  label: string;
  icon: string;
};

type UpdateStatusSnapshot = {
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

type MentionInboxEntry = {
  id: string;
  sourceId: string;
  tabId: string | null;
  reason: "mention" | "reply";
  platform: Platform;
  channel: string;
  displayName: string;
  message: string;
  timestamp: string;
};

type ConnectionHealthState = {
  lastStatus: ChatAdapterStatus;
  lastStatusAt: number;
  lastMessageAt?: number;
  lastConnectedAt?: number;
  reconnectReason?: string;
  lastError?: string;
};

const defaultSettings: Settings = {
  uiMode: "advanced",
  workspacePreset: "streamer",
  theme: "dark",
  streamSafeMode: false,
  welcomeMode: false,
  mentionMutedTabIds: [],
  mentionSnoozeUntilByTab: {},
  tabSendRules: {},
  pinnedMessageByTabId: {},
  localPollByTabId: {},
  chatDeckMode: false,
  dockedPanels: {
    mentions: false,
    modHistory: false,
    userCard: false,
    globalTimeline: false
  },
  tabGroups: {},
  mutedGroups: [],
  deckWidths: {},
  streamDelayMode: false,
  streamDelaySeconds: 0,
  spoilerBlurDelayed: false,
  globalSearchMode: false,
  notificationScene: "live",
  accountProfiles: [],
  collaborationMode: false,
  twitchToken: "",
  twitchUsername: "",
  twitchGuest: false,
  twitchScopeVersion: 0,
  twitchClientId: "",
  twitchRedirectUri: "",
  kickClientId: "",
  kickClientSecret: "",
  kickRedirectUri: "",
  kickAccessToken: "",
  kickRefreshToken: "",
  kickUsername: "",
  kickGuest: false,
  youtubeClientId: "",
  youtubeClientSecret: "",
  youtubeRedirectUri: "",
  youtubeAccessToken: "",
  youtubeRefreshToken: "",
  youtubeTokenExpiry: 0,
  youtubeUsername: "",
  youtubeLiveChatId: "",
  youtubeAlphaEnabled: false,
  tiktokAlphaEnabled: false,
  tiktokSessionId: "",
  tiktokTtTargetIdc: "",
  tiktokUsername: "",
  verboseLogs: false,
  performanceMode: false,
  smartFilterSpam: true,
  smartFilterScam: true,
  confirmSendAll: true,
  updateChannel: "stable",
  tabAlertRules: {},
  savedLayouts: {},
  hideCommands: false,
  keywordFilters: [],
  highlightKeywords: [],
  setupWizardCompleted: false,
  setupWizardVersion: 0,
  setupWizardSendTestCompleted: false
};

const hasTikTokSession = (settings: Settings) =>
  Boolean((settings.tiktokSessionId ?? "").trim() && (settings.tiktokTtTargetIdc ?? "").trim());
const normalizeUserKey = (value: string) => value.trim().toLowerCase();
const anonymizeName = (value: string) => {
  const source = value.trim();
  if (!source) return "Viewer";
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  const suffix = (hash % 9000) + 1000;
  return `Viewer${suffix}`;
};
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SCAM_PATTERN =
  /(t\.me\/|bit\.ly|tinyurl|free (gift|nitro|sub)|claim reward|steamcommunity\.com\/gift|crypto giveaway|double your)/i;
const COMMAND_SNIPPETS = [
  "!so {user}",
  "/timeout {user} 60",
  "/timeout {user} 600",
  "/ban {user}",
  "/unban {user}",
  "/clear"
] as const;
const TAB_ALERT_PROFILES: Record<Exclude<TabAlertProfile, "custom">, { sound: boolean; notify: boolean; mentionSound: boolean; mentionNotify: boolean }> = {
  default: { sound: true, notify: true, mentionSound: true, mentionNotify: true },
  quiet: { sound: false, notify: true, mentionSound: false, mentionNotify: true },
  "mod-heavy": { sound: true, notify: true, mentionSound: true, mentionNotify: true },
  tournament: { sound: false, notify: true, mentionSound: true, mentionNotify: true }
};

const messageMentionsUser = (message: ChatMessage, username?: string) => {
  const normalizedUsername = (username ?? "").trim().replace(/^@+/, "");
  if (!normalizedUsername) return false;
  if (normalizeUserKey(message.username) === normalizeUserKey(normalizedUsername)) return false;
  const text = message.message ?? "";
  if (!text.trim()) return false;

  const escaped = escapeRegExp(normalizedUsername);
  const mentionPattern = new RegExp(`(^|\\W)@?${escaped}(\\W|$)`, "i");
  return mentionPattern.test(text);
};

const isMentionForPlatformUser = (message: ChatMessage, settings: Settings) => {
  if (message.platform === "twitch") {
    return messageMentionsUser(message, settings.twitchUsername);
  }
  if (message.platform === "kick") {
    return messageMentionsUser(message, settings.kickUsername);
  }
  return false;
};

const messageRepliesToUser = (message: ChatMessage, username?: string) => {
  const normalizedUsername = normalizeUserKey((username ?? "").replace(/^@+/, ""));
  if (!normalizedUsername) return false;
  if (normalizeUserKey(message.username) === normalizedUsername) return false;

  const raw = asRecord(message.raw);
  if (!raw) return false;

  const directReplyLogin = typeof raw["reply-parent-user-login"] === "string" ? raw["reply-parent-user-login"] : "";
  if (directReplyLogin && normalizeUserKey(directReplyLogin) === normalizedUsername) {
    return true;
  }

  const directReplyName = typeof raw["reply-parent-display-name"] === "string" ? raw["reply-parent-display-name"] : "";
  if (directReplyName && normalizeUserKey(directReplyName) === normalizedUsername) {
    return true;
  }

  const replyRecord = asRecord(raw.reply_to) ?? asRecord(raw.replyTo) ?? asRecord(raw.reply);
  if (!replyRecord) return false;
  const candidateFields = ["username", "login", "display_name", "displayName", "name"];
  for (const field of candidateFields) {
    const value = replyRecord[field];
    if (typeof value === "string" && normalizeUserKey(value) === normalizedUsername) {
      return true;
    }
  }
  return false;
};

const isReplyForPlatformUser = (message: ChatMessage, settings: Settings) => {
  if (message.platform === "twitch") {
    return messageRepliesToUser(message, settings.twitchUsername);
  }
  if (message.platform === "kick") {
    return messageRepliesToUser(message, settings.kickUsername);
  }
  return false;
};

const formatOptionalDateTime = (value?: string) => {
  if (!value) return "n/a";
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return "n/a";
  return asDate.toLocaleString();
};

const formatOptionalExpiry = (value: number | null | undefined) => {
  if (!value) return "unknown";
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return "unknown";
  const minutes = Math.round((value - Date.now()) / 60_000);
  if (minutes <= 0) return `${asDate.toLocaleString()} (expired)`;
  return `${asDate.toLocaleString()} (${minutes}m left)`;
};

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeChannel = (input: string, platform: Platform = "twitch") => {
  const trimmed = input.trim().replace(/^#/, "");
  if (platform === "youtube") {
    return trimmed.replace(/^@/, "");
  }
  if (platform === "tiktok") {
    return trimmed.replace(/^@/, "").toLowerCase();
  }
  return trimmed.toLowerCase();
};

const hasAuthForPlatform = (platform: Platform, settings: Settings) =>
  platform === "twitch"
    ? Boolean(settings.twitchToken || settings.twitchGuest)
    : platform === "kick"
      ? Boolean(settings.kickAccessToken)
      : platform === "youtube"
        ? true
        : true;

const tabLabel = (tab: ChatTab, sourceById: Map<string, ChatSource>) => {
  const sources = tab.sourceIds.map((id) => sourceById.get(id)).filter(Boolean) as ChatSource[];
  if (sources.length === 0) return "Empty";
  if (sources.length === 1) {
    const source = sources[0];
    return `${source.platform}/${source.channel}`;
  }
  const first = sources[0];
  return `${first.platform}/${first.channel} +${sources.length - 1}`;
};

const platformIconGlyph = (platform: string) => {
  const value = platform.trim().toLowerCase();
  if (value === "twitch") return "TW";
  if (value === "kick") return "KI";
  if (value === "youtube") return "YT";
  if (value === "tiktok") return "TT";
  return "?";
};

const buildModerationCommand = (
  platform: Platform,
  action: ModeratorAction,
  username: string,
  messageId?: string | null
): string | null => {
  const normalizedUser = username.trim().replace(/^@+/, "");
  const prefix = platform === "twitch" ? "." : "/";

  if (action === "timeout_60") {
    if (!normalizedUser) return null;
    return `${prefix}timeout ${normalizedUser} 60`;
  }
  if (action === "timeout_600") {
    if (!normalizedUser) return null;
    return `${prefix}timeout ${normalizedUser} 600`;
  }
  if (action === "ban") {
    if (!normalizedUser) return null;
    return `${prefix}ban ${normalizedUser}`;
  }
  if (action === "unban") {
    if (!normalizedUser) return null;
    return `${prefix}unban ${normalizedUser}`;
  }
  if (action === "delete") {
    if (!messageId) return null;
    return `${prefix}delete ${messageId}`;
  }
  return null;
};

const normalizeBadgeKey = (rawBadge: string) => rawBadge.trim().toLowerCase().split(/[/:]/)[0] ?? "";

const isTruthyFlag = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

const collectBadgeCandidates = (value: unknown): string[] => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBadgeCandidates(item));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const candidates: string[] = [];
  const directKeys = ["set_id", "type", "badge", "text", "label", "name", "slug", "id"];
  for (const key of directKeys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) {
      candidates.push(direct);
    }
  }
  if ("badges" in record) {
    candidates.push(...collectBadgeCandidates(record.badges));
  }
  if ("identity" in record) {
    const identity = asRecord(record.identity);
    if (identity?.badges) {
      candidates.push(...collectBadgeCandidates(identity.badges));
    }
  }
  return candidates;
};

const roleBadgeFromKey = (key: string): RoleBadge | null => {
  if (!key) return null;
  if (key === "broadcaster" || key === "streamer" || key === "owner") {
    return { key: "broadcaster", label: "Broadcaster", icon: "BRD" };
  }
  if (key === "moderator" || key === "mod" || key === "global_mod") {
    return { key: "moderator", label: "Moderator", icon: "MOD" };
  }
  if (key === "admin" || key === "staff") {
    return { key: "staff", label: "Staff", icon: "STF" };
  }
  if (key === "vip") {
    return { key: "vip", label: "VIP", icon: "VIP" };
  }
  if (key === "subscriber" || key === "sub" || key === "founder") {
    return { key: "subscriber", label: "Subscriber", icon: "SUB" };
  }
  if (key === "verified" || key === "partner") {
    return { key: "verified", label: "Verified", icon: "VER" };
  }
  return null;
};

const roleBadgesForMessage = (message: ChatMessage): RoleBadge[] => {
  const raw = asRecord(message.raw);
  const rawBadges: string[] = [];
  if (Array.isArray(message.badges)) {
    rawBadges.push(...message.badges);
  }
  if (typeof raw?.badges === "string") {
    rawBadges.push(...raw.badges.split(",").filter(Boolean));
  } else if (raw?.badges) {
    rawBadges.push(...collectBadgeCandidates(raw.badges));
  }
  if (typeof raw?.["badge-info"] === "string") {
    rawBadges.push(...raw["badge-info"].split(",").filter(Boolean));
  }
  const rawSender = asRecord(raw?.sender);
  if (rawSender) {
    rawBadges.push(...collectBadgeCandidates(rawSender.badges));
    const senderIdentity = asRecord(rawSender.identity);
    if (senderIdentity) {
      rawBadges.push(...collectBadgeCandidates(senderIdentity.badges));
      if (isTruthyFlag(senderIdentity.is_moderator) || isTruthyFlag(senderIdentity.mod) || isTruthyFlag(senderIdentity.is_mod)) {
        rawBadges.push("moderator");
      }
      if (
        isTruthyFlag(senderIdentity.is_broadcaster) ||
        isTruthyFlag(senderIdentity.broadcaster) ||
        isTruthyFlag(senderIdentity.owner)
      ) {
        rawBadges.push("broadcaster");
      }
      if (isTruthyFlag(senderIdentity.vip)) {
        rawBadges.push("vip");
      }
      if (isTruthyFlag(senderIdentity.subscriber)) {
        rawBadges.push("subscriber");
      }
      if (isTruthyFlag(senderIdentity.verified)) {
        rawBadges.push("verified");
      }
    }
  }

  const seen = new Set<string>();
  const resolved: RoleBadge[] = [];

  const addByKey = (key: string) => {
    const badge = roleBadgeFromKey(normalizeBadgeKey(key));
    if (!badge || seen.has(badge.key)) return;
    seen.add(badge.key);
    resolved.push(badge);
  };

  for (const rawBadge of rawBadges) {
    addByKey(rawBadge);
  }
  if (raw?.mod === "1" || raw?.mod === 1) {
    addByKey("moderator");
  }
  if (raw?.subscriber === "1" || raw?.subscriber === 1) {
    addByKey("subscriber");
  }
  if (raw?.vip === "1" || raw?.vip === 1) {
    addByKey("vip");
  }
  if (typeof raw?.["user-type"] === "string") {
    addByKey(raw["user-type"]);
  }
  if (isTruthyFlag(raw?.is_moderator) || isTruthyFlag(raw?.is_mod)) {
    addByKey("moderator");
  }
  if (isTruthyFlag(raw?.is_broadcaster) || isTruthyFlag(raw?.broadcaster) || isTruthyFlag(raw?.owner)) {
    addByKey("broadcaster");
  }
  if (isTruthyFlag(raw?.is_verified) || isTruthyFlag(raw?.verified)) {
    addByKey("verified");
  }

  return resolved;
};

const messageHasModerationBadge = (message: ChatMessage) =>
  roleBadgesForMessage(message).some((badge) => badge.key === "moderator" || badge.key === "broadcaster" || badge.key === "staff");

const PlatformIcon: React.FC<{ platform: string }> = ({ platform }) => (
  <span className={`platform-icon ${platform.trim().toLowerCase()}`} aria-hidden="true">
    {platformIconGlyph(platform)}
  </span>
);

const sanitizeSessionSources = (value: Settings["sessionSources"]): ChatSource[] => {
  if (!Array.isArray(value)) return [];
  const seenSourceIds = new Set<string>();
  const seenSourceKeys = new Set<string>();
  const restored: ChatSource[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const platform: Platform | null =
      entry.platform === "twitch" || entry.platform === "kick" || entry.platform === "youtube" || entry.platform === "tiktok"
        ? entry.platform
        : null;
    const channel = typeof entry.channel === "string" ? normalizeChannel(entry.channel, platform ?? undefined) : "";
    if (!id || !platform || !channel) continue;

    const liveChatId = typeof entry.liveChatId === "string" ? entry.liveChatId.trim() : "";
    if (platform === "youtube" && !liveChatId) continue;

    const key = typeof entry.key === "string" && entry.key.trim() ? entry.key.trim() : `${platform}:${channel}`;
    if (seenSourceIds.has(id) || seenSourceKeys.has(key)) continue;
    seenSourceIds.add(id);
    seenSourceKeys.add(key);
    restored.push({
      id,
      platform,
      channel,
      key,
      liveChatId: liveChatId || undefined,
      youtubeChannelId: typeof entry.youtubeChannelId === "string" ? entry.youtubeChannelId.trim() || undefined : undefined,
      youtubeVideoId: typeof entry.youtubeVideoId === "string" ? entry.youtubeVideoId.trim() || undefined : undefined
    });
  }

  return restored;
};

const sanitizeSessionTabs = (value: Settings["sessionTabs"], validSourceIds: Set<string>): ChatTab[] => {
  if (!Array.isArray(value)) return [];
  const seenTabIds = new Set<string>();
  const restored: ChatTab[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || seenTabIds.has(id)) continue;

    const sourceIds = Array.isArray(entry.sourceIds)
      ? Array.from(new Set(entry.sourceIds.filter((sourceId) => typeof sourceId === "string" && validSourceIds.has(sourceId))))
      : [];

    if (sourceIds.length === 0) continue;
    seenTabIds.add(id);
    restored.push({ id, sourceIds });
  }

  return restored;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const readCombinedChannels = (message: ChatMessage): string[] => {
  const raw = asRecord(message.raw);
  const rawChannels = raw?.combinedChannels;
  if (!Array.isArray(rawChannels)) return [];
  return rawChannels.filter((item): item is string => typeof item === "string" && item.length > 0);
};

const isLocalEcho = (message: ChatMessage) => {
  const raw = asRecord(message.raw);
  return raw?.localEcho === true;
};

const FOLLOW_EVENT_TOKENS = ["follow", "follower", "followed"] as const;
const SUB_EVENT_TOKENS = ["sub", "subscriber", "subscribed", "subscription", "resubscribed", "member", "membership", "sponsor"] as const;

const includesEventToken = (value: string, tokens: readonly string[]) => {
  const normalized = normalizeUserKey(value);
  if (!normalized) return false;
  return tokens.some((token) => normalized.includes(token));
};

const detectEngagementAlertKind = (message: ChatMessage): "follow" | "subscriber" | null => {
  const raw = asRecord(message.raw);
  // Prefer explicit platform event metadata only; avoid text-based false positives.
  const eventType =
    typeof raw?.eventType === "string"
      ? raw.eventType
      : typeof raw?.type === "string"
        ? raw.type
        : typeof raw?.msgId === "string"
          ? raw.msgId
          : "";
  if (includesEventToken(eventType, FOLLOW_EVENT_TOKENS)) {
    return "follow";
  }
  if (includesEventToken(eventType, SUB_EVENT_TOKENS)) {
    return "subscriber";
  }
  return null;
};

const messageContentFingerprint = (message: ChatMessage) =>
  `${message.platform}|${message.channel}|${normalizeUserKey(message.username)}|${message.message.trim().toLowerCase()}`;

const collapseFanoutLocalEchoes = (messages: ChatMessage[]): ChatMessage[] => {
  const collapsed: ChatMessage[] = [];

  for (const message of messages) {
    const previous = collapsed[collapsed.length - 1];
    if (!previous) {
      collapsed.push(message);
      continue;
    }

    const canCollapse =
      isLocalEcho(previous) &&
      isLocalEcho(message) &&
      previous.platform === message.platform &&
      previous.username === message.username &&
      previous.displayName === message.displayName &&
      previous.message === message.message &&
      previous.channel !== message.channel &&
      Math.abs(new Date(message.timestamp).getTime() - new Date(previous.timestamp).getTime()) <= 800;

    if (!canCollapse) {
      collapsed.push(message);
      continue;
    }

    const previousChannels = readCombinedChannels(previous);
    const mergedChannels = previousChannels.length > 0 ? [...previousChannels] : [previous.channel];
    if (!mergedChannels.includes(message.channel)) {
      mergedChannels.push(message.channel);
    }

    collapsed[collapsed.length - 1] = {
      ...previous,
      raw: {
        ...(previous.raw ?? {}),
        combinedChannels: mergedChannels
      }
    };
  }

  return collapsed;
};

type EmoteMap = Record<string, string>;
type EmoteResolver = (token: string) => string | undefined;

type MessageChunk =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "emote";
      name: string;
      url: string;
    };

type TwitchNativeRange = {
  start: number;
  end: number;
  emoteId: string;
  name: string;
};

const TWITCH_EMOTE_URL = (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
const BTTV_EMOTE_URL = (id: string) => `https://cdn.betterttv.net/emote/${id}/1x`;
const SEVENTV_EMOTE_URL = (id: string) => `https://cdn.7tv.app/emote/${id}/1x.webp`;
const KICK_EMOTE_URL = (id: string) => `https://files.kick.com/emotes/${id}/fullsize`;
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 36;
const AUTO_RESUME_NEWEST_AFTER_MS = 3 * 60 * 1000;
const SETUP_WIZARD_VERSION = 2;
const LOCKED_RENDERED_MESSAGE_LIMIT = 420;
const CONTEXT_MENU_EDGE_GAP_PX = 12;
const CONTEXT_MENU_DEFAULT_WIDTH_PX = 250;
const CONTEXT_MENU_DEFAULT_HEIGHT_PX = 360;
const DOCK_PANEL_MIN_WIDTH = 240;
const DOCK_PANEL_MAX_WIDTH = 560;
const DOCK_PANEL_DEFAULT_WIDTH = 340;

const clampContextMenuPosition = (x: number, y: number, menuWidth = CONTEXT_MENU_DEFAULT_WIDTH_PX, menuHeight = CONTEXT_MENU_DEFAULT_HEIGHT_PX) => {
  if (typeof window === "undefined") return { x, y };
  const viewportWidth = Math.max(window.innerWidth, menuWidth + CONTEXT_MENU_EDGE_GAP_PX * 2);
  const viewportHeight = Math.max(window.innerHeight, menuHeight + CONTEXT_MENU_EDGE_GAP_PX * 2);
  const maxX = viewportWidth - menuWidth - CONTEXT_MENU_EDGE_GAP_PX;
  const maxY = viewportHeight - menuHeight - CONTEXT_MENU_EDGE_GAP_PX;
  return {
    x: Math.min(Math.max(x, CONTEXT_MENU_EDGE_GAP_PX), maxX),
    y: Math.min(Math.max(y, CONTEXT_MENU_EDGE_GAP_PX), maxY)
  };
};

const normalizeOauthToken = (token?: string) => (token ?? "").trim().replace(/^oauth:/i, "");

const fetchJsonSafe = async (url: string, init?: RequestInit): Promise<unknown | null> => {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const pushBttvList = (target: EmoteMap, list: unknown) => {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const record = asRecord(item);
    const id = typeof record?.id === "string" ? record.id : "";
    const code = typeof record?.code === "string" ? record.code : "";
    if (!id || !code) continue;
    target[code] = BTTV_EMOTE_URL(id);
  }
};

const pushSevenTvList = (target: EmoteMap, list: unknown) => {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const record = asRecord(item);
    const data = asRecord(record?.data);
    const id =
      typeof record?.id === "string"
        ? record.id
        : typeof data?.id === "string"
          ? data.id
          : "";
    const name = typeof record?.name === "string" ? record.name : "";
    if (!id || !name) continue;
    target[name] = SEVENTV_EMOTE_URL(id);
  }
};

const extractTwitchUserId = (payload: unknown): string | null => {
  const record = asRecord(payload);
  if (!record?.data || !Array.isArray(record.data) || record.data.length === 0) return null;
  const first = asRecord(record.data[0]);
  const id = typeof first?.id === "string" ? first.id : "";
  return id || null;
};

const hasAnyEmotes = (map: EmoteMap) => Object.keys(map).length > 0;

const extractTwitchRoomId = (message: ChatMessage): string | null => {
  if (message.platform !== "twitch") return null;
  const raw = asRecord(message.raw);
  const roomId = typeof raw?.["room-id"] === "string" ? raw["room-id"] : "";
  return roomId.trim() || null;
};

const fetchBttvGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe("https://api.betterttv.net/3/cached/emotes/global");
  const map: EmoteMap = {};
  pushBttvList(map, payload);
  return map;
};

const fetchSevenTvGlobalEmotes = async (): Promise<EmoteMap> => {
  const payload = await fetchJsonSafe("https://7tv.io/v3/emote-sets/global");
  const map: EmoteMap = {};
  const record = asRecord(payload);
  pushSevenTvList(map, record?.emotes);
  return map;
};

const fetchTwitchThirdPartyEmotesByUserId = async (userId: string): Promise<EmoteMap> => {
  if (!userId.trim()) return {};
  const [bttvPayload, sevenTvPayload] = await Promise.all([
    fetchJsonSafe(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(userId)}`),
    fetchJsonSafe(`https://7tv.io/v3/users/twitch/${encodeURIComponent(userId)}`)
  ]);

  const map: EmoteMap = {};
  const bttvRecord = asRecord(bttvPayload);
  pushBttvList(map, bttvRecord?.channelEmotes);
  pushBttvList(map, bttvRecord?.sharedEmotes);

  const sevenTvRecord = asRecord(sevenTvPayload);
  const sevenTvSet = asRecord(sevenTvRecord?.emote_set);
  pushSevenTvList(map, sevenTvSet?.emotes);
  return map;
};

const fetchTwitchThirdPartyEmotes = async (
  channel: string,
  twitchClientId?: string,
  twitchToken?: string
): Promise<EmoteMap> => {
  const clientId = (twitchClientId ?? "").trim();
  const token = normalizeOauthToken(twitchToken);
  if (!clientId || !token || !channel) return {};

  const headers = {
    "Client-ID": clientId,
    Authorization: `Bearer ${token}`
  };

  const usersPayload = await fetchJsonSafe(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`, { headers });
  const userId = extractTwitchUserId(usersPayload);
  if (!userId) return {};
  return fetchTwitchThirdPartyEmotesByUserId(userId);
};

const checkTwitchModeratorStatus = async (channel: string, username: string): Promise<boolean | null> => {
  const normalizedChannel = normalizeChannel(channel, "twitch");
  const normalizedUser = normalizeUserKey(username);
  if (!normalizedChannel || !normalizedUser) return null;
  if (normalizedChannel === normalizedUser) return true;
  try {
    return await window.electronAPI.canModerateSource({
      platform: "twitch",
      channel: normalizedChannel
    });
  } catch {
    return null;
  }
};

const compactMessageChunks = (chunks: MessageChunk[]): MessageChunk[] => {
  const compacted: MessageChunk[] = [];
  for (const chunk of chunks) {
    const previous = compacted[compacted.length - 1];
    if (chunk.type === "text" && previous?.type === "text") {
      previous.value += chunk.value;
      continue;
    }
    compacted.push(chunk);
  }
  return compacted;
};

const tokenizeTextWithExternalEmotes = (text: string, resolveEmote: EmoteResolver): MessageChunk[] => {
  if (!text) return [];
  const tokens = text.split(/(\s+)/);
  const chunks: MessageChunk[] = [];

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      chunks.push({ type: "text", value: token });
      continue;
    }

    const directUrl = resolveEmote(token);
    if (directUrl) {
      chunks.push({ type: "emote", name: token, url: directUrl });
      continue;
    }

    const punctuationMatch = token.match(/^([(\[{'"`]*)(.+?)([)\]}.,!?;:'"`]*)$/);
    if (punctuationMatch) {
      const [, prefix, core, suffix] = punctuationMatch;
      const coreUrl = resolveEmote(core);
      if (coreUrl) {
        if (prefix) chunks.push({ type: "text", value: prefix });
        chunks.push({ type: "emote", name: core, url: coreUrl });
        if (suffix) chunks.push({ type: "text", value: suffix });
        continue;
      }
    }

    chunks.push({ type: "text", value: token });
  }

  return compactMessageChunks(chunks);
};

const parseTwitchNativeRanges = (message: ChatMessage): TwitchNativeRange[] => {
  const raw = asRecord(message.raw);
  const emotesTag = typeof raw?.emotes === "string" ? raw.emotes : "";
  if (!emotesTag || emotesTag === "") return [];

  const ranges: TwitchNativeRange[] = [];
  for (const item of emotesTag.split("/")) {
    const [emoteId, positions] = item.split(":");
    if (!emoteId || !positions) continue;

    for (const position of positions.split(",")) {
      const [startText, endText] = position.split("-");
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end < start || end >= message.message.length) continue;
      ranges.push({
        start,
        end,
        emoteId,
        name: message.message.slice(start, end + 1)
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const cleaned: TwitchNativeRange[] = [];
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.start <= lastEnd) continue;
    cleaned.push(range);
    lastEnd = range.end;
  }
  return cleaned;
};

const parseKickNativeChunks = (rawContent: string, resolveEmote: EmoteResolver): MessageChunk[] => {
  if (!rawContent) return [];
  const regex = /\[emote:(\d+):([^[\]]+)\]/g;
  const chunks: MessageChunk[] = [];
  let lastIndex = 0;
  let matched = false;

  while (true) {
    const match = regex.exec(rawContent);
    if (!match) break;
    matched = true;

    const [full, emoteId, emoteName] = match;
    if (match.index > lastIndex) {
      chunks.push(...tokenizeTextWithExternalEmotes(rawContent.slice(lastIndex, match.index), resolveEmote));
    }

    chunks.push({
      type: "emote",
      name: emoteName,
      url: KICK_EMOTE_URL(emoteId)
    });

    lastIndex = match.index + full.length;
  }

  if (!matched) return [];
  if (lastIndex < rawContent.length) {
    chunks.push(...tokenizeTextWithExternalEmotes(rawContent.slice(lastIndex), resolveEmote));
  }
  return compactMessageChunks(chunks);
};

const buildMessageChunks = (message: ChatMessage, resolveEmote: EmoteResolver): MessageChunk[] => {
  if (message.platform === "twitch") {
    const ranges = parseTwitchNativeRanges(message);
    if (ranges.length > 0) {
      const chunks: MessageChunk[] = [];
      let cursor = 0;
      for (const range of ranges) {
        if (range.start > cursor) {
          chunks.push(...tokenizeTextWithExternalEmotes(message.message.slice(cursor, range.start), resolveEmote));
        }
        chunks.push({
          type: "emote",
          name: range.name,
          url: TWITCH_EMOTE_URL(range.emoteId)
        });
        cursor = range.end + 1;
      }
      if (cursor < message.message.length) {
        chunks.push(...tokenizeTextWithExternalEmotes(message.message.slice(cursor), resolveEmote));
      }
      return compactMessageChunks(chunks);
    }
  }

  if (message.platform === "kick") {
    const raw = asRecord(message.raw);
    const rawContent = typeof raw?.content === "string" ? raw.content : "";
    const kickChunks = parseKickNativeChunks(rawContent, resolveEmote);
    if (kickChunks.length > 0) return kickChunks;
  }

  return tokenizeTextWithExternalEmotes(message.message, resolveEmote);
};

const isNearBottom = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;

const messageTimestamp = (message: ChatMessage) => {
  const value = new Date(message.timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
};

const getRawMessageId = (message: ChatMessage): string | null => {
  const raw = asRecord(message.raw);
  const id = typeof raw?.id === "string" ? raw.id : typeof raw?.id === "number" ? String(raw.id) : "";
  return id || null;
};

const getKickRawUserId = (message: ChatMessage): number | null => {
  if (message.platform !== "kick") return null;
  const raw = asRecord(message.raw);
  const sender = asRecord(raw?.sender);
  const senderId = sender?.id;
  if (typeof senderId === "number" && Number.isFinite(senderId) && senderId > 0) {
    return senderId;
  }
  const senderUserId = sender?.user_id;
  if (typeof senderUserId === "number" && Number.isFinite(senderUserId) && senderUserId > 0) {
    return senderUserId;
  }
  const rawUserId = raw?.user_id;
  if (typeof rawUserId === "number" && Number.isFinite(rawUserId) && rawUserId > 0) {
    return rawUserId;
  }
  return null;
};

export const App: React.FC = () => {
  if (mode === "overlay") {
    return <OverlayView />;
  }
  return <MainApp />;
};

const OverlayView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent<ChatMessage>) => {
      setMessages((prev) => [...prev.slice(-300), event.data]);
    };
    broadcast.addEventListener("message", handler);
    return () => broadcast.removeEventListener("message", handler);
  }, []);

  const visible = messages.filter((message) => !channelFilter || message.channel === channelFilter);
  const channels = Array.from(new Set(messages.map((message) => message.channel)));

  useEffect(() => {
    void window.electronAPI.setOverlayLocked(locked).catch(() => {
      // no-op
    });
  }, [locked]);

  return (
    <div className={`overlay${locked ? " locked" : ""}`}>
      <header className="overlay-header">
        <h1>Overlay</h1>
        <div className="overlay-controls">
          <label>
            Channel
            <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
              <option value="">All</option>
              {channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setLocked((previous) => !previous)}>
            {locked ? "Unlock" : "Lock"}
          </button>
          <button type="button" onClick={() => window.electronAPI.closeOverlay()} disabled={locked}>
            Exit
          </button>
        </div>
      </header>
      <div className="overlay-messages">
        {visible.map((message) => (
          <div key={message.id} className="overlay-message">
            <strong>{message.displayName}</strong>
            <span>{message.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MainApp: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState<Platform | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [readOnlyGuideMode, setReadOnlyGuideMode] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusSnapshot>({
    state: "idle",
    message: "",
    channel: settings.updateChannel === "beta" ? "beta" : "stable",
    currentVersion: "unknown"
  });
  const [authHealth, setAuthHealth] = useState<AuthHealthSnapshot | null>(null);
  const [authHealthBusy, setAuthHealthBusy] = useState(false);
  const [mentionInbox, setMentionInbox] = useState<MentionInboxEntry[]>([]);
  const [connectionHealthBySource, setConnectionHealthBySource] = useState<Record<string, ConnectionHealthState>>({});

  const [platformInput, setPlatformInput] = useState<Platform>("twitch");
  const [channelInput, setChannelInput] = useState("");
  const [search, setSearch] = useState("");
  const [composerText, setComposerText] = useState("");
  const [sendTargetId, setSendTargetId] = useState<string>(SEND_TARGET_TAB_ALL);
  const [sending, setSending] = useState(false);
  const [replayWindow, setReplayWindow] = useState<ReplayWindow>(0);
  const [quickModUser, setQuickModUser] = useState("");
  const [identityTarget, setIdentityTarget] = useState<{ username: string; displayName: string } | null>(null);
  const [tabAlertKeywordInput, setTabAlertKeywordInput] = useState("");
  const [tabAlertSound, setTabAlertSound] = useState(true);
  const [tabAlertNotify, setTabAlertNotify] = useState(true);
  const [tabMentionSound, setTabMentionSound] = useState(true);
  const [tabMentionNotify, setTabMentionNotify] = useState(true);
  const [tabAlertProfile, setTabAlertProfile] = useState<TabAlertProfile>("custom");
  const [snippetToInsert, setSnippetToInsert] = useState("");
  const [tabSendDefaultTarget, setTabSendDefaultTarget] = useState<"all" | "first" | "specific">("all");
  const [tabSendSpecificSourceId, setTabSendSpecificSourceId] = useState("");
  const [tabSendConfirmOnAll, setTabSendConfirmOnAll] = useState(true);
  const [tabSendBlockAll, setTabSendBlockAll] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollQuestionDraft, setPollQuestionDraft] = useState("");
  const [pollOptionsDraft, setPollOptionsDraft] = useState("");
  const [setupTestMessageSent, setSetupTestMessageSent] = useState(false);
  const [raidSignal, setRaidSignal] = useState<{
    tabId: string;
    detectedAt: number;
    messagesPerMinute: number;
    uniqueChatters: number;
  } | null>(null);

  const [sources, setSources] = useState<ChatSource[]>([]);
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [messagesBySource, setMessagesBySource] = useState<Record<string, ChatMessage[]>>({});
  const [statusBySource, setStatusBySource] = useState<Record<string, ChatAdapterStatus>>({});
  const [moderatorBySource, setModeratorBySource] = useState<Record<string, boolean>>({});
  const [globalEmoteMap, setGlobalEmoteMap] = useState<EmoteMap>({});
  const [channelEmoteMapBySourceId, setChannelEmoteMapBySourceId] = useState<Record<string, EmoteMap>>({});
  const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [userLogTarget, setUserLogTarget] = useState<UserLogTarget | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [newestLocked, setNewestLocked] = useState(true);
  const [lockCutoffTimestamp, setLockCutoffTimestamp] = useState<number | null>(null);
  const [refreshingActiveTab, setRefreshingActiveTab] = useState(false);
  const [quickTourOpen, setQuickTourOpen] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardStep, setSetupWizardStep] = useState(0);
  const [setupWizardDismissed, setSetupWizardDismissed] = useState(false);
  const [tabUnreadCounts, setTabUnreadCounts] = useState<Record<string, number>>({});
  const [tabMentionCounts, setTabMentionCounts] = useState<Record<string, number>>({});
  const [lastReadAtByTab, setLastReadAtByTab] = useState<Record<string, number>>({});
  const [moderationHistory, setModerationHistory] = useState<
    Array<{ id: string; at: number; action: string; target: string; source: string; ok: boolean }>
  >([]);
  const [layoutPresetName, setLayoutPresetName] = useState("stream");
  const [filterProfile, setFilterProfile] = useState<"custom" | "clean" | "mod" | "no-filter">("custom");
  const [adaptivePerformanceMode, setAdaptivePerformanceMode] = useState(false);
  const [tabGroupDraft, setTabGroupDraft] = useState("");
  const [newAccountProfileName, setNewAccountProfileName] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [deckComposerByTabId, setDeckComposerByTabId] = useState<Record<string, string>>({});
  const [replayBufferSeconds, setReplayBufferSeconds] = useState<0 | 30 | 60>(0);
  const [pendingMessageJumpKey, setPendingMessageJumpKey] = useState<string | null>(null);
  const [dockPanelWidth, setDockPanelWidth] = useState(DOCK_PANEL_DEFAULT_WIDTH);
  const [dockPanelResizing, setDockPanelResizing] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const channelInputRef = useRef<HTMLInputElement | null>(null);
  const importSessionInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const mainLayoutRef = useRef<HTMLDivElement | null>(null);
  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const lastMessageByUser = useRef<Map<string, number>>(new Map());
  const emoteFetchInFlight = useRef<Set<string>>(new Set());
  const channelEmoteMapBySourceIdRef = useRef<Record<string, EmoteMap>>({});
  const mentionAudioContextRef = useRef<AudioContext | null>(null);
  const lastMentionAlertAtRef = useRef(0);
  const spamFilterRef = useRef<Map<string, number>>(new Map());
  const tabsRef = useRef<ChatTab[]>([]);
  const tabIdsBySourceIdRef = useRef<Record<string, string[]>>({});
  const sourceByIdRef = useRef<Map<string, ChatSource>>(new Map());
  const lastTabAlertAtRef = useRef<Map<string, number>>(new Map());
  const sourceStatusRef = useRef<Record<string, ChatAdapterStatus>>({});
  const settingsRef = useRef<Settings>(defaultSettings);
  const activeTabIdRef = useRef("");
  const openingSourceKeysRef = useRef<Set<string>>(new Set());
  const suppressedAutoHealSourceIdsRef = useRef<Set<string>>(new Set());
  const autoHealStateBySourceRef = useRef<Record<string, { attempt: number; timer: number | null }>>({});
  const lastAdaptiveToggleAtRef = useRef(0);
  const lastHealthPublishAtBySourceRef = useRef<Record<string, number>>({});
  const twitchRoomIdToChannelRef = useRef<Map<string, string>>(new Map());
  const twitchSharedChatAlertAtRef = useRef<Map<string, number>>(new Map());
  const raidSamplesByTabRef = useRef<Record<string, Array<{ at: number; messagesPerMinute: number; uniqueChatters: number }>>>({});
  const lastRaidSampleAtByTabRef = useRef<Record<string, number>>({});
  const mentionInboxCount = mentionInbox.length;
  const isSimpleMode = settings.uiMode === "simple";
  const isAdvancedMode = !isSimpleMode;
  const theme = settings.theme === "light" ? "light" : settings.theme === "classic" ? "classic" : "dark";
  const chatDeckMode = false;
  const effectivePerformanceMode = settings.performanceMode === true || adaptivePerformanceMode;
  const mutedGroups = settings.mutedGroups ?? [];
  const tabGroups = settings.tabGroups ?? {};
  const activeTabGroup = activeTabId ? tabGroups[activeTabId] ?? "" : "";
  const streamDelayMode = settings.streamDelayMode === true;
  const streamDelaySeconds = Math.max(0, Math.min(180, Number(settings.streamDelaySeconds ?? 0) || 0));
  const spoilerBlurDelayed = settings.spoilerBlurDelayed === true;
  const globalSearchMode = settings.globalSearchMode === true;
  const notificationScene = settings.notificationScene ?? "live";
  const sceneOverrides =
    notificationScene === "offline"
      ? { sound: false, notify: false }
      : notificationScene === "chatting"
        ? { sound: false, notify: true }
        : { sound: true, notify: true };
  const hasDockedPanels =
    settings.dockedPanels?.mentions ||
    settings.dockedPanels?.modHistory ||
    settings.dockedPanels?.userCard ||
    settings.dockedPanels?.globalTimeline;

  const startDockPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasDockedPanels) return;
    event.preventDefault();
    setDockPanelResizing(true);
  };

  useEffect(() => {
    if (!dockPanelResizing) return;
    const onPointerMove = (event: PointerEvent) => {
      const rect = mainLayoutRef.current?.getBoundingClientRect();
      if (!rect) return;
      const desiredWidth = rect.right - event.clientX;
      const nextWidth = Math.max(DOCK_PANEL_MIN_WIDTH, Math.min(DOCK_PANEL_MAX_WIDTH, Math.round(desiredWidth)));
      setDockPanelWidth(nextWidth);
    };
    const onPointerUp = () => {
      setDockPanelResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dockPanelResizing]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.style.setProperty("color-scheme", theme === "light" ? "light" : "dark");
  }, [theme]);

  useEffect(() => {
    if (!authMessage) return;
    const timer = window.setTimeout(() => {
      setAuthMessage("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [authMessage]);

  const sourceExternalLink = (source: ChatSource): string => {
    if (source.platform === "twitch") return `https://www.twitch.tv/${source.channel}`;
    if (source.platform === "kick") return `https://kick.com/${source.channel}`;
    if (source.platform === "youtube") {
      if (source.youtubeVideoId) return `https://www.youtube.com/watch?v=${source.youtubeVideoId}`;
      if (source.channel.startsWith("UC")) return `https://www.youtube.com/channel/${source.channel}/live`;
      return `https://www.youtube.com/@${source.channel}/live`;
    }
    return `https://www.tiktok.com/@${source.channel}/live`;
  };

  const copyActiveTabLinks = async () => {
    if (!activeTab) return;
    const links = activeTab.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter(Boolean)
      .map((source) => sourceExternalLink(source as ChatSource));
    if (links.length === 0) return;
    await navigator.clipboard.writeText(links.join("\n"));
    setAuthMessage(links.length === 1 ? "Channel link copied." : `Copied ${links.length} channel links.`);
  };

  useEffect(() => {
    let active = true;

    const connectRestoredSources = async (restoredSources: ChatSource[], currentSettings: Settings) => {
      const outcomes = await Promise.allSettled(
        restoredSources.map((source) => ensureAdapterConnected(source, currentSettings))
      );
      if (!active) return;
      const failed = outcomes.filter((outcome) => outcome.status === "rejected").length;
      if (failed > 0) {
        setAuthMessage(`Restored ${restoredSources.length - failed}/${restoredSources.length} chats. ${failed} failed to reconnect.`);
      }
    };

    window.electronAPI
      .getSettings()
      .then((saved) => {
        if (!active) return;
        const nextSettings = { ...defaultSettings, ...saved };
        setSettings(nextSettings);
        setSetupTestMessageSent(nextSettings.setupWizardSendTestCompleted === true);
        setTabAlertKeywordInput((nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.keyword ?? "").trim());
        setTabAlertSound(nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.sound !== false);
        setTabAlertNotify(nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.notify !== false);
        setTabMentionSound(nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.mentionSound !== false);
        setTabMentionNotify(nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.mentionNotify !== false);

        const restoredSources = sanitizeSessionSources(saved.sessionSources).filter((source) => {
          if (source.platform === "youtube" && !nextSettings.youtubeAlphaEnabled) return false;
          if (source.platform === "tiktok" && !nextSettings.tiktokAlphaEnabled) return false;
          return true;
        });
        const restoredSourceIds = new Set(restoredSources.map((source) => source.id));
        const restoredTabs = sanitizeSessionTabs(saved.sessionTabs, restoredSourceIds);
        const restoredActiveTabId =
          typeof saved.sessionActiveTabId === "string" && restoredTabs.some((tab) => tab.id === saved.sessionActiveTabId)
            ? saved.sessionActiveTabId
            : (restoredTabs[0]?.id ?? "");

        setSources(restoredSources);
        setTabs(restoredTabs);
        setActiveTabId(restoredActiveTabId);

        const reconnectableSources = restoredSources.filter((source) => {
          if (source.platform === "twitch") {
            return Boolean(nextSettings.twitchToken || nextSettings.twitchGuest);
          }
          if (source.platform === "kick") {
            return Boolean(nextSettings.kickAccessToken);
          }
          return true;
        });

        if (reconnectableSources.length > 0) {
          void connectRestoredSources(reconnectableSources, nextSettings);
        }
      })
      .catch((error) => {
        if (!active) return;
        setAuthMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!active) return;
        setSessionHydrated(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    void window.electronAPI
      .setSettings({
        sessionSources: sources.map((source) => ({ ...source })),
        sessionTabs: tabs.map((tab) => ({ id: tab.id, sourceIds: [...tab.sourceIds] })),
        sessionActiveTabId: activeTabId
      })
      .catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        void window.electronAPI.writeLog(`[session] failed to persist: ${text}`);
      });
  }, [activeTabId, sessionHydrated, sources, tabs]);

  useEffect(() => {
    channelEmoteMapBySourceIdRef.current = channelEmoteMapBySourceId;
  }, [channelEmoteMapBySourceId]);

  useEffect(() => {
    tabsRef.current = tabs;
    const next: Record<string, string[]> = {};
    for (const tab of tabs) {
      for (const sourceId of tab.sourceIds) {
        if (!next[sourceId]) {
          next[sourceId] = [tab.id];
        } else {
          next[sourceId].push(tab.id);
        }
      }
    }
    tabIdsBySourceIdRef.current = next;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!activeTabId) return;
    setTabUnreadCounts((previous) => {
      if (!(activeTabId in previous)) return previous;
      const next = { ...previous };
      delete next[activeTabId];
      return next;
    });
    setTabMentionCounts((previous) => {
      if (!(activeTabId in previous)) return previous;
      const next = { ...previous };
      delete next[activeTabId];
      return next;
    });
  }, [activeTabId]);

  useEffect(() => {
    const validTabIds = new Set(tabs.map((tab) => tab.id));
    setTabUnreadCounts((previous) => {
      const next: Record<string, number> = {};
      for (const [tabId, count] of Object.entries(previous)) {
        if (validTabIds.has(tabId) && count > 0) {
          next[tabId] = count;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) return previous;
      return next;
    });
    setTabMentionCounts((previous) => {
      const next: Record<string, number> = {};
      for (const [tabId, count] of Object.entries(previous)) {
        if (validTabIds.has(tabId) && count > 0) {
          next[tabId] = count;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) return previous;
      return next;
    });
  }, [tabs]);

  useEffect(() => {
    const validTabIds = new Set(tabs.map((tab) => tab.id));
    setDeckComposerByTabId((previous) => {
      const next: Record<string, string> = {};
      for (const [tabId, value] of Object.entries(previous)) {
        if (validTabIds.has(tabId)) {
          next[tabId] = value;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) return previous;
      return next;
    });
  }, [tabs]);

  useEffect(() => {
    const validTabIds = new Set(tabs.map((tab) => tab.id));
    const nextSamples: Record<string, Array<{ at: number; messagesPerMinute: number; uniqueChatters: number }>> = {};
    for (const [tabId, values] of Object.entries(raidSamplesByTabRef.current)) {
      if (validTabIds.has(tabId)) {
        nextSamples[tabId] = values;
      }
    }
    raidSamplesByTabRef.current = nextSamples;

    const nextLastSample: Record<string, number> = {};
    for (const [tabId, value] of Object.entries(lastRaidSampleAtByTabRef.current)) {
      if (validTabIds.has(tabId)) {
        nextLastSample[tabId] = value;
      }
    }
    lastRaidSampleAtByTabRef.current = nextLastSample;

    setRaidSignal((previous) => {
      if (!previous) return previous;
      return validTabIds.has(previous.tabId) ? previous : null;
    });
  }, [tabs]);

  useEffect(() => {
    let cancelled = false;
    if (effectivePerformanceMode) {
      setGlobalEmoteMap({});
      return;
    }
    void Promise.all([fetchBttvGlobalEmotes(), fetchSevenTvGlobalEmotes()]).then(([bttvMap, sevenTvMap]) => {
      if (cancelled) return;
      setGlobalEmoteMap({
        ...bttvMap,
        ...sevenTvMap
      });
    });
    return () => {
      cancelled = true;
    };
  }, [effectivePerformanceMode]);

  useEffect(() => {
    const validSourceIds = new Set(sources.map((source) => source.id));
    setChannelEmoteMapBySourceId((previous) => {
      const next: Record<string, EmoteMap> = {};
      for (const [sourceId, map] of Object.entries(previous)) {
        if (validSourceIds.has(sourceId)) {
          next[sourceId] = map;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) {
        return previous;
      }
      return next;
    });
  }, [sources]);

  useEffect(() => {
    const validSourceIds = new Set(sources.map((source) => source.id));
    setConnectionHealthBySource((previous) => {
      const next: Record<string, ConnectionHealthState> = {};
      for (const [sourceId, health] of Object.entries(previous)) {
        if (validSourceIds.has(sourceId)) {
          next[sourceId] = health;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) {
        return previous;
      }
      return next;
    });
  }, [sources]);

  useEffect(() => {
    const validSourceIds = new Set(sources.map((source) => source.id));
    setModeratorBySource((previous) => {
      const next: Record<string, boolean> = {};
      for (const [sourceId, canModerate] of Object.entries(previous)) {
        if (validSourceIds.has(sourceId)) {
          next[sourceId] = canModerate;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) {
        return previous;
      }
      return next;
    });
  }, [sources]);

  useEffect(() => {
    const validSourceIds = new Set(sources.map((source) => source.id));
    const next: Record<string, number> = {};
    for (const sourceId of Object.keys(lastHealthPublishAtBySourceRef.current)) {
      if (validSourceIds.has(sourceId)) {
        next[sourceId] = lastHealthPublishAtBySourceRef.current[sourceId];
      }
    }
    lastHealthPublishAtBySourceRef.current = next;
  }, [sources]);

  useEffect(() => {
    const validSourceIds = new Set(sources.map((source) => source.id));
    const nextAutoHeal: Record<string, { attempt: number; timer: number | null }> = {};
    for (const [sourceId, state] of Object.entries(autoHealStateBySourceRef.current)) {
      if (!validSourceIds.has(sourceId)) {
        if (state.timer !== null) {
          window.clearTimeout(state.timer);
        }
        continue;
      }
      nextAutoHeal[sourceId] = state;
    }
    autoHealStateBySourceRef.current = nextAutoHeal;
    suppressedAutoHealSourceIdsRef.current = new Set(
      Array.from(suppressedAutoHealSourceIdsRef.current).filter((sourceId) => validSourceIds.has(sourceId))
    );
  }, [sources]);

  useEffect(() => {
    let cancelled = false;
    if (effectivePerformanceMode) return;
    const twitchSources = sources.filter((source) => source.platform === "twitch");
    for (const source of twitchSources) {
      if (channelEmoteMapBySourceId[source.id]) continue;
      if (emoteFetchInFlight.current.has(source.id)) continue;
      emoteFetchInFlight.current.add(source.id);

      void fetchTwitchThirdPartyEmotes(source.channel, settings.twitchClientId, settings.twitchToken)
        .then((map) => {
          if (cancelled) return;
          if (!hasAnyEmotes(map)) return;
          setChannelEmoteMapBySourceId((previous) => ({
            ...previous,
            [source.id]: map
          }));
        })
        .finally(() => {
          emoteFetchInFlight.current.delete(source.id);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [channelEmoteMapBySourceId, effectivePerformanceMode, settings.twitchClientId, settings.twitchToken, sources]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isAdvancedMode) return;
      const key = `${event.ctrlKey ? "Control+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key.toUpperCase()}`;
      if (key === hotkeys.focusSearch.toUpperCase()) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAdvancedMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key !== "Tab") return;
      if (tabs.length < 2) return;
      event.preventDefault();
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabIdRef.current);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const delta = event.shiftKey ? -1 : 1;
      const nextIndex = (baseIndex + delta + tabs.length) % tabs.length;
      setActiveTabId(tabs[nextIndex].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs]);

  useEffect(() => {
    return () => {
      adaptersRef.current.forEach((adapter) => {
        void adapter.disconnect();
      });
      adaptersRef.current.clear();
      for (const state of Object.values(autoHealStateBySourceRef.current)) {
        if (state.timer !== null) {
          window.clearTimeout(state.timer);
        }
      }
      autoHealStateBySourceRef.current = {};
    };
  }, []);

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  useEffect(() => {
    sourceByIdRef.current = sourceById;
  }, [sourceById]);
  const sourceByPlatformChannel = useMemo(
    () => new Map(sources.map((source) => [`${source.platform}:${source.channel}`, source])),
    [sources]
  );
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activePinnedMessage = activeTabId ? settings.pinnedMessageByTabId?.[activeTabId] : undefined;
  const activeTabPoll = activeTabId ? settings.localPollByTabId?.[activeTabId] : undefined;
  const activeTabSources = useMemo(
    () => (activeTab ? activeTab.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as ChatSource[] : []),
    [activeTab, sourceById]
  );
  const activeTabIsMerged = activeTabSources.length > 1;
  const activeSingleSource = activeTabSources.length === 1 ? activeTabSources[0] : null;
  const writableActiveTabSources = useMemo(
    () =>
      activeTabSources.filter((source) => {
        if (source.platform === "twitch") {
          return Boolean(settings.twitchToken);
        }
        if (source.platform === "kick") {
          return Boolean(settings.kickAccessToken);
        }
        return false;
      }),
    [activeTabSources, settings.kickAccessToken, settings.twitchToken]
  );
  const canModerateSource = (source: ChatSource | null): boolean => {
    if (!source) return false;
    if (source.platform !== "twitch" && source.platform !== "kick") return false;

    const currentUsername = normalizeUserKey(
      source.platform === "twitch" ? settings.twitchUsername ?? "" : settings.kickUsername ?? ""
    );
    if (!currentUsername) return false;
    if (normalizeUserKey(source.channel) === currentUsername) {
      return true;
    }
    if (moderatorBySource[source.id] === true) {
      return true;
    }
    return false;
  };
  const canModerateActiveTab = Boolean(
    !activeTabIsMerged &&
      activeSingleSource &&
      (activeSingleSource.platform === "twitch" || activeSingleSource.platform === "kick") &&
      writableActiveTabSources.some((source) => source.id === activeSingleSource.id) &&
      canModerateSource(activeSingleSource)
  );
  const youtubeAlphaEnabled = Boolean(settings.youtubeAlphaEnabled);
  const tiktokAlphaEnabled = Boolean(settings.tiktokAlphaEnabled);
  const hasTwitchAuth = Boolean(settings.twitchToken || settings.twitchGuest);
  const hasKickAuth = Boolean(settings.kickAccessToken);
  const hasPrimaryAuth = hasTwitchAuth || hasKickAuth;
  const setupWizardVersion = Number(settings.setupWizardVersion ?? 0);
  const setupPrimaryConnected = Boolean(settings.twitchToken || settings.kickAccessToken);
  const setupFirstTabReady = tabs.length > 0;
  const setupMessageReady = settings.setupWizardSendTestCompleted === true || setupTestMessageSent;
  const setupCanFinish = setupPrimaryConnected && setupFirstTabReady;
  const streamSafeMode = settings.streamSafeMode === true;
  const welcomeModeEnabled = settings.welcomeMode === true;
  const activeTabSendRule = activeTabId ? settings.tabSendRules?.[activeTabId] : undefined;
  const mentionMutedTabIds = new Set((settings.mentionMutedTabIds ?? []).filter((tabId) => typeof tabId === "string" && tabId.length > 0));
  const mentionSnoozeUntilByTab = settings.mentionSnoozeUntilByTab ?? {};
  const activeMentionSnoozeUntil = activeTabId ? Number(mentionSnoozeUntilByTab[activeTabId] ?? 0) : 0;
  const activeMentionSnoozed = Number.isFinite(activeMentionSnoozeUntil) && activeMentionSnoozeUntil > Date.now();
  const activeMentionMuted = activeTabId ? mentionMutedTabIds.has(activeTabId) : false;
  const activeRaidSignal =
    raidSignal && raidSignal.tabId === activeTabId && Date.now() - raidSignal.detectedAt < 10 * 60_000
      ? raidSignal
      : null;
  const readOnlyPlatforms = useMemo(() => {
    const next: Platform[] = [];
    if (youtubeAlphaEnabled) {
      next.push("youtube");
    }
    if (tiktokAlphaEnabled) {
      next.push("tiktok");
    }
    return next;
  }, [tiktokAlphaEnabled, youtubeAlphaEnabled]);
  const availablePlatforms = useMemo(() => {
    if (!hasPrimaryAuth && readOnlyGuideMode) {
      return readOnlyPlatforms;
    }
    const next: Platform[] = [];
    if (hasTwitchAuth) {
      next.push("twitch");
    }
    if (hasKickAuth) {
      next.push("kick");
    }
    if (youtubeAlphaEnabled) {
      next.push("youtube");
    }
    if (tiktokAlphaEnabled) {
      next.push("tiktok");
    }
    return next;
  }, [hasKickAuth, hasPrimaryAuth, hasTwitchAuth, readOnlyGuideMode, readOnlyPlatforms, tiktokAlphaEnabled, youtubeAlphaEnabled]);
  const layoutPresetOptions = [
    { id: "stream", label: "Stream" },
    { id: "mod", label: "Mod" },
    { id: "collab", label: "Collab" }
  ] as const;
  const updateLockActive = updateStatus.state === "downloading" || updateStatus.state === "downloaded";
  const updateLockTitle =
    updateStatus.state === "downloading" ? "Updating MultiChat..." : "Applying Update...";
  const updateLockMessage = updateStatus.message || "Please wait while the update completes.";
  const connectionHealthRows = useMemo(
    () =>
      sources.map((source) => {
        const authExpiry =
          source.platform === "twitch"
            ? authHealth?.twitch.tokenExpiry ?? null
            : source.platform === "kick"
              ? authHealth?.kick.tokenExpiry ?? null
              : source.platform === "youtube"
                ? authHealth?.youtubeTokenExpiry ?? null
                : null;
        return {
          source,
          status: statusBySource[source.id] ?? "disconnected",
          health: connectionHealthBySource[source.id],
          tokenExpiry: authExpiry,
          canSend:
            source.platform === "twitch"
              ? Boolean(settings.twitchToken)
              : source.platform === "kick"
                ? Boolean(settings.kickAccessToken)
                : false,
          canModerate: canModerateSource(source)
        };
      }),
    [authHealth, canModerateSource, connectionHealthBySource, settings.kickAccessToken, settings.twitchToken, sources, statusBySource]
  );
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const activeMessages = useMemo(() => {
    if (!activeTab) return [];
    if (activeTab.sourceIds.length === 1) {
      const single = messagesBySource[activeTab.sourceIds[0]] ?? [];
      const filtered = normalizedSearch
        ? single.filter((message) => message.message.toLowerCase().includes(normalizedSearch))
        : single;
      return collapseFanoutLocalEchoes(filtered);
    }
    const merged = activeTab.sourceIds.flatMap((sourceId) => messagesBySource[sourceId] ?? []);
    const filtered = merged.filter((message) => (normalizedSearch ? message.message.toLowerCase().includes(normalizedSearch) : true));
    const sorted = filtered.sort((a, b) => messageTimestamp(a) - messageTimestamp(b));
    return collapseFanoutLocalEchoes(sorted);
  }, [activeTab, messagesBySource, normalizedSearch]);

  const replayFilteredMessages = useMemo(() => {
    if (replayWindow <= 0 && replayBufferSeconds <= 0) return activeMessages;
    const minuteCutoff = replayWindow > 0 ? Date.now() - replayWindow * 60 * 1000 : 0;
    const secondCutoff = replayBufferSeconds > 0 ? Date.now() - replayBufferSeconds * 1000 : 0;
    const cutoff = Math.max(minuteCutoff, secondCutoff);
    return activeMessages.filter((message) => messageTimestamp(message) >= cutoff);
  }, [activeMessages, replayBufferSeconds, replayWindow]);

  const delayedReplayMessages = useMemo(() => {
    if (!streamDelayMode || streamDelaySeconds <= 0) return replayFilteredMessages;
    const cutoff = Date.now() - streamDelaySeconds * 1000;
    return replayFilteredMessages.filter((message) => messageTimestamp(message) <= cutoff);
  }, [replayFilteredMessages, streamDelayMode, streamDelaySeconds]);

  const visibleMessages = useMemo(() => {
    if (newestLocked || lockCutoffTimestamp === null) return delayedReplayMessages;
    return delayedReplayMessages.filter((message) => messageTimestamp(message) <= lockCutoffTimestamp);
  }, [delayedReplayMessages, lockCutoffTimestamp, newestLocked]);

  const pendingNewestCount = useMemo(() => {
    if (newestLocked) return 0;
    return Math.max(0, delayedReplayMessages.length - visibleMessages.length);
  }, [delayedReplayMessages.length, newestLocked, visibleMessages.length]);

  useEffect(() => {
    if (newestLocked) return;
    const timer = window.setTimeout(() => {
      setNewestLocked(true);
      setLockCutoffTimestamp(null);
      const list = messageListRef.current;
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    }, AUTO_RESUME_NEWEST_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [activeTabId, newestLocked]);

  const renderedMessages = useMemo(() => {
    if (!newestLocked) return visibleMessages;
    const limit = effectivePerformanceMode ? Math.max(180, Math.floor(LOCKED_RENDERED_MESSAGE_LIMIT * 0.6)) : LOCKED_RENDERED_MESSAGE_LIMIT;
    if (visibleMessages.length <= limit) return visibleMessages;
    return visibleMessages.slice(-limit);
  }, [effectivePerformanceMode, newestLocked, visibleMessages]);

  const chatHealth = useMemo(() => {
    const now = Date.now();
    const oneMinute = now - 60_000;
    const fiveMinutes = now - 5 * 60_000;
    const messagesPerMinute = delayedReplayMessages.filter((message) => messageTimestamp(message) >= oneMinute).length;
    const uniqueChatters = new Set(
      delayedReplayMessages
        .filter((message) => messageTimestamp(message) >= fiveMinutes)
        .map((message) => normalizeUserKey(message.username))
    ).size;
    return { messagesPerMinute, uniqueChatters };
  }, [delayedReplayMessages]);

  const analyticsSummary = useMemo(() => {
    const now = Date.now();
    const oneMinute = now - 60_000;
    const recentMessages = delayedReplayMessages.filter((message) => messageTimestamp(message) >= oneMinute);
    const mentionCountPerMinute = recentMessages.filter(
      (message) => isMentionForPlatformUser(message, settings) || isReplyForPlatformUser(message, settings)
    ).length;
    const activeSourceLabels = new Set(activeTabSources.map((source) => `${source.platform}/${source.channel}`));
    const modActionsPerMinute = moderationHistory.filter((entry) => {
      if (entry.at < oneMinute) return false;
      if (activeSourceLabels.size === 0) return true;
      for (const label of activeSourceLabels) {
        if (entry.source.includes(label)) return true;
      }
      return false;
    }).length;
    return {
      activeChatters: chatHealth.uniqueChatters,
      messagesPerMinute: chatHealth.messagesPerMinute,
      mentionRatePerMinute: mentionCountPerMinute,
      modActionRatePerMinute: modActionsPerMinute
    };
  }, [activeTabSources, chatHealth.messagesPerMinute, chatHealth.uniqueChatters, delayedReplayMessages, moderationHistory, settings]);

  const globalSearchResults = useMemo(() => {
    if (!globalSearchMode || !normalizedSearch) return [];
    const all = sources.flatMap((source) => messagesBySource[source.id] ?? []);
    return all
      .filter((message) => message.message.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => messageTimestamp(b) - messageTimestamp(a))
      .slice(0, 250);
  }, [globalSearchMode, messagesBySource, normalizedSearch, sources]);

  const deckMessagesByTabId = useMemo(() => {
    const next: Record<string, ChatMessage[]> = {};
    for (const tab of tabs) {
      const merged = tab.sourceIds.flatMap((sourceId) => messagesBySource[sourceId] ?? []);
      const sorted = merged.sort((a, b) => messageTimestamp(a) - messageTimestamp(b));
      const delayed = streamDelayMode && streamDelaySeconds > 0
        ? sorted.filter((message) => messageTimestamp(message) <= Date.now() - streamDelaySeconds * 1000)
        : sorted;
      next[tab.id] = normalizedSearch
        ? delayed.filter((message) => message.message.toLowerCase().includes(normalizedSearch))
        : delayed;
    }
    return next;
  }, [messagesBySource, normalizedSearch, streamDelayMode, streamDelaySeconds, tabs]);

  const activeTabLastReadAt = activeTabId ? lastReadAtByTab[activeTabId] ?? 0 : 0;
  const firstUnreadTimestamp = useMemo(() => {
    if (!activeTab || !activeTabLastReadAt) return 0;
    const firstUnread = replayFilteredMessages.find((message) => messageTimestamp(message) > activeTabLastReadAt);
    return firstUnread ? messageTimestamp(firstUnread) : 0;
  }, [activeTab, activeTabLastReadAt, replayFilteredMessages]);

  const userLogMessages = useMemo(() => {
    if (!userLogTarget) return [];
    const username = normalizeUserKey(userLogTarget.username);
    if (!username) return [];

    const relevantSourceIds = sources.filter((source) => source.platform === userLogTarget.platform).map((source) => source.id);
    const merged = relevantSourceIds.flatMap((sourceId) => messagesBySource[sourceId] ?? []);
    const filtered = merged.filter((message) => normalizeUserKey(message.username) === username);
    return filtered.sort((a, b) => messageTimestamp(b) - messageTimestamp(a)).slice(0, 500);
  }, [messagesBySource, sources, userLogTarget]);

  const identityMessages = useMemo(() => {
    if (!identityTarget) return [];
    const key = normalizeUserKey(identityTarget.username);
    const merged = sources.flatMap((source) => messagesBySource[source.id] ?? []);
    return merged
      .filter((message) => normalizeUserKey(message.username) === key)
      .sort((a, b) => messageTimestamp(b) - messageTimestamp(a))
      .slice(0, 200);
  }, [identityTarget, messagesBySource, sources]);

  const identityStats = useMemo(() => {
    if (!identityTarget) {
      return {
        total: 0,
        inLastMinute: 0,
        inLastFiveMinutes: 0,
        mentionCount: 0
      };
    }
    const now = Date.now();
    const oneMinute = now - 60_000;
    const fiveMinutes = now - 5 * 60_000;
    const mentionNeedle = `@${normalizeUserKey(identityTarget.username)}`;
    const total = identityMessages.length;
    let inLastMinute = 0;
    let inLastFiveMinutes = 0;
    let mentionCount = 0;
    for (const message of identityMessages) {
      const ts = messageTimestamp(message);
      if (ts >= oneMinute) inLastMinute += 1;
      if (ts >= fiveMinutes) inLastFiveMinutes += 1;
      if ((message.message ?? "").toLowerCase().includes(mentionNeedle)) {
        mentionCount += 1;
      }
    }
    return { total, inLastMinute, inLastFiveMinutes, mentionCount };
  }, [identityMessages, identityTarget]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (!newestLocked) return;
    const raf = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeMessages, newestLocked]);

  useEffect(() => {
    const now = Date.now();
    if (chatHealth.messagesPerMinute >= 360 && !adaptivePerformanceMode && now - lastAdaptiveToggleAtRef.current > 30_000) {
      lastAdaptiveToggleAtRef.current = now;
      setAdaptivePerformanceMode(true);
      setAuthMessage("Adaptive performance mode enabled for high traffic.");
      return;
    }
    if (chatHealth.messagesPerMinute <= 160 && adaptivePerformanceMode && now - lastAdaptiveToggleAtRef.current > 30_000) {
      lastAdaptiveToggleAtRef.current = now;
      setAdaptivePerformanceMode(false);
      setAuthMessage("Adaptive performance mode disabled.");
    }
  }, [adaptivePerformanceMode, chatHealth.messagesPerMinute]);

  useEffect(() => {
    if (!activeTabId || !activeTab) return;
    const now = Date.now();
    const lastSampleAt = lastRaidSampleAtByTabRef.current[activeTabId] ?? 0;
    if (now - lastSampleAt < 10_000) return;
    lastRaidSampleAtByTabRef.current[activeTabId] = now;

    const previousSamples = raidSamplesByTabRef.current[activeTabId] ?? [];
    const baselineSamples = previousSamples.slice(-6);
    const baselineMessages =
      baselineSamples.length > 0
        ? baselineSamples.reduce((sum, sample) => sum + sample.messagesPerMinute, 0) / baselineSamples.length
        : chatHealth.messagesPerMinute;
    const baselineChatters =
      baselineSamples.length > 0
        ? baselineSamples.reduce((sum, sample) => sum + sample.uniqueChatters, 0) / baselineSamples.length
        : chatHealth.uniqueChatters;

    const nextSample = {
      at: now,
      messagesPerMinute: chatHealth.messagesPerMinute,
      uniqueChatters: chatHealth.uniqueChatters
    };
    raidSamplesByTabRef.current[activeTabId] = [...previousSamples, nextSample].slice(-12);

    if (baselineSamples.length < 3) return;
    const messagesThreshold = Math.max(45, Math.round(baselineMessages * 2.4));
    const chattersThreshold = Math.max(24, Math.round(baselineChatters * 1.8));
    const isSpike = nextSample.messagesPerMinute >= messagesThreshold && nextSample.uniqueChatters >= chattersThreshold;
    if (!isSpike) return;

    setRaidSignal((previous) => {
      if (previous && previous.tabId === activeTabId && now - previous.detectedAt < 3 * 60_000) {
        return previous;
      }
      return {
        tabId: activeTabId,
        detectedAt: now,
        messagesPerMinute: nextSample.messagesPerMinute,
        uniqueChatters: nextSample.uniqueChatters
      };
    });
    if (!welcomeModeEnabled) {
      setAuthMessage(
        `Possible raid spike detected (${nextSample.messagesPerMinute}/min, ${nextSample.uniqueChatters} chatters). Enable Welcome Mode.`
      );
    }
  }, [activeTab, activeTabId, chatHealth.messagesPerMinute, chatHealth.uniqueChatters, welcomeModeEnabled]);

  const composerPlaceholder =
    writableActiveTabSources.length === 0
      ? "Read-only for YouTube/TikTok in this build"
      : sendTargetId === SEND_TARGET_TAB_ALL && writableActiveTabSources.length > 1
        ? `Type a message to all ${writableActiveTabSources.length} chats in this tab`
        : "Type a message";

  const commandSuggestions = useMemo(() => {
    const text = composerText.trim();
    if (!text.startsWith("/")) return [];
    const pool = Array.from(
      new Set([
        "/timeout {user} 60",
        "/timeout {user} 600",
        "/ban {user}",
        "/unban {user}",
        "/delete {messageId}",
        ...COMMAND_SNIPPETS
      ])
    );
    return pool.filter((entry) => entry.toLowerCase().includes(text.toLowerCase())).slice(0, 10);
  }, [composerText]);

  const triggerAttention = (title: string, body: string, alertKey: string, allowSound = true, allowNotify = true) => {
    const now = Date.now();
    const last = lastTabAlertAtRef.current.get(alertKey) ?? 0;
    if (now - last < 1200) return;
    lastTabAlertAtRef.current.set(alertKey, now);

    if (allowSound) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const audioContext = mentionAudioContextRef.current ?? new Ctx();
          mentionAudioContextRef.current = audioContext;
          if (audioContext.state === "suspended") {
            void audioContext.resume();
          }
          const startAt = audioContext.currentTime;
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.13, startAt + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.24);
        }
      } catch {
        // no-op
      }
    }

    if (allowNotify && "Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(title, {
        body: body.slice(0, 240),
        silent: true
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  };

  const clearAutoHealRetry = (sourceId: string, resetAttempt = false) => {
    const current = autoHealStateBySourceRef.current[sourceId];
    if (!current) return;
    if (current.timer !== null) {
      window.clearTimeout(current.timer);
    }
    if (resetAttempt) {
      autoHealStateBySourceRef.current[sourceId] = { attempt: 0, timer: null };
      return;
    }
    autoHealStateBySourceRef.current[sourceId] = { ...current, timer: null };
  };

  const scheduleAutoHealRetry = (source: ChatSource, reason: string) => {
    if (!sourceByIdRef.current.has(source.id)) return;
    if (suppressedAutoHealSourceIdsRef.current.has(source.id)) return;

    const currentSettings = settingsRef.current;
    if (source.platform === "twitch" && !hasAuthForPlatform("twitch", currentSettings)) return;
    if (source.platform === "kick" && !hasAuthForPlatform("kick", currentSettings)) return;

    const previous = autoHealStateBySourceRef.current[source.id] ?? { attempt: 0, timer: null as number | null };
    if (previous.timer !== null) return;
    const attempt = Math.min(previous.attempt + 1, 8);
    const delayMs = Math.min(45_000, Math.round(1500 * 2 ** (attempt - 1)));

    setConnectionHealthBySource((existing) => ({
      ...existing,
      [source.id]: {
        ...(existing[source.id] ?? {
          lastStatus: "disconnected",
          lastStatusAt: Date.now()
        }),
        reconnectReason: `Auto-heal retry ${attempt} in ${Math.round(delayMs / 1000)}s (${reason})`
      }
    }));

    const timer = window.setTimeout(() => {
      autoHealStateBySourceRef.current[source.id] = { attempt, timer: null };
      if (!sourceByIdRef.current.has(source.id)) return;
      if (suppressedAutoHealSourceIdsRef.current.has(source.id)) return;

      const latestSettings = settingsRef.current;
      if (source.platform === "twitch" && !hasAuthForPlatform("twitch", latestSettings)) return;
      if (source.platform === "kick" && !hasAuthForPlatform("kick", latestSettings)) return;

      const existingAdapter = adaptersRef.current.get(source.id);
      if (existingAdapter) {
        void existingAdapter
          .disconnect()
          .catch(() => {
            // no-op
          })
          .finally(() => {
            adaptersRef.current.delete(source.id);
          });
      }
      sourceStatusRef.current[source.id] = "connecting";
      setStatusBySource((existing) => ({
        ...existing,
        [source.id]: "connecting"
      }));
      setConnectionHealthBySource((existing) => ({
        ...existing,
        [source.id]: {
          ...(existing[source.id] ?? {
            lastStatus: "connecting",
            lastStatusAt: Date.now()
          }),
          lastStatus: "connecting",
          lastStatusAt: Date.now(),
          reconnectReason: `Auto-heal reconnect attempt ${attempt}...`
        }
      }));
      void ensureAdapterConnected(source, latestSettings).catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        setConnectionHealthBySource((existing) => ({
          ...existing,
          [source.id]: {
            ...(existing[source.id] ?? {
              lastStatus: "error",
              lastStatusAt: Date.now()
            }),
            lastStatus: "error",
            lastStatusAt: Date.now(),
            lastError: text
          }
        }));
        scheduleAutoHealRetry(source, text);
      });
    }, delayMs);
    autoHealStateBySourceRef.current[source.id] = { attempt, timer };
  };

  const ensureAdapterConnected = async (source: ChatSource, currentSettings: Settings) => {
    if (adaptersRef.current.has(source.id)) return;

    const logger = (message: string) => {
      void window.electronAPI.writeLog(`[${source.key}] ${message}`);
    };

    let adapter: ChatAdapter;
    if (source.platform === "twitch") {
      adapter = new TwitchAdapter({
        channel: source.channel,
        auth: { token: currentSettings.twitchToken, username: currentSettings.twitchUsername },
        logger
      });
    } else if (source.platform === "kick") {
      adapter = new KickAdapter({
        channel: source.channel,
        auth: {
          accessToken: currentSettings.kickAccessToken,
          username: currentSettings.kickUsername,
          guest: currentSettings.kickGuest
        },
        resolveChatroomId: async (channel) => {
          const result = await window.electronAPI.resolveKickChatroom(channel);
          return result.chatroomId;
        },
        refreshAccessToken: async () => {
          try {
            const next = await window.electronAPI.refreshKickAuth();
            setSettings({ ...defaultSettings, ...next });
            return next.kickAccessToken?.trim() ?? null;
          } catch {
            return null;
          }
        },
        logger
      });
    } else if (source.platform === "youtube") {
      adapter = new YouTubeAdapter({
        channel: source.channel,
        auth: {
          liveChatId: source.liveChatId
        },
        transport: {
          fetchMessages: async ({ liveChatId, pageToken }) =>
            window.electronAPI.youtubeFetchMessages({
              liveChatId,
              pageToken
            }),
          sendMessage: async ({ liveChatId, message }) =>
            window.electronAPI.youtubeSendMessage({
              liveChatId,
              message
            })
        },
        logger
      });
    } else {
      adapter = new TikTokAdapter({
        channel: source.channel,
        transport: {
          connect: async ({ channel }) => window.electronAPI.tiktokConnect(channel),
          disconnect: async ({ connectionId }) => window.electronAPI.tiktokDisconnect(connectionId),
          sendMessage: async ({ connectionId, message }) =>
            window.electronAPI.tiktokSendMessage({
              connectionId,
              message
            }),
          onEvent: (handler) =>
            window.electronAPI.onTikTokEvent((event) => {
              handler(event as any);
            })
        },
        logger
      });
    }

    adapter.onStatus((status) => {
      const now = Date.now();
      const previousStatus = sourceStatusRef.current[source.id];
      sourceStatusRef.current[source.id] = status;
      setStatusBySource((prev) => ({ ...prev, [source.id]: status }));
      setConnectionHealthBySource((previous) => {
        const current = previous[source.id];
        const reconnectReason =
          status === "connecting" && previousStatus === "connected"
            ? "Connection dropped; adapter started reconnect backoff."
            : current?.reconnectReason;
        const lastError = status === "error" ? current?.lastError ?? "Connection entered an error state." : current?.lastError;
        return {
          ...previous,
          [source.id]: {
            lastStatus: status,
            lastStatusAt: now,
            lastMessageAt: current?.lastMessageAt,
            lastConnectedAt: status === "connected" ? now : current?.lastConnectedAt,
            reconnectReason,
            lastError
          }
        };
      });
      if (status === "connected") {
        clearAutoHealRetry(source.id, true);
        return;
      }
      if ((status === "error" || status === "disconnected") && previousStatus !== "connecting") {
        scheduleAutoHealRetry(source, status === "error" ? "adapter error state" : "adapter disconnected");
      }
    });

    adapter.onMessage((message) => {
      const now = Date.now();
      const raw = asRecord(message.raw);
      const isHiddenMeta = raw?.hidden === true;
      const isSelfRoleState = raw?.selfRoleState === true;
      if (source.platform === "twitch" && raw) {
        const roomIdRaw = typeof raw["room-id"] === "string" ? raw["room-id"].trim() : "";
        const sourceRoomIdRaw = typeof raw["source-room-id"] === "string" ? raw["source-room-id"].trim() : "";
        if (roomIdRaw) {
          twitchRoomIdToChannelRef.current.set(roomIdRaw, message.channel);
        }
        if (roomIdRaw && sourceRoomIdRaw && sourceRoomIdRaw !== roomIdRaw) {
          const currentChannel = twitchRoomIdToChannelRef.current.get(roomIdRaw) ?? message.channel;
          const linkedChannel = twitchRoomIdToChannelRef.current.get(sourceRoomIdRaw) ?? `room ${sourceRoomIdRaw}`;
          const alertKey = [roomIdRaw, sourceRoomIdRaw].sort().join(":");
          const lastAlertAt = twitchSharedChatAlertAtRef.current.get(alertKey) ?? 0;
          if (now - lastAlertAt > 120_000) {
            twitchSharedChatAlertAtRef.current.set(alertKey, now);
            setAuthMessage(`Twitch shared chat active: #${currentChannel} is combined with #${linkedChannel}.`);
          }
        }
      }
      const currentUsername =
        source.platform === "twitch"
          ? normalizeUserKey(currentSettings.twitchUsername ?? "")
          : source.platform === "kick"
            ? normalizeUserKey(currentSettings.kickUsername ?? "")
            : "";
      const isSelf = currentUsername.length > 0 && normalizeUserKey(message.username) === currentUsername;
      if ((source.platform === "twitch" || source.platform === "kick") && isSelf) {
        if (messageHasModerationBadge(message)) {
          setModeratorBySource((previous) =>
            previous[source.id] === true
              ? previous
              : {
                  ...previous,
                  [source.id]: true
                }
          );
        } else if (isSelfRoleState) {
          setModeratorBySource((previous) => ({
            ...previous,
            [source.id]: false
          }));
        }
      }
      if (isHiddenMeta) {
        return;
      }

      const dedupeKey = messageContentFingerprint(message);
      const last = lastMessageByUser.current.get(dedupeKey) ?? 0;
      if (isLocalEcho(message) && now - last < 400) return;
      lastMessageByUser.current.set(dedupeKey, now);
      const welcomeModeActive = currentSettings.welcomeMode === true;

      if (currentSettings.hideCommands && message.message.startsWith("!")) return;
      if (currentSettings.smartFilterScam !== false && SCAM_PATTERN.test(message.message)) return;
      if (currentSettings.smartFilterSpam !== false) {
        const fingerprint = `${normalizeUserKey(message.username)}|${message.channel}|${message.message.trim().toLowerCase()}`;
        const prevSeenAt = spamFilterRef.current.get(fingerprint) ?? 0;
        if (now - prevSeenAt < 8000) return;
        spamFilterRef.current.set(fingerprint, now);
      }
      if (
        currentSettings.keywordFilters?.some((word) =>
          message.message.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        return;
      }

      const lastHealthPublishAt = lastHealthPublishAtBySourceRef.current[source.id] ?? 0;
      if (now - lastHealthPublishAt >= 2000) {
        lastHealthPublishAtBySourceRef.current[source.id] = now;
        setConnectionHealthBySource((previous) => ({
          ...previous,
          [source.id]: {
            ...(previous[source.id] ?? {
              lastStatus: sourceStatusRef.current[source.id] ?? "connecting",
              lastStatusAt: now
            }),
            lastMessageAt: now
          }
        }));
      }

      setMessagesBySource((prev) => {
        const maxHistory = currentSettings.performanceMode ? 300 : 800;
        const existing = prev[source.id] ?? [];
        let updated = existing;
        if (!isLocalEcho(message)) {
          const normalizedMessage = message.message.trim();
          for (let index = existing.length - 1; index >= 0; index -= 1) {
            const candidate = existing[index];
            if (!isLocalEcho(candidate)) continue;
            if (candidate.platform !== message.platform || candidate.channel !== message.channel) continue;
            if (normalizeUserKey(candidate.username) !== normalizeUserKey(message.username)) continue;
            if (candidate.message.trim() !== normalizedMessage) continue;
            if (Math.abs(messageTimestamp(candidate) - messageTimestamp(message)) > 6000) continue;
            const replaced = [...existing];
            replaced[index] = message;
            updated = replaced;
            break;
          }
        }
        if (updated === existing) {
          updated = [...existing, message];
        }
        updated = updated.slice(-maxHistory);
        return { ...prev, [source.id]: updated };
      });

      const sourceTabIds = tabIdsBySourceIdRef.current[source.id] ?? [];
      const sourceInActiveTab = sourceTabIds.includes(activeTabIdRef.current);
      const backgroundTabIds = sourceTabIds.filter((tabId) => {
        if (!tabId || tabId === activeTabIdRef.current) return false;
        const group = (currentSettings.tabGroups ?? {})[tabId] ?? "";
        if (!group) return true;
        return !(currentSettings.mutedGroups ?? []).includes(group);
      });
      if (backgroundTabIds.length > 0) {
        setTabUnreadCounts((previous) => {
          const next = { ...previous };
          for (const tabId of backgroundTabIds) {
            const prior = next[tabId] ?? 0;
            next[tabId] = Math.min(999, prior + 1);
          }
          return next;
        });
      }

      const mentionReason: "mention" | "reply" | null = isMentionForPlatformUser(message, currentSettings)
        ? "mention"
        : isReplyForPlatformUser(message, currentSettings)
          ? "reply"
          : null;
      if (mentionReason) {
        const mentionAlertKey = `${mentionReason}:${message.platform}:${message.channel}:${normalizeUserKey(message.username)}:${message.message
          .trim()
          .toLowerCase()}`;
        const mentionTabId = sourceTabIds[0] ?? null;
        const mentionMuted = mentionTabId
          ? (currentSettings.mentionMutedTabIds ?? []).includes(mentionTabId)
          : false;
        const mentionSnoozeUntil = mentionTabId ? Number(currentSettings.mentionSnoozeUntilByTab?.[mentionTabId] ?? 0) : 0;
        const mentionSnoozed = mentionTabId ? Number.isFinite(mentionSnoozeUntil) && mentionSnoozeUntil > now : false;
        const activeTabRule = (currentSettings.tabAlertRules ?? {})[activeTabIdRef.current];
        if (!mentionMuted && !mentionSnoozed && now - lastMentionAlertAtRef.current > 1000) {
          lastMentionAlertAtRef.current = now;
          if (sourceInActiveTab) {
            triggerAttention(
              `${message.platform.toUpperCase()} ${mentionReason} in #${message.channel}`,
              `${message.displayName}: ${message.message}`,
              mentionAlertKey,
              (activeTabRule?.mentionSound ?? true) && sceneOverrides.sound,
              (activeTabRule?.mentionNotify ?? true) && sceneOverrides.notify
            );
          }
        }
        if (!mentionMuted && !mentionSnoozed) {
          if (mentionTabId && mentionTabId !== activeTabIdRef.current) {
            setTabMentionCounts((previous) => ({
              ...previous,
              [mentionTabId]: Math.min(999, (previous[mentionTabId] ?? 0) + 1)
            }));
          }
          const mentionId = `${message.id}:${message.platform}:${message.channel}:${message.timestamp}`;
          setMentionInbox((previous) => {
            if (previous.some((entry) => entry.id === mentionId)) {
              return previous;
            }
            const next: MentionInboxEntry = {
              id: mentionId,
              sourceId: source.id,
              tabId: mentionTabId,
              reason: mentionReason,
              platform: message.platform,
              channel: message.channel,
              displayName: message.displayName,
              message: message.message,
              timestamp: message.timestamp
            };
            return [next, ...previous].slice(0, 250);
          });
        }
      }

      const engagementAlertKind = detectEngagementAlertKind(message);
      if (engagementAlertKind && sourceInActiveTab) {
        const noun = engagementAlertKind === "follow" ? "follow" : "subscriber";
        const sourceLabel = `${message.platform.toUpperCase()} ${noun} alert`;
        const alertBody = `${message.displayName}: ${message.message}`;
        triggerAttention(
          sourceLabel,
          alertBody,
          `engagement:${source.id}:${message.id}:${engagementAlertKind}`,
          sceneOverrides.sound && !welcomeModeActive,
          sceneOverrides.notify && !welcomeModeActive
        );
      }

      const tabRules = currentSettings.tabAlertRules ?? {};
      for (const tabId of sourceTabIds) {
        if (tabId !== activeTabIdRef.current) continue;
        const rule = tabRules[tabId];
        const keyword = (rule?.keyword ?? "").trim();
        if (!keyword) continue;
        if (!message.message.toLowerCase().includes(keyword.toLowerCase())) continue;
        triggerAttention(
          `Tab alert in ${source.platform}/${source.channel}`,
          `${message.displayName}: ${message.message}`,
          `tab:${tabId}:${keyword.toLowerCase()}`,
          rule?.sound !== false && sceneOverrides.sound && !welcomeModeActive,
          rule?.notify !== false && sceneOverrides.notify && !welcomeModeActive
        );
      }

      if (source.platform === "twitch" && !channelEmoteMapBySourceIdRef.current[source.id]) {
        const roomId = extractTwitchRoomId(message);
        if (roomId && !emoteFetchInFlight.current.has(source.id)) {
          emoteFetchInFlight.current.add(source.id);
          void fetchTwitchThirdPartyEmotesByUserId(roomId)
            .then((map) => {
              if (!hasAnyEmotes(map)) return;
              setChannelEmoteMapBySourceId((previous) => {
                if (previous[source.id]) return previous;
                return {
                  ...previous,
                  [source.id]: map
                };
              });
            })
            .finally(() => {
              emoteFetchInFlight.current.delete(source.id);
            });
        }
      }

      broadcast.postMessage(message);
    });

    adaptersRef.current.set(source.id, adapter);
    if (source.platform === "twitch" || source.platform === "kick") {
      const currentUsername =
        source.platform === "twitch"
          ? normalizeUserKey(currentSettings.twitchUsername ?? "")
          : normalizeUserKey(currentSettings.kickUsername ?? "");
      const isBroadcaster = currentUsername.length > 0 && normalizeUserKey(source.channel) === currentUsername;
      setModeratorBySource((previous) => ({
        ...previous,
        [source.id]: isBroadcaster
      }));
      if (source.platform === "twitch" && currentUsername.length > 0 && !isBroadcaster) {
        void checkTwitchModeratorStatus(source.channel, currentUsername).then((isModerator) => {
          if (isModerator === null) return;
          setModeratorBySource((previous) => ({
            ...previous,
            [source.id]: isModerator
          }));
        });
      }
    }
    try {
      await adapter.connect();
    } catch (error) {
      setStatusBySource((prev) => ({ ...prev, [source.id]: "error" }));
      const text = error instanceof Error ? error.message : String(error);
      sourceStatusRef.current[source.id] = "error";
      setConnectionHealthBySource((previous) => ({
        ...previous,
        [source.id]: {
          lastStatus: "error",
          lastStatusAt: Date.now(),
          lastConnectedAt: previous[source.id]?.lastConnectedAt,
          reconnectReason: previous[source.id]?.reconnectReason,
          lastError: text
        }
      }));
      setMessagesBySource((prev) => {
        const systemMessage: ChatMessage = {
          id: `system-${source.id}-${Date.now()}`,
          platform: source.platform,
          channel: source.channel,
          username: "system",
          displayName: "System",
          message: `Connection error: ${text}`,
          timestamp: new Date().toISOString(),
          color: "#f08a65"
        };
        const updated = [...(prev[source.id] ?? []), systemMessage].slice(-800);
        return { ...prev, [source.id]: updated };
      });
      void window.electronAPI.writeLog(`[${source.key}] connect failed: ${text}`);
      scheduleAutoHealRetry(source, text);
    }
  };

  const addChannelTab = async (overrides?: { platform?: Platform; channel?: string }) => {
    const selectedPlatform = overrides?.platform ?? platformInput;
    const selectedChannelInput = overrides?.channel ?? channelInput;
    const channel = normalizeChannel(selectedChannelInput, selectedPlatform);
    if (!channel) return;

    if (selectedPlatform === "twitch" && !hasAuthForPlatform("twitch", settings)) {
      setAuthMessage(`Sign in to twitch before opening twitch/${channel}.`);
      return;
    }
    if (selectedPlatform === "kick" && !hasAuthForPlatform("kick", settings)) {
      setAuthMessage(`Sign in to kick before opening kick/${channel}.`);
      return;
    }

    let key = `${selectedPlatform}:${channel}`;
    let liveChatId: string | undefined;
    let youtubeChannelId: string | undefined;
    let youtubeVideoId: string | undefined;

    if (selectedPlatform === "youtube") {
      try {
        const resolved = await window.electronAPI.resolveYouTubeLiveChat(channel);
        key = `${selectedPlatform}:${resolved.channelId}:${resolved.liveChatId}`;
        liveChatId = resolved.liveChatId;
        youtubeChannelId = resolved.channelId;
        youtubeVideoId = resolved.videoId;
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    if (openingSourceKeysRef.current.has(key)) {
      return;
    }

    const existingStandaloneTab = tabs.find((tab) => {
      if (tab.sourceIds.length !== 1) return false;
      const tabSource = sourceById.get(tab.sourceIds[0]);
      if (!tabSource) return false;
      if (tabSource.key === key) return true;
      if (tabSource.platform !== selectedPlatform) return false;
      if (selectedPlatform !== "youtube") {
        return normalizeChannel(tabSource.channel, tabSource.platform) === channel;
      }
      return Boolean(liveChatId && tabSource.liveChatId && tabSource.liveChatId === liveChatId);
    });
    if (existingStandaloneTab) {
      setActiveTabId(existingStandaloneTab.id);
      setChannelInput("");
      return;
    }

    const existingSource = sources.find((source) => source.key === key);
    const existingTab = existingSource
      ? tabs.find((tab) => tab.sourceIds.length === 1 && tab.sourceIds[0] === existingSource.id)
      : undefined;

    if (existingTab) {
      setActiveTabId(existingTab.id);
      setChannelInput("");
      return;
    }

    const source = existingSource ?? {
      id: createId(),
      platform: selectedPlatform,
      channel,
      key,
      liveChatId,
      youtubeChannelId,
      youtubeVideoId
    };

    const tab: ChatTab = {
      id: createId(),
      sourceIds: [source.id]
    };

    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setChannelInput("");
    setAuthMessage("");

    const shouldConnectNow = !adaptersRef.current.has(source.id);
    if (!existingSource) {
      setSources((prev) => [...prev, source]);
    }
    if (!shouldConnectNow) {
      return;
    }

    openingSourceKeysRef.current.add(key);
    setStatusBySource((previous) => ({
      ...previous,
      [source.id]: "connecting"
    }));
    void ensureAdapterConnected(source, settings)
      .catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        setAuthMessage(`Failed to connect ${source.platform}/${source.channel}: ${text}`);
      })
      .finally(() => {
        openingSourceKeysRef.current.delete(key);
      });
  };

  const openOwnChannelTab = async (platform: "twitch" | "kick") => {
    const username = (platform === "twitch" ? settings.twitchUsername : settings.kickUsername) ?? "";
    const normalized = normalizeChannel(username, platform);
    if (!normalized) return;
    setPlatformInput(platform);
    setChannelInput(normalized);
    await addChannelTab({ platform, channel: normalized });
  };

  const closeTab = async (tabId: string) => {
    const remainingTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(remainingTabs);

    if (activeTabId === tabId) {
      setActiveTabId(remainingTabs[0]?.id ?? "");
    }

    const stillUsed = new Set(remainingTabs.flatMap((tab) => tab.sourceIds));
    const orphaned = sources.filter((source) => !stillUsed.has(source.id));
    const orphanedIds = new Set(orphaned.map((source) => source.id));

    setSources((prev) => prev.filter((source) => !orphanedIds.has(source.id)));
    setMessagesBySource((prev) => {
      const next = { ...prev };
      orphaned.forEach((source) => {
        delete next[source.id];
      });
      return next;
    });
    setStatusBySource((prev) => {
      const next = { ...prev };
      orphaned.forEach((source) => {
        delete next[source.id];
      });
      return next;
    });
    setConnectionHealthBySource((prev) => {
      const next = { ...prev };
      orphaned.forEach((source) => {
        delete next[source.id];
      });
      return next;
    });
    orphaned.forEach((source) => {
      delete sourceStatusRef.current[source.id];
    });
    setMentionInbox((previous) => previous.filter((entry) => !orphanedIds.has(entry.sourceId)));

    for (const source of orphaned) {
      suppressedAutoHealSourceIdsRef.current.add(source.id);
      clearAutoHealRetry(source.id, true);
      const adapter = adaptersRef.current.get(source.id);
      if (adapter) {
        try {
          await adapter.disconnect();
        } catch {
          // no-op
        } finally {
          adaptersRef.current.delete(source.id);
        }
      }
      suppressedAutoHealSourceIdsRef.current.delete(source.id);
    }
  };

  const mergeTabs = (fromTabId: string, intoTabId: string) => {
    if (fromTabId === intoTabId) return;
    const from = tabs.find((tab) => tab.id === fromTabId);
    const into = tabs.find((tab) => tab.id === intoTabId);
    if (!from || !into) return;

    const mergedSourceIds = Array.from(new Set([...into.sourceIds, ...from.sourceIds]));
    const nextTabs = tabs
      .map((tab) => {
        if (tab.id === intoTabId) return { ...tab, sourceIds: mergedSourceIds };
        return tab;
      })
      .filter((tab) => tab.id !== fromTabId);

    setTabs(nextTabs);
    if (activeTabId === fromTabId) {
      setActiveTabId(intoTabId);
    }
    setTabMenu(null);
  };

  const splitMergedTab = (tabId: string) => {
    const target = tabs.find((tab) => tab.id === tabId);
    if (!target || target.sourceIds.length <= 1) return;
    const replacementTabs: ChatTab[] = target.sourceIds.map((sourceId) => ({
      id: createId(),
      sourceIds: [sourceId]
    }));
    const nextTabs: ChatTab[] = [];
    for (const tab of tabs) {
      if (tab.id === tabId) {
        nextTabs.push(...replacementTabs);
      } else {
        nextTabs.push(tab);
      }
    }
    setTabs(nextTabs);
    setActiveTabId(replacementTabs[0]?.id ?? "");
    setTabMenu(null);
    setAuthMessage(`Split ${target.sourceIds.length} chats into separate tabs.`);
  };

  const saveLayoutPreset = async (presetId: string) => {
    if (!tabs.length || !sources.length) {
      setAuthMessage("Open at least one tab before saving a layout.");
      return;
    }
    const nextLayouts = {
      ...(settings.savedLayouts ?? {}),
      [presetId]: {
        name: presetId,
        sources: sources.map((source) => ({ ...source })),
        tabs: tabs.map((tab) => ({ id: tab.id, sourceIds: [...tab.sourceIds] })),
        activeTabId
      }
    };
    await persistSettings({ savedLayouts: nextLayouts });
    setAuthMessage(`Saved layout preset: ${presetId}.`);
  };

  const loadLayoutPreset = async (presetId: string) => {
    const layout = settings.savedLayouts?.[presetId];
    if (!layout) {
      setAuthMessage(`No saved layout found for ${presetId}.`);
      return;
    }
    const restoredSources = sanitizeSessionSources(layout.sources);
    const restoredSourceIds = new Set(restoredSources.map((source) => source.id));
    const restoredTabs = sanitizeSessionTabs(layout.tabs, restoredSourceIds);
    if (restoredSources.length === 0 || restoredTabs.length === 0) {
      setAuthMessage(`Saved layout ${presetId} is empty or invalid.`);
      return;
    }
    setSources(restoredSources);
    setTabs(restoredTabs);
    setActiveTabId(restoredTabs.some((tab) => tab.id === layout.activeTabId) ? layout.activeTabId ?? restoredTabs[0].id : restoredTabs[0].id);
    for (const source of restoredSources) {
      if (source.platform === "twitch" && !hasAuthForPlatform("twitch", settings)) continue;
      if (source.platform === "kick" && !hasAuthForPlatform("kick", settings)) continue;
      void ensureAdapterConnected(source, settings);
    }
    setAuthMessage(`Loaded layout preset: ${presetId}.`);
  };

  const applyFilterProfile = async (profile: "clean" | "mod" | "no-filter" | "custom") => {
    setFilterProfile(profile);
    if (profile === "custom") return;
    if (profile === "clean") {
      await persistSettings({
        smartFilterSpam: true,
        smartFilterScam: true,
        hideCommands: true
      });
      setAuthMessage("Applied filter profile: clean.");
      return;
    }
    if (profile === "mod") {
      await persistSettings({
        smartFilterSpam: false,
        smartFilterScam: true,
        hideCommands: false
      });
      setAuthMessage("Applied filter profile: mod.");
      return;
    }
    await persistSettings({
      smartFilterSpam: false,
      smartFilterScam: false,
      hideCommands: false
    });
    setAuthMessage("Applied filter profile: no filter.");
  };

  const exportSessionSnapshot = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      sources: sources.map((source) => ({ ...source })),
      tabs: tabs.map((tab) => ({ id: tab.id, sourceIds: [...tab.sourceIds] })),
      activeTabId,
      settings: {
        tabAlertRules: settings.tabAlertRules ?? {},
        keywordFilters: settings.keywordFilters ?? [],
        highlightKeywords: settings.highlightKeywords ?? [],
        smartFilterSpam: settings.smartFilterSpam !== false,
        smartFilterScam: settings.smartFilterScam !== false,
        hideCommands: settings.hideCommands === true
      }
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `multichat-session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setAuthMessage("Exported session snapshot.");
  };

  const importSessionSnapshot = async (file: File) => {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as {
      sources?: Settings["sessionSources"];
      tabs?: Settings["sessionTabs"];
      activeTabId?: string;
      settings?: Partial<Settings>;
    };
    const restoredSources = sanitizeSessionSources(parsed.sources);
    const restoredSourceIds = new Set(restoredSources.map((source) => source.id));
    const restoredTabs = sanitizeSessionTabs(parsed.tabs, restoredSourceIds);
    if (restoredSources.length === 0 || restoredTabs.length === 0) {
      setAuthMessage("Import failed: invalid snapshot.");
      return;
    }
    setSources(restoredSources);
    setTabs(restoredTabs);
    setActiveTabId(typeof parsed.activeTabId === "string" && restoredTabs.some((tab) => tab.id === parsed.activeTabId) ? parsed.activeTabId : restoredTabs[0].id);
    if (parsed.settings) {
      await persistSettings({
        tabAlertRules: parsed.settings.tabAlertRules ?? settings.tabAlertRules,
        keywordFilters: parsed.settings.keywordFilters ?? settings.keywordFilters,
        highlightKeywords: parsed.settings.highlightKeywords ?? settings.highlightKeywords,
        smartFilterSpam: parsed.settings.smartFilterSpam ?? settings.smartFilterSpam,
        smartFilterScam: parsed.settings.smartFilterScam ?? settings.smartFilterScam,
        hideCommands: parsed.settings.hideCommands ?? settings.hideCommands
      });
    }
    for (const source of restoredSources) {
      if (source.platform === "twitch" && !hasAuthForPlatform("twitch", settings)) continue;
      if (source.platform === "kick" && !hasAuthForPlatform("kick", settings)) continue;
      void ensureAdapterConnected(source, settings);
    }
    setAuthMessage("Imported session snapshot.");
  };

  const refreshActiveTab = async () => {
    if (!activeTab || activeTabSources.length === 0 || refreshingActiveTab) return;
    setRefreshingActiveTab(true);
    setAuthMessage(`Refreshing ${activeTabSources.length} source${activeTabSources.length === 1 ? "" : "s"} in active tab...`);
    try {
      for (const source of activeTabSources) {
        suppressedAutoHealSourceIdsRef.current.add(source.id);
        try {
          clearAutoHealRetry(source.id, true);
          const adapter = adaptersRef.current.get(source.id);
          if (adapter) {
            try {
              await adapter.disconnect();
            } catch {
              // no-op
            } finally {
              adaptersRef.current.delete(source.id);
            }
          }

          sourceStatusRef.current[source.id] = "connecting";
          setStatusBySource((previous) => ({
            ...previous,
            [source.id]: "connecting"
          }));
          setConnectionHealthBySource((previous) => ({
            ...previous,
            [source.id]: {
              lastStatus: "connecting",
              lastStatusAt: Date.now(),
              lastConnectedAt: previous[source.id]?.lastConnectedAt,
              reconnectReason: "Manual tab refresh requested.",
              lastError: undefined
            }
          }));

          await ensureAdapterConnected(source, settings);
        } finally {
          suppressedAutoHealSourceIdsRef.current.delete(source.id);
        }
      }
      setAuthMessage(`Refreshed ${activeTabSources.length} source${activeTabSources.length === 1 ? "" : "s"} in active tab.`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshingActiveTab(false);
    }
  };

  const checkForUpdatesNow = async () => {
    try {
      const status = await window.electronAPI.checkForUpdates();
      setUpdateStatus(status);
      if (status.message) {
        setAuthMessage(status.message);
      } else {
        setAuthMessage("Checking for updates...");
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const refreshAuthHealth = async (forceTest = false) => {
    try {
      setAuthHealthBusy(true);
      const snapshot = forceTest ? await window.electronAPI.testAuthPermissions() : await window.electronAPI.getAuthHealth();
      setAuthHealth(snapshot);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthHealthBusy(false);
    }
  };

  const setUpdateChannelPreference = async (channel: "stable" | "beta") => {
    try {
      const status = await window.electronAPI.setUpdateChannel(channel);
      setUpdateStatus(status);
      setSettings((previous) => ({
        ...previous,
        updateChannel: channel
      }));
      setAuthMessage(`Update channel set to ${channel}.`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const clearMentionInbox = () => {
    setMentionInbox([]);
  };

  const buildMessageJumpKey = (message: ChatMessage) =>
    `${message.platform}|${message.channel}|${message.timestamp}|${normalizeUserKey(message.displayName)}|${message.message.slice(0, 80)}`;
  const buildMentionJumpKey = (entry: MentionInboxEntry) =>
    `${entry.platform}|${entry.channel}|${entry.timestamp}|${normalizeUserKey(entry.displayName)}|${entry.message.slice(0, 80)}`;

  const openMention = (entry: MentionInboxEntry) => {
    const tabId = entry.tabId ?? tabs.find((tab) => tab.sourceIds.includes(entry.sourceId))?.id ?? "";
    if (tabId) {
      setActiveTabId(tabId);
      setPendingMessageJumpKey(buildMentionJumpKey(entry));
      const ts = new Date(entry.timestamp).getTime();
      if (Number.isFinite(ts)) {
        setLastReadAtByTab((previous) => ({
          ...previous,
          [tabId]: Math.max(previous[tabId] ?? 0, ts)
        }));
      }
    }
    setMentionInbox((previous) => previous.filter((item) => item.id !== entry.id));
  };

  const fillComposerCommandForMessage = (action: Exclude<ModeratorAction, "delete">, message: ChatMessage) => {
    const username = message.username.trim().replace(/^@+/, "");
    if (!username) return;
    const command = buildModerationCommand(message.platform as Platform, action, username);
    if (!command) return;
    setComposerText(command);
    const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
    if (source && writableActiveTabSources.some((candidate) => candidate.id === source.id)) {
      setSendTargetId(source.id);
    }
    setMessageMenu(null);
  };

  const openPlatformModMenu = (message: ChatMessage) => {
    const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
    if (!source) return;
    const url =
      source.platform === "twitch"
        ? `https://www.twitch.tv/popout/${encodeURIComponent(source.channel)}/moderator`
        : source.platform === "kick"
          ? `https://kick.com/${encodeURIComponent(source.channel)}/moderator`
          : "";
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    setMessageMenu(null);
  };

  const applyTabAlertProfile = (profile: Exclude<TabAlertProfile, "custom">) => {
    const preset = TAB_ALERT_PROFILES[profile];
    if (!preset) return;
    setTabAlertProfile(profile);
    setTabAlertSound(preset.sound);
    setTabAlertNotify(preset.notify);
    setTabMentionSound(preset.mentionSound);
    setTabMentionNotify(preset.mentionNotify);
  };

  const openUserLogsForMessage = (message: ChatMessage) => {
    if (message.platform !== "twitch" && message.platform !== "kick") {
      setAuthMessage("User logs are only available for Twitch and Kick.");
      return;
    }
    const username = message.username.trim();
    if (!username || normalizeUserKey(username) === "system") {
      setAuthMessage("No user log history is available for this message.");
      return;
    }
    setUserLogTarget({
      platform: message.platform,
      username,
      displayName: message.displayName || username
    });
    setMessageMenu(null);
  };

  const runModeratorAction = async (action: ModeratorAction, message: ChatMessage) => {
    if (activeTabIsMerged || !activeSingleSource) {
      setAuthMessage("Moderator actions are available only in an active single-channel tab.");
      return;
    }
    const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
    if (!source) {
      setAuthMessage("Cannot map this message to a connected chat source.");
      return;
    }
    if (!activeSingleSource || source.id !== activeSingleSource.id) {
      setAuthMessage("Moderator actions are limited to the active single-channel tab.");
      return;
    }
    if (source.platform === "youtube" || source.platform === "tiktok") {
      const platformLabel = source.platform === "youtube" ? "YouTube" : "TikTok";
      setAuthMessage(`${platformLabel} moderation actions are not supported in this build.`);
      return;
    }
    if (!canModerateSource(source)) {
      setAuthMessage("You are not a moderator for this channel.");
      return;
    }

    const username = message.username.trim();
    const messageId = action === "delete" ? getRawMessageId(message) : null;
    if (action === "delete") {
      if (!messageId) {
        setAuthMessage("Delete message is not available for this chat event.");
        return;
      }
    } else if (!username || username === "system") {
      setAuthMessage("This message cannot be moderated.");
      return;
    }

    const appendModeratorAuditMessage = (ok: boolean, detail: string) => {
      const systemMessage: ChatMessage = {
        id: `system-${source.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        platform: source.platform,
        channel: source.channel,
        username: "system",
        displayName: "System",
        message: `[MOD ${ok ? "OK" : "FAIL"}] ${detail}`,
        timestamp: new Date().toISOString(),
        color: ok ? "#70d6a8" : "#f08a65"
      };
      setMessagesBySource((prev) => {
        const updated = [...(prev[source.id] ?? []), systemMessage].slice(-800);
        return { ...prev, [source.id]: updated };
      });
      broadcast.postMessage(systemMessage);
    };

    try {
      await window.electronAPI.moderateChat({
        platform: source.platform,
        channel: source.channel,
        action,
        username: username || undefined,
        messageId: messageId ?? undefined,
        targetUserId: source.platform === "kick" ? (getKickRawUserId(message) ?? undefined) : undefined
      });
      setModerationHistory((previous) => [
        {
          id: createId(),
          at: Date.now(),
          action,
          target: message.displayName || username,
          source: `${source.platform}/${source.channel}`,
          ok: true
        },
        ...previous
      ].slice(0, 120));
      setMessageMenu(null);
      appendModeratorAuditMessage(
        true,
        `${action} · ${message.displayName || username} · ${source.platform}/${source.channel}`
      );
      setAuthMessage(`Moderator action sent in ${source.platform}/${source.channel}.`);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      setModerationHistory((previous) => [
        {
          id: createId(),
          at: Date.now(),
          action,
          target: message.displayName || username,
          source: `${source.platform}/${source.channel}`,
          ok: false
        },
        ...previous
      ].slice(0, 120));
      appendModeratorAuditMessage(
        false,
        `${action} · ${message.displayName || username} · ${source.platform}/${source.channel} · ${errorText}`
      );
      setAuthMessage(errorText);
    }
  };

  const sendActiveMessage = async () => {
    const content = composerText.trim();
    if (!content || !activeTab) return;

    const activeSourceIds = writableActiveTabSources.map((source) => source.id);
    const targetSourceIds =
      sendTargetId === SEND_TARGET_TAB_ALL
        ? activeSourceIds
        : activeSourceIds.includes(sendTargetId)
          ? [sendTargetId]
          : activeSourceIds.length === 1
            ? [activeSourceIds[0]]
            : [];

    if (targetSourceIds.length === 0) {
      setAuthMessage("No chat targets are available.");
      return;
    }

    const sendAllRequested = sendTargetId === SEND_TARGET_TAB_ALL && targetSourceIds.length > 1;
    if (sendAllRequested && activeTabSendRule?.blockSendAll) {
      setAuthMessage("Send-to-all is blocked for this tab by your send rule.");
      return;
    }
    const requireConfirmOnAll = activeTabSendRule?.confirmOnSendAll ?? (settings.confirmSendAll !== false);
    if (
      sendAllRequested &&
      requireConfirmOnAll &&
      !window.confirm(
        `Send this message to ${targetSourceIds.length} chats?\n\n${targetSourceIds
          .map((id) => {
            const source = sourceById.get(id);
            return source ? `- ${source.platform}/${source.channel}` : `- ${id}`;
          })
          .join("\n")}`
      )
    ) {
      return;
    }

    setSending(true);
    setAuthMessage("");
    try {
      const results = await Promise.all(
        targetSourceIds.map(async (sourceId) => {
          const source = sourceById.get(sourceId);
          const label = source ? `${source.platform}/${source.channel}` : sourceId;
          const adapter = adaptersRef.current.get(sourceId);
          if (!adapter) {
            return {
              ok: false as const,
              label,
              error: "chat connection is not ready"
            };
          }
          try {
            await adapter.sendMessage(content);
            return { ok: true as const, label };
          } catch (error) {
            return {
              ok: false as const,
              label,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        })
      );

      let sentCount = 0;
      const failed: Array<{ label: string; error: string }> = [];
      for (const result of results) {
        if (result.ok) {
          sentCount += 1;
        } else {
          failed.push({ label: result.label, error: result.error });
        }
      }

      if (sentCount > 0) {
        setComposerText("");
        if (!setupMessageReady) {
          setSetupTestMessageSent(true);
          void persistSettings({ setupWizardSendTestCompleted: true }).catch(() => {
            // no-op
          });
        }
      }

      if (failed.length === 0) {
        if (targetSourceIds.length > 1) {
          setAuthMessage(`Sent to ${sentCount} chats.`);
        }
        return;
      }

      const failureSummary = failed
        .slice(0, 3)
        .map((entry) => `${entry.label}: ${entry.error}`)
        .join(" | ");
      const extraFailures = failed.length > 3 ? ` (+${failed.length - 3} more)` : "";
      if (sentCount > 0) {
        setAuthMessage(`Sent to ${sentCount}/${targetSourceIds.length}. Failed: ${failureSummary}${extraFailures}`);
      } else {
        setAuthMessage(`Send failed: ${failureSummary}${extraFailures}`);
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const sendDeckMessage = async (tab: ChatTab) => {
    const content = (deckComposerByTabId[tab.id] ?? "").trim();
    if (!content) return;
    const deckSources = tab.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter(Boolean) as ChatSource[];
    const writableSources = deckSources.filter((source) =>
      source.platform === "twitch" ? Boolean(settings.twitchToken) : source.platform === "kick" ? Boolean(settings.kickAccessToken) : false
    );
    if (writableSources.length === 0) {
      setAuthMessage("This deck is read-only.");
      return;
    }
    const results = await Promise.all(
      writableSources.map(async (source) => {
        const adapter = adaptersRef.current.get(source.id);
        if (!adapter) return false;
        try {
          await adapter.sendMessage(content);
          return true;
        } catch {
          return false;
        }
      })
    );
    const success = results.filter(Boolean).length;
    if (success > 0) {
      setDeckComposerByTabId((previous) => ({ ...previous, [tab.id]: "" }));
    }
    if (success !== writableSources.length) {
      setAuthMessage(`Sent to ${success}/${writableSources.length} chats in this deck.`);
    }
  };

  const runQuickMod = async (action: Exclude<ModeratorAction, "delete">) => {
    if (activeTabIsMerged || !activeSingleSource) {
      setAuthMessage("Quick mod is available only in an active single-channel tab.");
      return;
    }
    const username = quickModUser.trim().replace(/^@+/, "");
    if (!username) {
      setAuthMessage("Enter a username for quick moderation.");
      return;
    }
    const targetIds =
      sendTargetId === SEND_TARGET_TAB_ALL
        ? writableActiveTabSources.map((source) => source.id)
        : writableActiveTabSources.some((source) => source.id === sendTargetId)
          ? [sendTargetId]
          : writableActiveTabSources.slice(0, 1).map((source) => source.id);
    if (targetIds.length === 0) {
      setAuthMessage("No writable chat target for moderation.");
      return;
    }

    const results = await Promise.all(
      targetIds.map(async (sourceId) => {
        const source = sourceById.get(sourceId);
        const label = source ? `${source.platform}/${source.channel}` : sourceId;
        if (!source) {
          return { ok: false as const, label, error: "source not found", sourceId };
        }
        if (source.platform !== "twitch" && source.platform !== "kick") {
          return { ok: false as const, label, error: "platform is not supported for moderation", sourceId };
        }
        try {
          let targetUserId: number | undefined;
          if (source.platform === "kick") {
            const matchingMessage = [...(messagesBySource[source.id] ?? [])]
              .reverse()
              .find((entry) => normalizeUserKey(entry.username) === normalizeUserKey(username));
            targetUserId = matchingMessage ? (getKickRawUserId(matchingMessage) ?? undefined) : undefined;
            if (!targetUserId) {
              return {
                ok: false as const,
                label,
                error: "Kick quick mod needs a recent message from this user in the active tab.",
                sourceId
              };
            }
          }
          await window.electronAPI.moderateChat({
            platform: source.platform,
            channel: source.channel,
            action,
            username,
            targetUserId
          });
          return { ok: true as const, label, sourceId };
        } catch (error) {
          return {
            ok: false as const,
            label,
            error: error instanceof Error ? error.message : String(error),
            sourceId
          };
        }
      })
    );
    const ok = results.filter((result) => result.ok).length;
    const failed = results.filter((result) => !result.ok).map((result) => ({
      label: result.label,
      error: result.error
    }));

    for (const result of results) {
      const source = sourceById.get(result.sourceId);
      if (!source) continue;
      const auditMessage: ChatMessage = {
        id: `system-${source.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        platform: source.platform,
        channel: source.channel,
        username: "system",
        displayName: "System",
        message: result.ok
          ? `[MOD OK] ${action} · ${username} · ${source.platform}/${source.channel}`
          : `[MOD FAIL] ${action} · ${username} · ${source.platform}/${source.channel} · ${result.error}`,
        timestamp: new Date().toISOString(),
        color: result.ok ? "#70d6a8" : "#f08a65"
      };
      setMessagesBySource((previous) => ({
        ...previous,
        [source.id]: [...(previous[source.id] ?? []), auditMessage].slice(-800)
      }));
      broadcast.postMessage(auditMessage);
    }

    setModerationHistory((previous) => [
      {
        id: createId(),
        at: Date.now(),
        action,
        target: username,
        source: targetIds
          .map((sourceId) => {
            const source = sourceById.get(sourceId);
            return source ? `${source.platform}/${source.channel}` : sourceId;
          })
          .join(", "),
        ok: ok > 0
      },
      ...previous
    ].slice(0, 120));
    if (failed.length === 0) {
      setAuthMessage(`Quick mod sent to ${ok}/${targetIds.length} chats.`);
      return;
    }
    const failureSummary = failed
      .slice(0, 2)
      .map((entry) => `${entry.label}: ${entry.error}`)
      .join(" | ");
    const extraFailures = failed.length > 2 ? ` (+${failed.length - 2} more)` : "";
    if (ok > 0) {
      setAuthMessage(`Quick mod sent to ${ok}/${targetIds.length}. Failed: ${failureSummary}${extraFailures}`);
      return;
    }
    setAuthMessage(`Quick mod failed: ${failureSummary}${extraFailures}`);
  };

  const jumpToNewest = () => {
    setNewestLocked(true);
    setLockCutoffTimestamp(null);
    if (activeTabId && delayedReplayMessages.length > 0) {
      const latestTs = messageTimestamp(delayedReplayMessages[delayedReplayMessages.length - 1]);
      if (latestTs > 0) {
        setLastReadAtByTab((previous) => ({
          ...previous,
          [activeTabId]: latestTs
        }));
      }
    }
    const list = messageListRef.current;
    if (!list) return;
    window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  };

  const jumpToFirstUnread = () => {
    if (!firstUnreadTimestamp) return;
    const list = messageListRef.current;
    if (!list) return;
    const marker = list.querySelector("[data-unread-marker='1']") as HTMLElement | null;
    if (marker) {
      marker.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const openOwnChannelTabAfterSignIn = async (platform: Platform, usernameRaw: string, currentSettings: Settings) => {
    const username = normalizeChannel(usernameRaw, platform);
    if (!username) return;

    const existingSource = sourceByPlatformChannel.get(`${platform}:${username}`);
    if (existingSource) {
      const existingTab = tabs.find((tab) => tab.sourceIds.includes(existingSource.id));
      if (existingTab) {
        setActiveTabId(existingTab.id);
      }
      try {
        await ensureAdapterConnected(existingSource, currentSettings);
      } catch {
        // no-op
      }
      return;
    }

    await addSource({
      platform,
      channel: username
    });
  };

  const signInTwitch = async () => {
    setAuthBusy("twitch");
    setAuthMessage("");
    try {
      const next = await window.electronAPI.signInTwitch();
      const mergedSettings = { ...defaultSettings, ...next };
      setSettings(mergedSettings);
      const mode = next.twitchGuest ? "guest mode" : "oauth";
      setAuthMessage(`Signed in to Twitch as ${next.twitchUsername ?? "unknown user"} (${mode}).`);
      if (next.twitchUsername) {
        await openOwnChannelTabAfterSignIn("twitch", next.twitchUsername, mergedSettings);
      }
      void refreshAuthHealth(false);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(null);
    }
  };

  const signInKick = async () => {
    setAuthBusy("kick");
    setAuthMessage("");
    try {
      const next = await window.electronAPI.signInKick();
      const mergedSettings = { ...defaultSettings, ...next };
      setSettings(mergedSettings);
      const mode = next.kickGuest ? "guest mode" : "oauth";
      setAuthMessage(`Signed in to Kick as ${next.kickUsername ?? "unknown user"} (${mode}).`);
      if (next.kickUsername) {
        await openOwnChannelTabAfterSignIn("kick", next.kickUsername, mergedSettings);
      }
      void refreshAuthHealth(false);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(null);
    }
  };

  const signOutTwitch = async () => {
    const next = await window.electronAPI.signOutTwitch();
    setSettings({ ...defaultSettings, ...next });
    void refreshAuthHealth(false);
  };

  const signOutKick = async () => {
    const next = await window.electronAPI.signOutKick();
    setSettings({ ...defaultSettings, ...next });
    void refreshAuthHealth(false);
  };

  const enterReadOnlyGuide = async () => {
    if (readOnlyPlatforms.length === 0) {
      setAuthMessage("YouTube/TikTok read-only is not available in this build.");
      return;
    }

    const restrictedSources = sources.filter((source) => source.platform === "twitch" || source.platform === "kick");
    const restrictedSourceIds = new Set(restrictedSources.map((source) => source.id));

    if (restrictedSourceIds.size > 0) {
      const nextSources = sources.filter((source) => !restrictedSourceIds.has(source.id));
      const nextTabs = tabs
        .map((tab) => ({
          ...tab,
          sourceIds: tab.sourceIds.filter((sourceId) => !restrictedSourceIds.has(sourceId))
        }))
        .filter((tab) => tab.sourceIds.length > 0);
      const nextActiveTabId = nextTabs.some((tab) => tab.id === activeTabId) ? activeTabId : (nextTabs[0]?.id ?? "");

      setSources(nextSources);
      setTabs(nextTabs);
      setActiveTabId(nextActiveTabId);
      setMessagesBySource((previous) => {
        const next = { ...previous };
        for (const sourceId of restrictedSourceIds) {
          delete next[sourceId];
        }
        return next;
      });
      setStatusBySource((previous) => {
        const next = { ...previous };
        for (const sourceId of restrictedSourceIds) {
          delete next[sourceId];
        }
        return next;
      });

      for (const source of restrictedSources) {
        const adapter = adaptersRef.current.get(source.id);
        if (!adapter) continue;
        try {
          await adapter.disconnect();
        } catch {
          // no-op
        } finally {
          adaptersRef.current.delete(source.id);
        }
      }
    }

    setReadOnlyGuideMode(true);
    setPlatformInput(readOnlyPlatforms[0] ?? "youtube");
    setAuthMessage("Read-only guide enabled: YouTube/TikTok chats only.");
  };

  useEffect(() => {
    if (hasPrimaryAuth && readOnlyGuideMode) {
      setReadOnlyGuideMode(false);
    }
  }, [hasPrimaryAuth, readOnlyGuideMode]);

  useEffect(() => {
    if (!sessionHydrated) return;
    if (setupWizardDismissed) return;
    if (!hasPrimaryAuth) return;
    if (setupWizardVersion >= SETUP_WIZARD_VERSION && settings.setupWizardCompleted) return;
    if (settings.setupWizardCompleted && tabs.length > 0) return;
    setSetupWizardOpen(true);
  }, [hasPrimaryAuth, sessionHydrated, settings.setupWizardCompleted, setupWizardDismissed, setupWizardVersion, tabs.length]);

  const completeSetupWizard = async () => {
    try {
      await persistSettings({
        setupWizardCompleted: true,
        setupWizardVersion: SETUP_WIZARD_VERSION,
        setupWizardSendTestCompleted: true
      });
      setSetupTestMessageSent(true);
      setSetupWizardDismissed(false);
      setSetupWizardOpen(false);
      setSetupWizardStep(0);
      setQuickTourOpen(true);
      setAuthMessage("Setup complete. Quick tour opened.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const skipSetupWizard = async () => {
    try {
      await persistSettings({
        setupWizardCompleted: true,
        setupWizardVersion: SETUP_WIZARD_VERSION
      });
      setSetupWizardDismissed(false);
      setSetupWizardOpen(false);
      setSetupWizardStep(0);
      setAuthMessage("Setup wizard dismissed. You can reopen the quick tour from Menu.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (!sessionHydrated || sources.length === 0) return;
    for (const source of sources) {
      if (source.platform === "twitch" && !hasAuthForPlatform("twitch", settings)) continue;
      if (source.platform === "kick" && !hasAuthForPlatform("kick", settings)) continue;
      void ensureAdapterConnected(source, settings);
    }
  }, [sessionHydrated, sources, settings]);

  useEffect(() => {
    if (availablePlatforms.includes(platformInput)) return;
    setPlatformInput(availablePlatforms[0] ?? "kick");
  }, [availablePlatforms, platformInput]);

  useEffect(() => {
    if (!activeTabId) return;
    const rule = settings.tabAlertRules?.[activeTabId];
    setTabAlertKeywordInput((rule?.keyword ?? "").trim());
    setTabAlertSound(rule?.sound !== false);
    setTabAlertNotify(rule?.notify !== false);
    setTabMentionSound(rule?.mentionSound !== false);
    setTabMentionNotify(rule?.mentionNotify !== false);
    setTabAlertProfile("custom");
  }, [activeTabId, settings.tabAlertRules]);

  useEffect(() => {
    if (!pendingMessageJumpKey) return;
    const list = messageListRef.current;
    if (!list) return;
    const targets = Array.from(list.querySelectorAll<HTMLElement>("[data-jump-key]"));
    const target = targets.find((item) => item.dataset.jumpKey === pendingMessageJumpKey);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("highlight");
    window.setTimeout(() => target.classList.remove("highlight"), 1400);
    setPendingMessageJumpKey(null);
  }, [pendingMessageJumpKey, renderedMessages]);

  useEffect(() => {
    if (!activeTabId) {
      setTabGroupDraft("");
      return;
    }
    setTabGroupDraft((settings.tabGroups ?? {})[activeTabId] ?? "");
  }, [activeTabId, settings.tabGroups]);

  const persistSettings = async (updates: Partial<Settings>) => {
    const next = await window.electronAPI.setSettings(updates as Settings);
    setSettings({ ...defaultSettings, ...next });
  };

  const applyWorkspacePreset = async (preset: WorkspacePreset) => {
    if (preset === "streamer") {
      await persistSettings({
        workspacePreset: preset,
        uiMode: "simple",
        dockedPanels: { mentions: false, modHistory: false, userCard: false, globalTimeline: false },
        globalSearchMode: false,
        collaborationMode: false
      });
      setAuthMessage("Workspace preset applied: Streamer.");
      return;
    }
    if (preset === "moddesk") {
      await persistSettings({
        workspacePreset: preset,
        uiMode: "advanced",
        dockedPanels: { mentions: true, modHistory: true, userCard: true, globalTimeline: true },
        globalSearchMode: true,
        collaborationMode: true
      });
      setAuthMessage("Workspace preset applied: Mod Desk.");
      return;
    }
    await persistSettings({
      workspacePreset: preset,
      uiMode: "simple",
      dockedPanels: { mentions: true, modHistory: false, userCard: false, globalTimeline: false },
      globalSearchMode: false,
      collaborationMode: false
    });
    setAuthMessage("Workspace preset applied: Viewer.");
  };

  const toggleActiveTabMentionMute = async () => {
    if (!activeTabId) return;
    const current = new Set(settings.mentionMutedTabIds ?? []);
    if (current.has(activeTabId)) {
      current.delete(activeTabId);
      await persistSettings({ mentionMutedTabIds: Array.from(current) });
      setAuthMessage("Mentions unmuted for this tab.");
      return;
    }
    current.add(activeTabId);
    await persistSettings({ mentionMutedTabIds: Array.from(current) });
    setAuthMessage("Mentions muted for this tab.");
  };

  const snoozeActiveTabMentions = async (minutes: number) => {
    if (!activeTabId || minutes <= 0) return;
    const until = Date.now() + minutes * 60_000;
    await persistSettings({
      mentionSnoozeUntilByTab: {
        ...(settings.mentionSnoozeUntilByTab ?? {}),
        [activeTabId]: until
      }
    });
    setAuthMessage(`Mentions snoozed for ${minutes} minutes on this tab.`);
  };

  const clearActiveTabMentionSnooze = async () => {
    if (!activeTabId) return;
    const next = { ...(settings.mentionSnoozeUntilByTab ?? {}) };
    if (!(activeTabId in next)) return;
    delete next[activeTabId];
    await persistSettings({ mentionSnoozeUntilByTab: next });
    setAuthMessage("Mention snooze cleared for this tab.");
  };

  const saveCurrentTabSendRule = async () => {
    if (!activeTabId) return;
    const nextRules = {
      ...(settings.tabSendRules ?? {}),
      [activeTabId]: {
        defaultTarget: tabSendDefaultTarget,
        sourceId: tabSendDefaultTarget === "specific" ? tabSendSpecificSourceId : "",
        confirmOnSendAll: tabSendConfirmOnAll,
        blockSendAll: tabSendBlockAll
      }
    };
    await persistSettings({
      tabSendRules: nextRules
    });
    setAuthMessage("Per-tab send rule saved.");
  };

  const clearCurrentTabSendRule = async () => {
    if (!activeTabId) return;
    const nextRules = { ...(settings.tabSendRules ?? {}) };
    if (!(activeTabId in nextRules)) return;
    delete nextRules[activeTabId];
    await persistSettings({ tabSendRules: nextRules });
    setAuthMessage("Per-tab send rule cleared.");
  };

  const pinMessageForActiveTab = async (message: ChatMessage) => {
    if (!activeTabId) return;
    const nextPinned = {
      ...(settings.pinnedMessageByTabId ?? {}),
      [activeTabId]: {
        platform: message.platform,
        channel: message.channel,
        displayName: message.displayName,
        message: message.message,
        timestamp: message.timestamp
      }
    };
    await persistSettings({ pinnedMessageByTabId: nextPinned });
    setMessageMenu(null);
    setAuthMessage(`Pinned message in ${message.platform}/${message.channel}.`);
  };

  const clearPinnedMessageForActiveTab = async () => {
    if (!activeTabId) return;
    const nextPinned = { ...(settings.pinnedMessageByTabId ?? {}) };
    if (!(activeTabId in nextPinned)) return;
    delete nextPinned[activeTabId];
    await persistSettings({ pinnedMessageByTabId: nextPinned });
    setAuthMessage("Pinned message cleared.");
  };

  const createPollInActiveTab = async () => {
    if (!activeTabId) return;
    const question = pollQuestionDraft.trim();
    const optionLabels = Array.from(
      new Set(
        pollOptionsDraft
          .split(/[\n,|]+/)
          .map((part) => part.trim())
          .filter(Boolean)
      )
    ).slice(0, 6);

    if (!question || optionLabels.length < 2) {
      setAuthMessage("Poll needs a question and at least 2 options.");
      return;
    }

    const nextPoll: LocalTabPoll = {
      id: createId(),
      question,
      options: optionLabels.map((label) => ({ id: createId(), label, votes: 0 })),
      active: true,
      createdAt: new Date().toISOString()
    };
    await persistSettings({
      localPollByTabId: {
        ...(settings.localPollByTabId ?? {}),
        [activeTabId]: nextPoll
      }
    });
    setPollQuestionDraft("");
    setPollOptionsDraft("");
    setPollComposerOpen(false);
    setAuthMessage("Poll started for this tab.");
  };

  const voteInActivePoll = async (optionId: string) => {
    if (!activeTabId) return;
    const poll = settings.localPollByTabId?.[activeTabId];
    if (!poll || !poll.active) return;
    const nextPoll: LocalTabPoll = {
      ...poll,
      options: poll.options.map((option) =>
        option.id === optionId ? { ...option, votes: option.votes + 1 } : option
      )
    };
    await persistSettings({
      localPollByTabId: {
        ...(settings.localPollByTabId ?? {}),
        [activeTabId]: nextPoll
      }
    });
  };

  const closeActivePoll = async () => {
    if (!activeTabId) return;
    const poll = settings.localPollByTabId?.[activeTabId];
    if (!poll) return;
    await persistSettings({
      localPollByTabId: {
        ...(settings.localPollByTabId ?? {}),
        [activeTabId]: {
          ...poll,
          active: false
        }
      }
    });
    setAuthMessage("Poll closed.");
  };

  const clearActivePoll = async () => {
    if (!activeTabId) return;
    const next = { ...(settings.localPollByTabId ?? {}) };
    if (!(activeTabId in next)) return;
    delete next[activeTabId];
    await persistSettings({ localPollByTabId: next });
    setAuthMessage("Poll removed.");
  };

  useEffect(() => {
    if (!activeTabId) {
      setTabSendDefaultTarget("all");
      setTabSendSpecificSourceId("");
      setTabSendConfirmOnAll(true);
      setTabSendBlockAll(false);
      return;
    }
    const rule = settings.tabSendRules?.[activeTabId];
    setTabSendDefaultTarget(rule?.defaultTarget === "first" || rule?.defaultTarget === "specific" ? rule.defaultTarget : "all");
    setTabSendSpecificSourceId(rule?.sourceId ?? "");
    setTabSendConfirmOnAll(rule?.confirmOnSendAll ?? (settings.confirmSendAll !== false));
    setTabSendBlockAll(rule?.blockSendAll === true);
  }, [activeTabId, settings.confirmSendAll, settings.tabSendRules]);

  useEffect(() => {
    if (!sessionHydrated) return;
    const now = Date.now();
    const validTabIds = new Set(tabs.map((tab) => tab.id));
    const current = settings.mentionSnoozeUntilByTab ?? {};
    const next: Record<string, number> = {};
    for (const [tabId, until] of Object.entries(current)) {
      const numeric = Number(until);
      if (!Number.isFinite(numeric) || numeric <= now) continue;
      if (!validTabIds.has(tabId)) continue;
      next[tabId] = numeric;
    }
    const currentKeys = Object.keys(current).sort().join("|");
    const nextKeys = Object.keys(next).sort().join("|");
    if (currentKeys === nextKeys) return;
    void persistSettings({ mentionSnoozeUntilByTab: next }).catch(() => {
      // no-op
    });
  }, [sessionHydrated, settings.mentionSnoozeUntilByTab, tabs]);

  const saveCurrentTabAlertRule = async () => {
    if (!activeTabId) return;
    const nextRules = {
      ...(settings.tabAlertRules ?? {}),
      [activeTabId]: {
        keyword: tabAlertKeywordInput.trim(),
        sound: tabAlertSound,
        notify: tabAlertNotify,
        mentionSound: tabMentionSound,
        mentionNotify: tabMentionNotify
      }
    };
    await persistSettings({ tabAlertRules: nextRules });
    setAuthMessage("Tab alert rule saved.");
  };

  const setDockedPanel = async (panel: keyof NonNullable<Settings["dockedPanels"]>, enabled: boolean) => {
    const nextPanels = {
      ...(settings.dockedPanels ?? {}),
      [panel]: enabled
    };
    await persistSettings({ dockedPanels: nextPanels });
  };

  const assignActiveTabGroup = async () => {
    if (!activeTabId) return;
    const group = tabGroupDraft.trim();
    const nextGroups = { ...(settings.tabGroups ?? {}) };
    if (!group) {
      delete nextGroups[activeTabId];
    } else {
      nextGroups[activeTabId] = group;
    }
    await persistSettings({ tabGroups: nextGroups });
    setAuthMessage(group ? `Assigned active tab to group "${group}".` : "Removed active tab from group.");
  };

  const toggleGroupMute = async (group: string) => {
    if (!group) return;
    const current = new Set(settings.mutedGroups ?? []);
    if (current.has(group)) {
      current.delete(group);
    } else {
      current.add(group);
    }
    await persistSettings({ mutedGroups: Array.from(current) });
  };

  const uniqueGroups = useMemo(() => {
    return Array.from(
      new Set(
        Object.values(settings.tabGroups ?? {})
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [settings.tabGroups]);

  const openGlobalSearchResult = (message: ChatMessage) => {
    const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
    if (!source) return;
    const tabId = tabs.find((tab) => tab.sourceIds.includes(source.id))?.id;
    if (tabId) {
      setActiveTabId(tabId);
    }
    setSearch(message.message);
  };

  const saveCurrentAccountProfile = async () => {
    const name = newAccountProfileName.trim();
    if (!name) {
      setAuthMessage("Name the account profile first.");
      return;
    }
    const profile = {
      id: createId(),
      name,
      twitchToken: settings.twitchToken,
      twitchUsername: settings.twitchUsername,
      kickAccessToken: settings.kickAccessToken,
      kickRefreshToken: settings.kickRefreshToken,
      kickUsername: settings.kickUsername
    };
    const nextProfiles = [...(settings.accountProfiles ?? []), profile].slice(-12);
    await persistSettings({ accountProfiles: nextProfiles });
    setNewAccountProfileName("");
    setAuthMessage(`Saved account profile: ${name}.`);
  };

  const switchAccountProfile = async (profileId: string) => {
    const profile = (settings.accountProfiles ?? []).find((entry) => entry.id === profileId);
    if (!profile) return;
    await persistSettings({
      twitchToken: profile.twitchToken ?? "",
      twitchUsername: profile.twitchUsername ?? "",
      kickAccessToken: profile.kickAccessToken ?? "",
      kickRefreshToken: profile.kickRefreshToken ?? "",
      kickUsername: profile.kickUsername ?? ""
    });
    for (const adapter of adaptersRef.current.values()) {
      try {
        await adapter.disconnect();
      } catch {
        // no-op
      }
    }
    adaptersRef.current.clear();
    for (const source of sources) {
      if (source.platform === "twitch" && !profile.twitchToken) continue;
      if (source.platform === "kick" && !profile.kickAccessToken) continue;
      void ensureAdapterConnected(source, {
        ...settings,
        twitchToken: profile.twitchToken ?? "",
        twitchUsername: profile.twitchUsername ?? "",
        kickAccessToken: profile.kickAccessToken ?? "",
        kickRefreshToken: profile.kickRefreshToken ?? "",
        kickUsername: profile.kickUsername ?? ""
      });
    }
    setAuthMessage(`Switched to account profile: ${profile.name}.`);
  };

  useEffect(() => {
    if (!activeTab || writableActiveTabSources.length === 0) {
      setSendTargetId(SEND_TARGET_TAB_ALL);
      return;
    }

    const validSourceIds = writableActiveTabSources.map((source) => source.id);
    const defaultTargetFromRule = (() => {
      if (validSourceIds.length === 1) {
        return validSourceIds[0];
      }
      if (activeTabSendRule?.defaultTarget === "specific" && activeTabSendRule.sourceId && validSourceIds.includes(activeTabSendRule.sourceId)) {
        return activeTabSendRule.sourceId;
      }
      if (activeTabSendRule?.defaultTarget === "first") {
        return validSourceIds[0];
      }
      if (activeTabSendRule?.defaultTarget === "all" && !activeTabSendRule.blockSendAll) {
        return SEND_TARGET_TAB_ALL;
      }
      return validSourceIds[0];
    })();

    setSendTargetId((previous) => {
      if (previous === SEND_TARGET_TAB_ALL && activeTabSendRule?.blockSendAll) {
        return defaultTargetFromRule;
      }
      if (previous === SEND_TARGET_TAB_ALL) {
        return validSourceIds.length > 1 && !activeTabSendRule?.blockSendAll ? SEND_TARGET_TAB_ALL : validSourceIds[0];
      }
      return validSourceIds.includes(previous) ? previous : defaultTargetFromRule;
    });
  }, [activeTab, activeTabSendRule, writableActiveTabSources]);

  useEffect(() => {
    setNewestLocked(true);
    setLockCutoffTimestamp(null);
    if (!activeTabId) return;
    setLastReadAtByTab((previous) => {
      if (previous[activeTabId]) return previous;
      const latest = delayedReplayMessages[delayedReplayMessages.length - 1];
      const latestTs = latest ? messageTimestamp(latest) : Date.now();
      return {
        ...previous,
        [activeTabId]: latestTs
      };
    });
  }, [activeTabId]);

  useEffect(() => {
    if (!activeSingleSource || activeSingleSource.platform !== "twitch") return;
    const username = normalizeUserKey(settings.twitchUsername ?? "");
    if (!username) return;
    const sourceId = activeSingleSource.id;
    if (normalizeUserKey(activeSingleSource.channel) === username) {
      setModeratorBySource((previous) => ({
        ...previous,
        [sourceId]: true
      }));
      return;
    }
    let cancelled = false;
    void checkTwitchModeratorStatus(activeSingleSource.channel, username).then((isModerator) => {
      if (cancelled || isModerator === null) return;
      setModeratorBySource((previous) => ({
        ...previous,
        [sourceId]: isModerator
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeSingleSource, settings.twitchUsername]);

  useEffect(() => {
    return window.electronAPI.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (!status.message || status.state === "idle") return;
      setAuthMessage(status.message);
    });
  }, []);

  useEffect(() => {
    let active = true;
    void window.electronAPI
      .getUpdateStatus()
      .then((status) => {
        if (!active) return;
        setUpdateStatus(status);
      })
      .catch(() => {
        // no-op
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    void refreshAuthHealth(false);
  }, [sessionHydrated, settings.kickAccessToken, settings.kickUsername, settings.twitchToken, settings.twitchUsername]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {
        // no-op
      });
    }
  }, []);

  useEffect(() => {
    if (!streamSafeMode) return;
    setMessageMenu(null);
    setTabMenu(null);
    setUserLogTarget(null);
    setIdentityTarget(null);
    setQuickTourOpen(false);
  }, [streamSafeMode]);

  if (loading) {
    return (
      <>
        <div className="login-gate">
          <div className="login-card">
            <h1>MultiChat</h1>
            <p>Loading your local profile...</p>
          </div>
        </div>
        {updateLockActive ? (
          <div className="update-lock-screen">
            <div className="update-lock-card">
              <div className="update-lock-spinner" aria-hidden="true" />
              <h2>{updateLockTitle}</h2>
              <p>{updateLockMessage}</p>
              <p>Please keep the app open. Controls are temporarily disabled.</p>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (!hasPrimaryAuth && !readOnlyGuideMode) {
    return (
      <>
        <div className="login-gate">
          <div className="login-card">
            <h1>MultiChat</h1>
            <p>Sign in to Twitch or Kick to unlock full app features.</p>
            <div className="login-buttons">
              <button type="button" onClick={() => void signInTwitch()} disabled={authBusy !== null}>
                {authBusy === "twitch" ? "Signing in Twitch..." : "Sign in Twitch"}
              </button>
              <button type="button" onClick={() => void signInKick()} disabled={authBusy !== null}>
                {authBusy === "kick" ? "Signing in Kick..." : "Sign in Kick"}
              </button>
            </div>
            {readOnlyPlatforms.length > 0 ? (
              <div className="login-buttons">
                <button type="button" onClick={() => void enterReadOnlyGuide()} disabled={authBusy !== null}>
                  Continue with YouTube/TikTok guide
                </button>
              </div>
            ) : null}
            {authMessage ? <p className="login-message">{authMessage}</p> : null}
          </div>
        </div>
        {updateLockActive ? (
          <div className="update-lock-screen">
            <div className="update-lock-card">
              <div className="update-lock-spinner" aria-hidden="true" />
              <h2>{updateLockTitle}</h2>
              <p>{updateLockMessage}</p>
              <p>Please keep the app open. Controls are temporarily disabled.</p>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  const messageMenuSource = messageMenu
    ? sourceByPlatformChannel.get(`${messageMenu.message.platform}:${messageMenu.message.channel}`) ?? null
    : null;
  const canShowModerationMenu = Boolean(
    messageMenu &&
      messageMenuSource &&
      !activeTabIsMerged &&
      activeSingleSource &&
      messageMenuSource.id === activeSingleSource.id &&
      writableActiveTabSources.some((source) => source.id === messageMenuSource.id) &&
      canModerateSource(messageMenuSource) &&
      (messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick")
  );
  const tabMenuStyle = (() => {
    if (!tabMenu) return undefined;
    const estimatedRows = Math.max(2, tabs.length + 1);
    const estimatedHeight = Math.min(640, 24 + estimatedRows * 38);
    const { x, y } = clampContextMenuPosition(tabMenu.x, tabMenu.y, 280, estimatedHeight);
    return { top: y, left: x };
  })();
  const messageMenuStyle = (() => {
    if (!messageMenu) return undefined;
    const modActionCount = canShowModerationMenu ? (messageMenu.message.platform === "twitch" ? 5 : 4) : 0;
    const userLogCount =
      (messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick") &&
      normalizeUserKey(messageMenu.message.username) !== "system"
        ? 1
        : 0;
    const smartCommandCount =
      messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick"
        ? 4
        : 0;
    const collabLinkCount =
      settings.collaborationMode === true &&
      (messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick")
        ? 1
        : 0;
    const pinCount = activeTabId ? 1 : 0;
    const copyCount = 3;
    const sectionCount = (modActionCount > 0 ? 1 : 0) + (smartCommandCount > 0 ? 1 : 0) + 1;
    const rowCount = modActionCount + userLogCount + smartCommandCount + collabLinkCount + pinCount + copyCount + sectionCount;
    const estimatedHeight = Math.min(680, 26 + Math.max(4, rowCount) * 38);
    const { x, y } = clampContextMenuPosition(messageMenu.x, messageMenu.y, 300, estimatedHeight);
    return { top: y, left: x };
  })();

  return (
    <div
      className="chat-shell"
      onClick={() => {
        setTabMenu(null);
        setMessageMenu(null);
      }}
    >
      <header className="topbar">
        <div className="top-left">
          <button
            type="button"
            className="tab-refresh-button"
            onClick={() => void refreshActiveTab()}
            disabled={!activeTab || refreshingActiveTab}
            title={activeTab ? "Refresh current tab connections" : "Open a tab first"}
          >
            {refreshingActiveTab ? "Refreshing..." : "Refresh Tab"}
          </button>
          <div className="brand-block">
            <h1>MultiChat</h1>
            <p>Unified chat desk</p>
          </div>
        </div>
        <form
          className="channel-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addChannelTab();
          }}
        >
          <select
            value={platformInput}
            onChange={(event) => setPlatformInput(event.target.value as Platform)}
            className="platform-select"
          >
            {availablePlatforms.map((platform) => (
              <option key={platform} value={platform}>
                [{platformIconGlyph(platform)}] {platform[0].toUpperCase()}
                {platform.slice(1)}
              </option>
            ))}
          </select>
          <input
            ref={channelInputRef}
            value={channelInput}
            onChange={(event) => setChannelInput(event.target.value)}
            placeholder="Type channel username and press Enter"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button type="submit">Open Tab</button>
        </form>
        <div className="top-actions">
          <button
            type="button"
            className={streamSafeMode ? "safe-mode-button active" : "safe-mode-button"}
            onClick={() => void persistSettings({ streamSafeMode: !streamSafeMode })}
            title={streamSafeMode ? "Exit Stream Safe Mode" : "Enable Stream Safe Mode"}
          >
            {streamSafeMode ? "Exit Safe Mode" : "Stream Safe Mode"}
          </button>
          {!streamSafeMode ? (
          <details className="menu-dropdown">
            <summary>Menu</summary>
            <div className="menu-dropdown-panel">
              <div className="menu-group">
                <strong>Experience</strong>
                <label className="menu-inline">
                  Workspace
                  <select
                    value={(settings.workspacePreset ?? "streamer") as WorkspacePreset}
                    onChange={(event) => void applyWorkspacePreset(event.target.value as WorkspacePreset)}
                  >
                    <option value="streamer">Streamer</option>
                    <option value="moddesk">Mod Desk</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <label className="menu-inline">
                  Mode
                  <select
                    value={isSimpleMode ? "simple" : "advanced"}
                    onChange={(event) => void persistSettings({ uiMode: event.target.value as "simple" | "advanced" })}
                  >
                    <option value="simple">Simple</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
                <label className="menu-inline">
                  Theme
                  <select value={theme} onChange={(event) => void persistSettings({ theme: event.target.value as "dark" | "light" | "classic" })}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="classic">Classic</option>
                  </select>
                </label>
                <span className="menu-muted">
                  {isSimpleMode ? "Simple mode: core streamer tools only." : "Advanced mode: full controls and diagnostics."}
                </span>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={welcomeModeEnabled}
                    onChange={(event) => void persistSettings({ welcomeMode: event.target.checked })}
                  />
                  Welcome mode (quiet non-mention alerts)
                </label>
              </div>
              <div className="menu-group">
                <strong>View</strong>
                <button type="button" onClick={() => window.electronAPI.openOverlay()}>
                  Open Overlay
                </button>
                <button type="button" onClick={() => setQuickTourOpen(true)}>
                  Open Quick Tour
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupWizardStep(0);
                    setSetupWizardOpen(true);
                  }}
                >
                  Reopen Setup Wizard
                </button>
                {isAdvancedMode ? (
                  <label className="menu-inline">
                    Replay
                    <select value={replayWindow} onChange={(event) => setReplayWindow(Number(event.target.value) as ReplayWindow)}>
                      <option value={0}>All</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </label>
                ) : null}
              </div>
              {isAdvancedMode ? (
                <div className="menu-group">
                  <strong>Collaboration</strong>
                  <label className="menu-check">
                    <input
                      type="checkbox"
                      checked={settings.collaborationMode === true}
                      onChange={(event) => void persistSettings({ collaborationMode: event.target.checked })}
                    />
                    Enable shared mod links (Twitch/Kick)
                  </label>
                </div>
              ) : null}
              {isAdvancedMode ? (
              <div className="menu-group">
                <strong>Panels</strong>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.dockedPanels?.mentions === true}
                    onChange={(event) => void setDockedPanel("mentions", event.target.checked)}
                  />
                  Mentions panel
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.dockedPanels?.globalTimeline === true}
                    onChange={(event) => void setDockedPanel("globalTimeline", event.target.checked)}
                  />
                  Global timeline panel
                </label>
                {isAdvancedMode ? (
                  <>
                    <label className="menu-check">
                      <input
                        type="checkbox"
                        checked={settings.dockedPanels?.modHistory === true}
                        onChange={(event) => void setDockedPanel("modHistory", event.target.checked)}
                      />
                      Mod history panel
                    </label>
                    <label className="menu-check">
                      <input
                        type="checkbox"
                        checked={settings.dockedPanels?.userCard === true}
                        onChange={(event) => void setDockedPanel("userCard", event.target.checked)}
                      />
                      User card panel
                    </label>
                  </>
                ) : null}
              </div>
              ) : null}
              {isAdvancedMode ? (
              <div className="menu-group">
                <strong>Stream Sync</strong>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={streamDelayMode}
                    onChange={(event) => void persistSettings({ streamDelayMode: event.target.checked })}
                  />
                  Stream delay mode
                </label>
                <label className="menu-inline">
                  Delay (sec)
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={streamDelaySeconds}
                    onChange={(event) => void persistSettings({ streamDelaySeconds: Number(event.target.value) || 0 })}
                  />
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={spoilerBlurDelayed}
                    onChange={(event) => void persistSettings({ spoilerBlurDelayed: event.target.checked })}
                  />
                  Blur delayed lines
                </label>
              </div>
              ) : null}
              {isAdvancedMode ? (
              <div className="menu-group">
                <strong>Tab Groups</strong>
                <label className="menu-inline">
                  Active tab group
                  <input value={tabGroupDraft} onChange={(event) => setTabGroupDraft(event.target.value)} placeholder="e.g. Event A" />
                </label>
                <div className="menu-row">
                  <button type="button" onClick={() => void assignActiveTabGroup()} disabled={!activeTabId}>
                    Save group
                  </button>
                </div>
                {uniqueGroups.length > 0 ? (
                  <div className="menu-row">
                    {uniqueGroups.map((group) => (
                      <button key={group} type="button" onClick={() => void toggleGroupMute(group)}>
                        {mutedGroups.includes(group) ? `Unmute ${group}` : `Mute ${group}`}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              ) : null}
              {isAdvancedMode ? (
              <div className="menu-group">
                <strong>Notifications</strong>
                <label className="menu-inline">
                  Scene
                  <select
                    value={notificationScene}
                    onChange={(event) => void persistSettings({ notificationScene: event.target.value as "live" | "chatting" | "offline" })}
                  >
                    <option value="live">Live</option>
                    <option value="chatting">Just Chatting</option>
                    <option value="offline">Offline</option>
                  </select>
                </label>
              </div>
              ) : null}
              <div className="menu-group">
                <strong>Accounts</strong>
                <details className="menu-submenu">
                  <summary>Twitch</summary>
                  {settings.twitchToken || settings.twitchGuest ? (
                    <button type="button" onClick={() => void signOutTwitch()}>
                      Sign out Twitch
                    </button>
                  ) : (
                    <button type="button" onClick={() => void signInTwitch()} disabled={authBusy !== null}>
                      {authBusy === "twitch" ? "Signing in..." : "Sign in Twitch"}
                    </button>
                  )}
                </details>
                <details className="menu-submenu">
                  <summary>Kick</summary>
                  {settings.kickAccessToken || settings.kickGuest ? (
                    <button type="button" onClick={() => void signOutKick()}>
                      Sign out Kick
                    </button>
                  ) : (
                    <button type="button" onClick={() => void signInKick()} disabled={authBusy !== null}>
                      {authBusy === "kick" ? "Signing in..." : "Sign in Kick"}
                    </button>
                  )}
                </details>
                {isAdvancedMode ? (
                  <>
                <label className="menu-inline">
                  Save current as
                  <input
                    value={newAccountProfileName}
                    onChange={(event) => setNewAccountProfileName(event.target.value)}
                    placeholder="Profile name"
                  />
                </label>
                <button type="button" onClick={() => void saveCurrentAccountProfile()}>
                  Save account profile
                </button>
                {(settings.accountProfiles ?? []).length > 0 ? (
                  <label className="menu-inline">
                    Switch profile
                    <select onChange={(event) => void switchAccountProfile(event.target.value)} defaultValue="">
                      <option value="" disabled>
                        Choose profile
                      </option>
                      {(settings.accountProfiles ?? []).map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                  </>
                ) : null}
              </div>
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Auth Manager</strong>
                <div className="menu-row">
                  <button type="button" onClick={() => void refreshAuthHealth(false)} disabled={authHealthBusy}>
                    Refresh health
                  </button>
                  <button type="button" onClick={() => void refreshAuthHealth(true)} disabled={authHealthBusy}>
                    Test permissions
                  </button>
                </div>
                <div className="menu-health-list">
                  <div className="menu-health-card">
                    <span className="menu-health-title">Twitch</span>
                    <span>Signed in: {authHealth?.twitch.signedIn ? "yes" : "no"}</span>
                    <span>User: {authHealth?.twitch.username || settings.twitchUsername || "n/a"}</span>
                    <span>Can send: {authHealth?.twitch.canSend ? "yes" : "no"}</span>
                    <span>Can mod (active tab): {canModerateActiveTab && activeSingleSource?.platform === "twitch" ? "yes" : "no"}</span>
                    <span>Token expiry: {formatOptionalExpiry(authHealth?.twitch.tokenExpiry)}</span>
                    {authHealth?.twitch.error ? <span className="menu-error">Error: {authHealth.twitch.error}</span> : null}
                  </div>
                  <div className="menu-health-card">
                    <span className="menu-health-title">Kick</span>
                    <span>Signed in: {authHealth?.kick.signedIn ? "yes" : "no"}</span>
                    <span>User: {authHealth?.kick.username || settings.kickUsername || "n/a"}</span>
                    <span>Can send: {authHealth?.kick.canSend ? "yes" : "no"}</span>
                    <span>Can mod (active tab): {canModerateActiveTab && activeSingleSource?.platform === "kick" ? "yes" : "no"}</span>
                    <span>Token expiry: {formatOptionalExpiry(authHealth?.kick.tokenExpiry)}</span>
                    {authHealth?.kick.error ? <span className="menu-error">Error: {authHealth.kick.error}</span> : null}
                  </div>
                </div>
                </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Connection Health</strong>
                <details className="menu-submenu" open>
                  <summary>Open sources ({connectionHealthRows.length})</summary>
                  <div className="menu-connection-list">
                    {connectionHealthRows.length === 0 ? (
                      <span className="menu-muted">No sources connected yet.</span>
                    ) : (
                      connectionHealthRows.map((row) => (
                        <div key={row.source.id} className="menu-connection-row">
                          <span className="menu-health-title">
                            {row.source.platform}/{row.source.channel}
                          </span>
                          <span>Status: {row.status}</span>
                          <span>Can send: {row.canSend ? "yes" : "no"}</span>
                          <span>Can mod: {row.canModerate ? "yes" : "no"}</span>
                          <span>Token expiry: {formatOptionalExpiry(row.tokenExpiry)}</span>
                          <span>Last status change: {row.health?.lastStatusAt ? new Date(row.health.lastStatusAt).toLocaleTimeString() : "n/a"}</span>
                          {row.health?.reconnectReason ? <span>Reconnect reason: {row.health.reconnectReason}</span> : null}
                          {row.health?.lastError ? <span className="menu-error">Last error: {row.health.lastError}</span> : null}
                        </div>
                      ))
                    )}
                  </div>
                </details>
                </div>
              ) : null}
              {isAdvancedMode ? (
              <div className="menu-group">
                <strong>Mention Inbox</strong>
                <div className="menu-row">
                  <span>{mentionInboxCount} unread mentions</span>
                  <button type="button" onClick={clearMentionInbox} disabled={mentionInboxCount === 0}>
                    Clear
                  </button>
                </div>
                <div className="menu-mention-list">
                  {mentionInboxCount === 0 ? (
                    <span className="menu-muted">No mentions yet.</span>
                  ) : (
                    mentionInbox.slice(0, 12).map((entry) => (
                      <button key={entry.id} type="button" className="menu-mention-item" onClick={() => openMention(entry)}>
                        <span>
                          [{platformIconGlyph(entry.platform)}] #{entry.channel} · {entry.reason === "reply" ? "Reply" : "Mention"} · {entry.displayName}
                        </span>
                        <span>{entry.message.slice(0, 120)}</span>
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                  <strong>Search</strong>
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder={globalSearchMode ? "Search all tabs" : "Search in active tab"}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <label className="menu-check">
                    <input
                      type="checkbox"
                      checked={globalSearchMode}
                      onChange={(event) => void persistSettings({ globalSearchMode: event.target.checked })}
                    />
                    Global search
                  </label>
                </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Filters</strong>
                <label className="menu-inline">
                  Profile
                  <select
                    value={filterProfile}
                    onChange={(event) => void applyFilterProfile(event.target.value as "clean" | "mod" | "no-filter" | "custom")}
                  >
                    <option value="custom">Custom</option>
                    <option value="clean">Clean</option>
                    <option value="mod">Mod</option>
                    <option value="no-filter">No filter</option>
                  </select>
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.smartFilterSpam !== false}
                    onChange={(event) => {
                      setFilterProfile("custom");
                      void persistSettings({ smartFilterSpam: event.target.checked });
                    }}
                  />
                  Smart spam filter
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.smartFilterScam !== false}
                    onChange={(event) => {
                      setFilterProfile("custom");
                      void persistSettings({ smartFilterScam: event.target.checked });
                    }}
                  />
                  Scam phrase filter
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={effectivePerformanceMode}
                    onChange={(event) => void persistSettings({ performanceMode: event.target.checked })}
                  />
                  Performance mode {adaptivePerformanceMode ? "(adaptive override active)" : ""}
                </label>
                </div>
              ) : (
                <div className="menu-group">
                  <strong>Performance</strong>
                  <label className="menu-check">
                    <input
                      type="checkbox"
                      checked={effectivePerformanceMode}
                      onChange={(event) => void persistSettings({ performanceMode: event.target.checked })}
                    />
                    Performance mode
                  </label>
                </div>
              )}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Current Tab Alerts</strong>
                <label className="menu-inline">
                  Profile
                  <select
                    value={tabAlertProfile}
                    onChange={(event) => {
                      const profile = event.target.value as TabAlertProfile;
                      if (profile === "custom") {
                        setTabAlertProfile("custom");
                        return;
                      }
                      applyTabAlertProfile(profile);
                    }}
                  >
                    <option value="custom">Custom</option>
                    <option value="default">Default</option>
                    <option value="quiet">Quiet</option>
                    <option value="mod-heavy">Mod-heavy</option>
                    <option value="tournament">Tournament</option>
                  </select>
                </label>
                <input
                  value={tabAlertKeywordInput}
                  onChange={(event) => setTabAlertKeywordInput(event.target.value)}
                  placeholder="Keyword (e.g. urgent)"
                />
                <label className="menu-check">
                  <input type="checkbox" checked={tabAlertSound} onChange={(event) => setTabAlertSound(event.target.checked)} />
                  Play sound
                </label>
                <label className="menu-check">
                  <input type="checkbox" checked={tabAlertNotify} onChange={(event) => setTabAlertNotify(event.target.checked)} />
                  Desktop notification
                </label>
                <label className="menu-check">
                  <input type="checkbox" checked={tabMentionSound} onChange={(event) => setTabMentionSound(event.target.checked)} />
                  Mention sound
                </label>
                <label className="menu-check">
                  <input type="checkbox" checked={tabMentionNotify} onChange={(event) => setTabMentionNotify(event.target.checked)} />
                  Mention notification
                </label>
                <div className="menu-row">
                  <button type="button" onClick={() => void toggleActiveTabMentionMute()} disabled={!activeTabId}>
                    {activeMentionMuted ? "Unmute mentions" : "Mute mentions"}
                  </button>
                  <button type="button" onClick={() => void snoozeActiveTabMentions(15)} disabled={!activeTabId}>
                    Snooze 15m
                  </button>
                  {activeMentionSnoozed ? (
                    <button type="button" onClick={() => void clearActiveTabMentionSnooze()} disabled={!activeTabId}>
                      Clear snooze
                    </button>
                  ) : null}
                </div>
                <span className="menu-muted">
                  {activeMentionMuted
                    ? "Mentions are muted for this tab."
                    : activeMentionSnoozed
                      ? `Mentions snoozed until ${new Date(activeMentionSnoozeUntil).toLocaleTimeString()}.`
                      : "Mentions are active for this tab."}
                </span>
                <button type="button" onClick={() => void saveCurrentTabAlertRule()} disabled={!activeTabId}>
                  Save tab alert
                </button>
                </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Current Tab Send Rule</strong>
                <label className="menu-inline">
                  Default target
                  <select
                    value={tabSendDefaultTarget}
                    onChange={(event) => setTabSendDefaultTarget(event.target.value as "all" | "first" | "specific")}
                    disabled={!activeTabId}
                  >
                    <option value="all">All chats in tab</option>
                    <option value="first">First writable chat</option>
                    <option value="specific">Specific chat</option>
                  </select>
                </label>
                {tabSendDefaultTarget === "specific" ? (
                  <label className="menu-inline">
                    Specific chat
                    <select value={tabSendSpecificSourceId} onChange={(event) => setTabSendSpecificSourceId(event.target.value)} disabled={!activeTabId}>
                      <option value="">Select chat</option>
                      {writableActiveTabSources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.platform}/{source.channel}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="menu-check">
                  <input type="checkbox" checked={tabSendBlockAll} onChange={(event) => setTabSendBlockAll(event.target.checked)} disabled={!activeTabId} />
                  Block send-to-all on this tab
                </label>
                <label className="menu-check">
                  <input type="checkbox" checked={tabSendConfirmOnAll} onChange={(event) => setTabSendConfirmOnAll(event.target.checked)} disabled={!activeTabId} />
                  Confirm before send-to-all on this tab
                </label>
                <div className="menu-row">
                  <button type="button" onClick={() => void saveCurrentTabSendRule()} disabled={!activeTabId}>
                    Save send rule
                  </button>
                  <button type="button" onClick={() => void clearCurrentTabSendRule()} disabled={!activeTabId}>
                    Clear send rule
                  </button>
                </div>
                </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Layouts</strong>
                <label className="menu-inline">
                  Preset
                  <select value={layoutPresetName} onChange={(event) => setLayoutPresetName(event.target.value)}>
                    {layoutPresetOptions.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="menu-row">
                  <button type="button" onClick={() => void saveLayoutPreset(layoutPresetName)}>
                    Save preset
                  </button>
                  <button type="button" onClick={() => void loadLayoutPreset(layoutPresetName)}>
                    Load preset
                  </button>
                </div>
                </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Session</strong>
                <div className="menu-row">
                  <button type="button" onClick={exportSessionSnapshot}>
                    Export session
                  </button>
                  <button type="button" onClick={() => importSessionInputRef.current?.click()}>
                    Import session
                  </button>
                </div>
                <input
                  ref={importSessionInputRef}
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void importSessionSnapshot(file).catch((error) => {
                      setAuthMessage(error instanceof Error ? error.message : String(error));
                    });
                    event.currentTarget.value = "";
                  }}
                />
                </div>
              ) : null}
              {isAdvancedMode ? (
                <div className="menu-group">
                <strong>Mod Action History</strong>
                <div className="menu-mention-list">
                  {moderationHistory.length === 0 ? (
                    <span className="menu-muted">No moderator actions yet.</span>
                  ) : (
                    moderationHistory.slice(0, 12).map((entry) => (
                      <span key={entry.id} className="menu-muted">
                        {new Date(entry.at).toLocaleTimeString()} · {entry.ok ? "OK" : "FAIL"} · {entry.action} · {entry.target} ·{" "}
                        {entry.source}
                      </span>
                    ))
                  )}
                </div>
                </div>
              ) : null}
              <div className="menu-group">
                <strong>Release Reliability</strong>
                {isAdvancedMode ? (
                  <label className="menu-inline">
                    Update channel
                    <select
                      value={(settings.updateChannel ?? authHealth?.updateChannel ?? updateStatus.channel ?? "stable") === "beta" ? "beta" : "stable"}
                      onChange={(event) => void setUpdateChannelPreference(event.target.value as "stable" | "beta")}
                    >
                      <option value="stable">Stable</option>
                      <option value="beta">Beta</option>
                    </select>
                  </label>
                ) : null}
                <span>Installed: v{updateStatus.currentVersion || "unknown"}</span>
                {isAdvancedMode ? <span>Available: {updateStatus.availableVersion ? `v${updateStatus.availableVersion}` : "n/a"}</span> : null}
                {isAdvancedMode ? <span>Release date: {formatOptionalDateTime(updateStatus.releaseDate)}</span> : null}
                <button type="button" onClick={() => void checkForUpdatesNow()}>
                  Check for Updates
                </button>
                {isAdvancedMode && updateStatus.releaseNotes ? <pre className="release-notes-preview">{updateStatus.releaseNotes}</pre> : null}
              </div>
              {isAdvancedMode ? (
              <div className="menu-group">
                <strong>System</strong>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.confirmSendAll !== false}
                    onChange={(event) => void persistSettings({ confirmSendAll: event.target.checked })}
                  />
                  Confirm send-to-all
                </label>
              </div>
              ) : null}
            </div>
          </details>
          ) : null}
        </div>
      </header>

      <div className="account-strip">
        {streamSafeMode ? (
          <>
            <span className="account-pill on">Stream Safe Mode active</span>
            <span className="account-pill">Usernames and menu are hidden on this screen.</span>
          </>
        ) : (
          <>
            {hasPrimaryAuth ? (
              <span className={settings.twitchToken || settings.twitchGuest ? "account-pill on" : "account-pill"}>
                <PlatformIcon platform="twitch" />
                Twitch: {settings.twitchUsername || "off"}
              </span>
            ) : null}
            {hasPrimaryAuth ? (
              <span className={settings.kickAccessToken ? "account-pill on" : "account-pill"}>
                <PlatformIcon platform="kick" />
                Kick typing: {settings.kickUsername || "off"}
              </span>
            ) : null}
            {youtubeAlphaEnabled ? (
              <span className="account-pill on">
                <PlatformIcon platform="youtube" />
                YouTube: read-only
              </span>
            ) : null}
            {tiktokAlphaEnabled ? (
              <span className="account-pill on">
                <PlatformIcon platform="tiktok" />
                TikTok: read-only
              </span>
            ) : null}
            {mentionInboxCount > 0 ? <span className="account-pill on">Mentions: {mentionInboxCount}</span> : null}
          </>
        )}
      </div>

      {chatDeckMode ? (
        <section className="chat-main">
          <div className="active-tab-meta">
            <span>Chat Deck: {tabs.length} columns</span>
            <span>Horizontal scroll enabled</span>
          </div>
          <div className="message-list" style={{ display: "flex", gap: 12, overflowX: "auto", overflowY: "hidden", paddingBottom: 8 }}>
            {tabs.map((tab) => {
              const tabSources = tab.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as ChatSource[];
              const firstSource = tabSources[0];
              const group = tabGroups[tab.id] ?? "";
              const groupMuted = group ? mutedGroups.includes(group) : false;
              const deckMessages = deckMessagesByTabId[tab.id] ?? [];
              const writableSources = tabSources.filter((source) =>
                source.platform === "twitch" ? Boolean(settings.twitchToken) : source.platform === "kick" ? Boolean(settings.kickAccessToken) : false
              );
              return (
                <section
                  key={tab.id}
                  className="quick-mod-panel"
                  style={{
                    flex: "0 0 auto",
                    width: `${settings.deckWidths?.[tab.id] ?? 360}px`,
                    minWidth: 300,
                    maxWidth: 640,
                    resize: "horizontal",
                    overflow: "auto",
                    opacity: groupMuted ? 0.55 : 1
                  }}
                  onMouseUp={(event) => {
                    const width = Math.round((event.currentTarget as HTMLElement).getBoundingClientRect().width);
                    if ((settings.deckWidths?.[tab.id] ?? 0) === width) return;
                    void persistSettings({
                      deckWidths: {
                        ...(settings.deckWidths ?? {}),
                        [tab.id]: width
                      }
                    });
                  }}
                >
                  <div className="menu-row">
                    <strong>
                      {firstSource ? `${firstSource.platform}/${firstSource.channel}` : tabLabel(tab, sourceById)}
                    </strong>
                    <button type="button" onClick={() => void closeTab(tab.id)}>
                      Close
                    </button>
                  </div>
                  {group ? <span className="menu-muted">Group: {group}</span> : null}
	                  <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid rgba(37, 65, 78, 0.45)", borderRadius: 8, padding: 8 }}>
	                    {deckMessages.slice(-400).map((message) => (
	                      <div key={`${message.id}-${message.timestamp}`} className="chat-line">
                        <span className="line-meta">
                          <span className={`platform ${message.platform}`}>{message.platform}</span>
                          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                        </span>
	                        <span className="line-author">
	                          <button
	                            type="button"
	                            className="username-button"
	                            style={{ color: message.color, filter: spoilerBlurDelayed ? "blur(1.5px)" : undefined }}
	                            onClick={() => {
	                              if (streamSafeMode) return;
	                              setIdentityTarget({
	                                username: message.username,
	                                displayName: message.displayName || message.username
	                              });
	                            }}
	                          >
	                            {streamSafeMode ? anonymizeName(message.displayName || message.username) : message.displayName || message.username}
	                          </button>
	                        </span>
                        <span className="line-message" style={{ filter: spoilerBlurDelayed ? "blur(1.5px)" : undefined }}>
                          {message.message}
                        </span>
                      </div>
                    ))}
                  </div>
                  <form
                    className="composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendDeckMessage(tab);
                    }}
                  >
                    <input
                      value={deckComposerByTabId[tab.id] ?? ""}
                      onChange={(event) =>
                        setDeckComposerByTabId((previous) => ({
                          ...previous,
                          [tab.id]: event.target.value
                        }))
                      }
                      placeholder={
                        writableSources.length > 0
                          ? writableSources.length > 1
                            ? `Send to ${writableSources.length} chats in this column`
                            : "Type a message"
                          : "Read-only deck"
                      }
                      disabled={writableSources.length === 0}
                    />
                    <button type="submit" disabled={writableSources.length === 0 || !(deckComposerByTabId[tab.id] ?? "").trim()}>
                      Send
                    </button>
                  </form>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      {!chatDeckMode ? (
        <div className={hasDockedPanels ? "main-layout has-docked-panels" : "main-layout"} ref={mainLayoutRef}>
      <div className="main-layout-primary">
      <nav className="tabbar">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const tabSources = tab.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as ChatSource[];
          const firstSource = tabSources[0];
          const label = tabLabel(tab, sourceById);
          const group = tabGroups[tab.id] ?? "";
          const groupMuted = group ? mutedGroups.includes(group) : false;
          const unreadCount = tabUnreadCounts[tab.id] ?? 0;
          const mentionCount = tabMentionCounts[tab.id] ?? 0;
          return (
            <div
              key={tab.id}
              className={active ? `tab active${groupMuted ? " muted" : ""}` : `tab${groupMuted ? " muted" : ""}`}
              onContextMenu={(event) => {
                if (streamSafeMode) return;
                event.preventDefault();
                setTabMenu({ x: event.clientX, y: event.clientY, tabId: tab.id });
              }}
            >
              <button type="button" className="tab-select" onClick={() => setActiveTabId(tab.id)}>
                {firstSource ? <PlatformIcon platform={firstSource.platform} /> : null}
                <span>{label}</span>
                {group ? <span className="tab-badge unread">{group}</span> : null}
                {!active && (mentionCount > 0 || unreadCount > 0) ? (
                  <span className="tab-badges">
                    {mentionCount > 0 ? (
                      <span className="tab-badge mention" title={`${mentionCount} mention${mentionCount === 1 ? "" : "s"}`}>
                        @{mentionCount > 99 ? "99+" : mentionCount}
                      </span>
                    ) : null}
                    {unreadCount > 0 ? (
                      <span className="tab-badge unread" title={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}>
                        {unreadCount > 999 ? "999+" : unreadCount}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </nav>

      <section className="toolbar">
        <span>
          {activeTab
            ? newestLocked
              ? `${visibleMessages.length} messages · ${analyticsSummary.messagesPerMinute}/min · ${analyticsSummary.activeChatters} chatters`
              : `${visibleMessages.length} messages (${pendingNewestCount} new paused) · ${analyticsSummary.messagesPerMinute}/min · ${analyticsSummary.activeChatters} chatters`
            : "Open a channel tab to start"}
        </span>
        {firstUnreadTimestamp > 0 ? (
          <button type="button" className="ghost" onClick={jumpToFirstUnread}>
            First unread
          </button>
        ) : null}
        {adaptivePerformanceMode ? <span className="account-pill on">Adaptive perf on</span> : null}
      </section>
      <section className="analytics-strip" aria-label="Live analytics">
        <span className="analytics-chip">Chatters: {analyticsSummary.activeChatters}</span>
        <span className="analytics-chip">Msg/min: {analyticsSummary.messagesPerMinute}</span>
        <span className="analytics-chip">Mentions/min: {analyticsSummary.mentionRatePerMinute}</span>
        <span className="analytics-chip">Mod actions/min: {analyticsSummary.modActionRatePerMinute}</span>
      </section>

      <main className="chat-main">
        {!activeTab ? (
          <div className="empty-state">
            <h2>No tabs open</h2>
            <p>Enter a channel username above to create a new tab.</p>
          </div>
        ) : (
          <>
            <div className="active-tab-meta">
              {activeTab.sourceIds.map((sourceId) => {
                const source = sourceById.get(sourceId);
                if (!source) return null;
                const status = statusBySource[source.id] ?? "connecting";
                const health = connectionHealthBySource[source.id];
                const staleSeconds = health?.lastMessageAt ? Math.max(0, Math.floor((Date.now() - health.lastMessageAt) / 1000)) : null;
                return (
                  <span key={source.id} className={`source-chip ${status}`}>
                    <PlatformIcon platform={source.platform} />
	                    <span>
	                      {streamSafeMode ? `${source.platform}/hidden` : `${source.platform}/${source.channel}`} ({status}
	                      {staleSeconds !== null && staleSeconds > 30 ? ` · lag ${staleSeconds}s` : ""})
	                    </span>
	                  </span>
                );
              })}
            </div>
            <div className="quick-actions-row">
              <strong>Quick Actions</strong>
              <button type="button" className="quick-action-button" onClick={() => void refreshActiveTab()}>
                Reconnect tab
              </button>
              <button type="button" className="quick-action-button" onClick={() => setReplayBufferSeconds((previous) => (previous === 30 ? 0 : 30))}>
                {replayBufferSeconds === 30 ? "Replay 30s off" : "Replay 30s"}
              </button>
              <button type="button" className="quick-action-button" onClick={() => setReplayBufferSeconds((previous) => (previous === 60 ? 0 : 60))}>
                {replayBufferSeconds === 60 ? "Replay 60s off" : "Replay 60s"}
              </button>
              <button type="button" className="quick-action-button" onClick={() => window.electronAPI.openOverlay()}>
                Open overlay
              </button>
              <button type="button" className="quick-action-button" onClick={() => void copyActiveTabLinks()}>
                Copy channel link
              </button>
              <button
                type="button"
                className={welcomeModeEnabled ? "quick-action-button active" : "quick-action-button"}
                onClick={() => void persistSettings({ welcomeMode: !welcomeModeEnabled })}
              >
                {welcomeModeEnabled ? "Welcome mode: on" : "Welcome mode: off"}
              </button>
              <button type="button" className="quick-action-button" onClick={() => setPollComposerOpen((previous) => !previous)}>
                {pollComposerOpen ? "Close poll builder" : "Create poll"}
              </button>
            </div>
            {activeRaidSignal ? (
              <div className="raid-alert">
                <strong>Possible raid/host spike detected</strong>
                <span>
                  {activeRaidSignal.messagesPerMinute}/min · {activeRaidSignal.uniqueChatters} active chatters
                </span>
                <div className="menu-row">
                  <button type="button" onClick={() => void persistSettings({ welcomeMode: true })}>
                    Enable Welcome Mode
                  </button>
                  <button type="button" onClick={() => setRaidSignal(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            {activePinnedMessage ? (
              <div className="quick-mod-panel">
                <strong>Pinned (MultiChat)</strong>
                <span className="menu-muted">
                  [{platformIconGlyph(activePinnedMessage.platform)}] #{activePinnedMessage.channel} · {activePinnedMessage.displayName} ·{" "}
                  {new Date(activePinnedMessage.timestamp).toLocaleTimeString()}
                </span>
                <span>{activePinnedMessage.message}</span>
                <button type="button" onClick={() => void clearPinnedMessageForActiveTab()}>
                  Unpin
                </button>
              </div>
            ) : null}
            {pollComposerOpen ? (
              <div className="quick-mod-panel">
                <strong>Start Poll (MultiChat)</strong>
                <input
                  value={pollQuestionDraft}
                  onChange={(event) => setPollQuestionDraft(event.target.value)}
                  placeholder="Question"
                  maxLength={140}
                />
                <input
                  value={pollOptionsDraft}
                  onChange={(event) => setPollOptionsDraft(event.target.value)}
                  placeholder="Options separated by comma, pipe, or newline"
                />
                <div className="menu-row">
                  <button type="button" onClick={() => void createPollInActiveTab()} disabled={!activeTabId}>
                    Start poll
                  </button>
                  <button type="button" onClick={() => setPollComposerOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {activeTabPoll ? (
              <div className="quick-mod-panel">
                <strong>{activeTabPoll.question}</strong>
                <span className="menu-muted">
                  {activeTabPoll.active ? "Live poll" : "Closed poll"} · {new Date(activeTabPoll.createdAt).toLocaleTimeString()}
                </span>
                {activeTabPoll.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => void voteInActivePoll(option.id)}
                    disabled={!activeTabPoll.active}
                  >
                    {option.label} ({option.votes})
                  </button>
                ))}
                <div className="menu-row">
                  {activeTabPoll.active ? (
                    <button type="button" onClick={() => void closeActivePoll()}>
                      Close poll
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void clearActivePoll()}>
                    Remove poll
                  </button>
                </div>
              </div>
            ) : null}
            <div
              ref={messageListRef}
              className="message-list"
              onWheel={(event) => event.stopPropagation()}
              onScroll={(event) => {
                if (!newestLocked) return;
                if (isNearBottom(event.currentTarget)) return;
                setNewestLocked(false);
                const cutoffMessage = visibleMessages[visibleMessages.length - 1];
                setLockCutoffTimestamp(cutoffMessage ? messageTimestamp(cutoffMessage) : Date.now());
              }}
            >
              {renderedMessages.map((message, index) => {
                const highlighted = settings.highlightKeywords?.some((word) =>
                  message.message.toLowerCase().includes(word.toLowerCase())
                );
                const ts = messageTimestamp(message);
                const prevTs = index > 0 ? messageTimestamp(renderedMessages[index - 1]) : 0;
                const showUnreadMarker = firstUnreadTimestamp > 0 && ts >= firstUnreadTimestamp && (index === 0 || prevTs < firstUnreadTimestamp);
                const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
                const sourceEmoteMap = source ? channelEmoteMapBySourceId[source.id] : undefined;
                const resolveEmote = (token: string) => (effectivePerformanceMode ? undefined : sourceEmoteMap?.[token] ?? globalEmoteMap[token]);
	                const messageChunks = buildMessageChunks(message, resolveEmote);
	                const combinedChannels = readCombinedChannels(message);
	                const channelLabel =
	                  streamSafeMode
	                    ? "#hidden"
	                    : combinedChannels.length > 1
	                      ? `#${combinedChannels[0]} +${combinedChannels.length - 1}`
	                      : `#${message.channel}`;
	                const channelTitle = streamSafeMode
	                  ? "Hidden while Stream Safe Mode is active"
	                  : combinedChannels.length > 1
	                    ? combinedChannels.map((channel) => `#${channel}`).join(", ")
	                    : `#${message.channel}`;
	                const roleBadges = streamSafeMode ? [] : roleBadgesForMessage(message);
	                const displayName = message.displayName || message.username;
	                const renderedDisplayName = streamSafeMode ? anonymizeName(displayName) : displayName;
	                return (
	                  <React.Fragment key={message.id}>
                    {showUnreadMarker ? (
                      <div className="chat-unread-marker" data-unread-marker="1">
                        New messages
                      </div>
                    ) : null}
	                    <div
	                      className={highlighted ? "chat-line highlight" : "chat-line"}
	                      data-jump-key={buildMessageJumpKey(message)}
	                      onContextMenu={(event) => {
	                        if (streamSafeMode) return;
	                        event.preventDefault();
	                        setMessageMenu({ x: event.clientX, y: event.clientY, message });
	                      }}
                    >
                    <span className="line-meta">
                      <span className={`platform ${message.platform}`}>
                        <PlatformIcon platform={message.platform} />
                        <span>{message.platform}</span>
                      </span>
                      <span className="line-channel" title={channelTitle}>
                        {channelLabel}
                      </span>
                      <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    </span>
                    <span className="line-author">
                      {roleBadges.length > 0 ? (
                        <span className="role-badges">
                          {roleBadges.map((badge) => (
                            <span key={`${message.id}-${badge.key}`} className={`role-badge role-${badge.key}`} title={badge.label}>
                              {badge.icon}
                            </span>
                          ))}
                        </span>
                      ) : null}
	                      <button
	                        type="button"
	                        className="username-button"
	                        style={{ color: message.color }}
	                        onClick={() => {
	                          if (streamSafeMode) return;
	                          setIdentityTarget({
	                            username: message.username,
	                            displayName: message.displayName || message.username
	                          });
	                        }}
	                      >
	                        {renderedDisplayName}
	                      </button>
	                    </span>
                    <span className="line-message">
                      {messageChunks.map((chunk, index) =>
                        chunk.type === "text" ? (
                          <React.Fragment key={`${message.id}-text-${index}`}>{chunk.value}</React.Fragment>
                        ) : (
                          <img
                            key={`${message.id}-emote-${index}-${chunk.name}`}
                            className="inline-emote"
                            src={chunk.url}
                            alt={chunk.name}
                            title={chunk.name}
                          />
                        )
                      )}
                    </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            {!newestLocked ? (
              <button type="button" className="go-newest-button" onClick={jumpToNewest}>
                {pendingNewestCount > 0 ? `Go to newest message (${pendingNewestCount})` : "Go to newest message"}
              </button>
            ) : null}
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendActiveMessage();
              }}
            >
              {writableActiveTabSources.length > 0 ? (
                <select value={sendTargetId} onChange={(event) => setSendTargetId(event.target.value)}>
                  {writableActiveTabSources.length > 1 ? (
                    <option value={SEND_TARGET_TAB_ALL}>[ALL] All writable chats in this tab ({writableActiveTabSources.length})</option>
                  ) : null}
                  {writableActiveTabSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      [{platformIconGlyph(source.platform)}] {source.platform}/{source.channel}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                value={composerText}
                onChange={(event) => {
                  const next = event.target.value;
                  setComposerText(next);
                  setCommandPaletteOpen(next.trim().startsWith("/"));
                }}
                placeholder={composerPlaceholder}
                maxLength={500}
                disabled={writableActiveTabSources.length === 0}
              />
              {isAdvancedMode && canModerateActiveTab ? (
                <select
                  value={snippetToInsert}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSnippetToInsert("");
                    if (!value) return;
                    setComposerText((previous) => `${previous}${previous ? " " : ""}${value}`.trim());
                  }}
                  disabled={writableActiveTabSources.length === 0}
                >
                  <option value="">Snippets</option>
                  {COMMAND_SNIPPETS.map((snippet) => (
                    <option key={snippet} value={snippet}>
                      {snippet}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="submit" disabled={sending || writableActiveTabSources.length === 0 || !composerText.trim()}>
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
            {commandPaletteOpen && commandSuggestions.length > 0 ? (
              <div className="quick-mod-panel">
                <strong>Command Center</strong>
                {commandSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setComposerText(suggestion);
                      setCommandPaletteOpen(false);
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            {isAdvancedMode && writableActiveTabSources.length > 0 && canModerateActiveTab ? (
              <div className="quick-mod-panel">
                <strong>Quick Mod</strong>
                <input
                  value={quickModUser}
                  onChange={(event) => setQuickModUser(event.target.value)}
                  placeholder="@username"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <button type="button" onClick={() => void runQuickMod("timeout_60")}>
                  Timeout 1m
                </button>
                <button type="button" onClick={() => void runQuickMod("timeout_600")}>
                  Timeout 10m
                </button>
                <button type="button" onClick={() => void runQuickMod("ban")}>
                  Ban
                </button>
                <button type="button" onClick={() => void runQuickMod("unban")}>
                  Unban
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
      </div>
      {hasDockedPanels ? (
        <>
        <div
          className={dockPanelResizing ? "dock-resize-handle active" : "dock-resize-handle"}
          onPointerDown={startDockPanelResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize docked panels"
          title="Drag to resize menus"
        />
        <aside className="dock-sidebar" style={{ width: `${dockPanelWidth}px` }}>
          {settings.dockedPanels?.mentions ? (
            <div>
              <strong>Mentions</strong>
              {mentionInbox.length === 0 ? (
                <span className="menu-muted">No mentions.</span>
              ) : (
                mentionInbox.slice(0, 8).map((entry) => (
                  <button key={entry.id} type="button" onClick={() => openMention(entry)}>
                    [{platformIconGlyph(entry.platform)}] #{entry.channel} {entry.reason === "reply" ? "Reply" : "Mention"} · {entry.displayName}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {settings.dockedPanels?.globalTimeline ? (
            <div>
              <strong>Global Timeline</strong>
              {!globalSearchMode || !search.trim() ? (
                <span className="menu-muted">Enable Global search and type a query.</span>
              ) : globalSearchResults.length === 0 ? (
                <span className="menu-muted">No results.</span>
              ) : (
                globalSearchResults.slice(0, 10).map((message) => (
                  <button
                    key={`${message.id}-${message.timestamp}`}
                    type="button"
                    onClick={() => openGlobalSearchResult(message)}
                  >
                    [{platformIconGlyph(message.platform)}] #{message.channel} {message.displayName}: {message.message.slice(0, 42)}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {isAdvancedMode && settings.dockedPanels?.modHistory ? (
            <div>
              <strong>Mod History</strong>
              {moderationHistory.length === 0 ? (
                <span className="menu-muted">No actions yet.</span>
              ) : (
                moderationHistory.slice(0, 10).map((entry) => (
                  <span key={entry.id} className="menu-muted">
                    {new Date(entry.at).toLocaleTimeString()} {entry.action} {entry.target}
                  </span>
                ))
              )}
            </div>
          ) : null}
          {isAdvancedMode && settings.dockedPanels?.userCard ? (
            <div>
              <strong>User Card</strong>
              {identityTarget ? (
                <>
                  <span className="menu-muted">
                    {identityTarget.displayName} @{identityTarget.username}
                  </span>
                  <span className="menu-muted">
                    Total {identityStats.total} · 1m {identityStats.inLastMinute} · 5m {identityStats.inLastFiveMinutes}
                  </span>
                </>
              ) : (
                <span className="menu-muted">Click a username to pin stats.</span>
              )}
            </div>
          ) : null}
        </aside>
        </>
      ) : null}
      </div>
      ) : null}

      {tabMenu ? (
        <div className="context-menu" style={tabMenuStyle} onClick={(event) => event.stopPropagation()}>
          <strong>Merge This Tab Into</strong>
          {tabs
            .filter((tab) => tab.id !== tabMenu.tabId)
            .map((tab) => (
              <button key={tab.id} type="button" onClick={() => mergeTabs(tabMenu.tabId, tab.id)}>
                {tabLabel(tab, sourceById)}
              </button>
            ))}
          {tabs.filter((tab) => tab.id !== tabMenu.tabId).length === 0 ? <span>No merge targets</span> : null}
          {(tabs.find((tab) => tab.id === tabMenu.tabId)?.sourceIds.length ?? 0) > 1 ? (
            <button type="button" onClick={() => splitMergedTab(tabMenu.tabId)}>
              Split into single tabs
            </button>
          ) : null}
          <button type="button" onClick={() => setTabMenu(null)}>
            Close
          </button>
        </div>
      ) : null}

	      {messageMenu && !streamSafeMode ? (
	        <div
	          className="context-menu"
	          style={messageMenuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {canShowModerationMenu ? <strong>Moderation</strong> : null}
          {canShowModerationMenu ? (
            <button type="button" onClick={() => void runModeratorAction("timeout_60", messageMenu.message)}>
              Timeout 1m
            </button>
          ) : null}
          {canShowModerationMenu ? (
            <button type="button" onClick={() => void runModeratorAction("timeout_600", messageMenu.message)}>
              Timeout 10m
            </button>
          ) : null}
          {canShowModerationMenu ? (
            <button type="button" onClick={() => void runModeratorAction("ban", messageMenu.message)}>
              Ban user
            </button>
          ) : null}
          {canShowModerationMenu ? (
            <button type="button" onClick={() => void runModeratorAction("unban", messageMenu.message)}>
              Unban user
            </button>
          ) : null}
          {canShowModerationMenu && messageMenu.message.platform === "twitch" ? (
            <button type="button" onClick={() => void runModeratorAction("delete", messageMenu.message)}>
              Delete message
            </button>
          ) : null}
          {(messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick") &&
          normalizeUserKey(messageMenu.message.username) !== "system" ? (
            <button type="button" onClick={() => openUserLogsForMessage(messageMenu.message)}>
              View User Logs
            </button>
          ) : null}
          {(messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick") ? (
            <>
              <strong>Smart Commands</strong>
              <button type="button" onClick={() => fillComposerCommandForMessage("timeout_60", messageMenu.message)}>
                Fill timeout 1m
              </button>
              <button type="button" onClick={() => fillComposerCommandForMessage("timeout_600", messageMenu.message)}>
                Fill timeout 10m
              </button>
              <button type="button" onClick={() => fillComposerCommandForMessage("ban", messageMenu.message)}>
                Fill ban
              </button>
              <button type="button" onClick={() => fillComposerCommandForMessage("unban", messageMenu.message)}>
                Fill unban
              </button>
            </>
          ) : null}
          {settings.collaborationMode === true &&
          (messageMenu.message.platform === "twitch" || messageMenu.message.platform === "kick") ? (
            <button type="button" onClick={() => openPlatformModMenu(messageMenu.message)}>
              Open Platform Mod Menu
            </button>
          ) : null}
          {activeTabId ? (
            <button type="button" onClick={() => void pinMessageForActiveTab(messageMenu.message)}>
              Pin message in MultiChat
            </button>
          ) : null}
          <strong>Copy</strong>
          <button type="button" onClick={() => navigator.clipboard.writeText(messageMenu.message.displayName)}>
            Copy name
          </button>
          <button type="button" onClick={() => navigator.clipboard.writeText(messageMenu.message.message)}>
            Copy message
          </button>
          <button type="button" onClick={() => setMessageMenu(null)}>
            Close
          </button>
        </div>
      ) : null}

      {userLogTarget ? (
        <div className="user-logs-overlay" onClick={() => setUserLogTarget(null)}>
          <div className="user-logs-modal" onClick={(event) => event.stopPropagation()}>
            <div className="user-logs-header">
              <div>
                <strong>
                  {userLogTarget.platform.toUpperCase()} logs for {userLogTarget.displayName}
                </strong>
                <span>@{userLogTarget.username}</span>
              </div>
              <button type="button" className="ghost" onClick={() => setUserLogTarget(null)}>
                Close
              </button>
            </div>
            <p className="user-logs-note">Session-only history. Nothing is saved to local log files.</p>
            <div className="user-logs-list">
              {userLogMessages.length === 0 ? (
                <p className="user-logs-empty">No messages from this user in the current session yet.</p>
              ) : (
                userLogMessages.map((message) => (
                  <div key={`${message.id}-${message.timestamp}-${message.channel}`} className="user-log-line">
                    <span className="user-log-meta">
                      {new Date(message.timestamp).toLocaleString()} · {message.platform}/{message.channel}
                    </span>
                    <span className="user-log-text">{message.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {identityTarget ? (
        <div className="user-logs-overlay" onClick={() => setIdentityTarget(null)}>
          <div className="user-logs-modal" onClick={(event) => event.stopPropagation()}>
            <div className="user-logs-header">
              <div>
                <strong>Session identity card: {identityTarget.displayName}</strong>
                <span>@{identityTarget.username}</span>
              </div>
              <button type="button" className="ghost" onClick={() => setIdentityTarget(null)}>
                Close
              </button>
            </div>
            <p className="user-logs-note">Recent messages across all platforms in this session.</p>
            <p className="user-logs-note">
              Total: {identityStats.total} · 1m: {identityStats.inLastMinute} · 5m: {identityStats.inLastFiveMinutes} · Mentions:{" "}
              {identityStats.mentionCount}
            </p>
            <div className="user-logs-list">
              {identityMessages.length === 0 ? (
                <p className="user-logs-empty">No cross-platform history for this user yet.</p>
              ) : (
                identityMessages.map((message) => (
                  <div key={`${message.id}-${message.timestamp}-${message.channel}`} className="user-log-line">
                    <span className="user-log-meta">
                      {new Date(message.timestamp).toLocaleString()} · {message.platform}/{message.channel}
                    </span>
                    <span className="user-log-text">{message.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {setupWizardOpen ? (
        <div className="guide-overlay" onClick={(event) => event.stopPropagation()}>
          <div className="guide-modal" role="dialog" aria-modal="true" aria-label="Setup Wizard">
            <div className="guide-header">
              <div>
                <strong>Welcome to MultiChat</strong>
                <span>Step {setupWizardStep + 1} of 3</span>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setSetupWizardDismissed(true);
                  setSetupWizardOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <div className="guide-body">
              {setupWizardStep === 0 ? (
                <div className="guide-section">
                  <h3>Connect an account</h3>
                  <p>Sign into Twitch or Kick to unlock typing, moderation tools, and full chat controls.</p>
                  <label className="menu-inline">
                    Theme
                    <select
                      value={theme}
                      onChange={(event) => void persistSettings({ theme: event.target.value as "dark" | "light" | "classic" })}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                      <option value="classic">Classic</option>
                    </select>
                  </label>
                  <div className="guide-actions">
                    <button type="button" onClick={() => void signInTwitch()} disabled={authBusy !== null || Boolean(settings.twitchToken)}>
                      {settings.twitchToken ? "Twitch connected" : authBusy === "twitch" ? "Signing in Twitch..." : "Connect Twitch"}
                    </button>
                    <button type="button" onClick={() => void signInKick()} disabled={authBusy !== null || Boolean(settings.kickAccessToken)}>
                      {settings.kickAccessToken ? "Kick connected" : authBusy === "kick" ? "Signing in Kick..." : "Connect Kick"}
                    </button>
                  </div>
                  <p className="guide-note">Status: {setupPrimaryConnected ? "Connected" : "Waiting for Twitch or Kick sign-in"}</p>
                </div>
              ) : null}
              {setupWizardStep === 1 ? (
                <div className="guide-section">
                  <h3>Open your first tab</h3>
                  <p>Use the channel bar at the top to type a channel username and open your first chat tab.</p>
                  <div className="guide-actions">
                    <button
                      type="button"
                      onClick={() => {
                        window.setTimeout(() => channelInputRef.current?.focus(), 0);
                      }}
                    >
                      Focus Channel Bar
                    </button>
                    <button type="button" onClick={() => void openOwnChannelTab("twitch")} disabled={!settings.twitchUsername}>
                      Open My Twitch Tab
                    </button>
                    <button type="button" onClick={() => void openOwnChannelTab("kick")} disabled={!settings.kickUsername}>
                      Open My Kick Tab
                    </button>
                  </div>
                  <p className="guide-note">Tabs keep chats focused and fast: one tab per channel, with merge available from tab right-click.</p>
                  <p className="guide-note">Status: {setupFirstTabReady ? `First tab ready (${tabs.length} open)` : "Open at least one tab"}</p>
                </div>
              ) : null}
              {setupWizardStep === 2 ? (
                <div className="guide-section">
                  <h3>Know the essentials</h3>
                  <ul>
                    <li>{setupPrimaryConnected ? "Done" : "Pending"}: Login to Twitch or Kick.</li>
                    <li>{setupFirstTabReady ? "Done" : "Pending"}: Open your first channel tab.</li>
                    <li>{setupMessageReady ? "Done" : "Optional"}: Send one test message.</li>
                  </ul>
                  <div className="guide-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.querySelector(".composer input") as HTMLInputElement | null;
                        input?.focus();
                      }}
                      disabled={!setupFirstTabReady}
                    >
                      Focus Composer
                    </button>
                  </div>
                  <p className="guide-note">Finish unlocks after login + first tab. Test message is optional.</p>
                  <ul>
                    <li>Use <strong>Refresh Tab</strong> in the top-left to reconnect only the current tab.</li>
                    <li>Tabs show unread and mention badges while they are in the background.</li>
                    <li>Press <strong>Ctrl/Cmd + Tab</strong> to cycle tabs quickly.</li>
                    <li>Open <strong>Menu → Open Quick Tour</strong> any time.</li>
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="guide-footer">
              <button type="button" className="ghost" onClick={() => void skipSetupWizard()}>
                Skip for now
              </button>
              {setupWizardStep > 0 ? (
                <button type="button" className="ghost" onClick={() => setSetupWizardStep((previous) => Math.max(0, previous - 1))}>
                  Back
                </button>
              ) : null}
              {setupWizardStep < 2 ? (
                <button
                  type="button"
                  onClick={() => setSetupWizardStep((previous) => Math.min(2, previous + 1))}
                  disabled={
                    (setupWizardStep === 0 && !setupPrimaryConnected) ||
                    (setupWizardStep === 1 && !setupFirstTabReady)
                  }
                >
                  Next
                </button>
              ) : (
                <button type="button" onClick={() => void completeSetupWizard()} disabled={!setupCanFinish}>
                  Finish setup
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {quickTourOpen ? (
        <div className="guide-overlay" onClick={() => setQuickTourOpen(false)}>
          <div className="guide-modal quick-tour" role="dialog" aria-modal="true" aria-label="Quick Tour" onClick={(event) => event.stopPropagation()}>
            <div className="guide-header">
              <div>
                <strong>Quick Tour</strong>
                <span>1 minute</span>
              </div>
              <button type="button" className="ghost" onClick={() => setQuickTourOpen(false)}>
                Close
              </button>
            </div>
            <div className="guide-body">
              <div className="guide-section">
                <h3>Tabs</h3>
                <ul>
                  <li>Create a channel tab from the top bar.</li>
                  <li>Right click a tab to merge tabs.</li>
                  <li>Unread and mention badges appear on inactive tabs.</li>
                </ul>
              </div>
              <div className="guide-section">
                <h3>Messages</h3>
                <ul>
                  <li>Search only filters the active tab.</li>
                  <li>If you scroll up, auto-scroll pauses until you use Go to newest message.</li>
                  <li>Right-click a message to pin it in MultiChat for the current tab.</li>
                  <li>Use Quick Actions to start local polls per tab.</li>
                </ul>
              </div>
              <div className="guide-section">
                <h3>Moderation</h3>
                <ul>
                  <li>Moderation and snippets appear only in single-channel tabs where you can moderate.</li>
                  <li>Right click messages for moderation and user log actions.</li>
                </ul>
              </div>
              <div className="guide-section">
                <h3>Stability</h3>
                <ul>
                  <li>Use Refresh Tab to reconnect only the active tab.</li>
                  <li>Use Menu for account health, updates, and filters.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {authMessage ? (
        <p className="floating-status" onClick={() => setAuthMessage("")} title="Click to dismiss">
          {authMessage}
        </p>
      ) : null}
      {updateLockActive ? (
        <div className="update-lock-screen">
          <div className="update-lock-card">
            <div className="update-lock-spinner" aria-hidden="true" />
            <h2>{updateLockTitle}</h2>
            <p>{updateLockMessage}</p>
            <p>Please keep the app open. Controls are temporarily disabled.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
