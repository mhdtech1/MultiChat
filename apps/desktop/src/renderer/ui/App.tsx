import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatAdapter, ChatAdapterStatus, ChatMessage } from "@multichat/chat-core";
import { KickAdapter, TikTokAdapter, TwitchAdapter, YouTubeAdapter } from "@multichat/chat-core";

const mode = window.location.hash.replace("#", "");
const broadcast = new BroadcastChannel("multichat-chat");
const hotkeys = {
  focusSearch: "Control+Shift+F"
};

type Platform = "twitch" | "kick" | "youtube" | "tiktok";
const SEND_TARGET_TAB_ALL = "__all_in_tab__";

type Settings = {
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
  tabAlertRules?: Record<string, {
    keyword?: string;
    sound?: boolean;
    notify?: boolean;
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

const defaultSettings: Settings = {
  twitchToken: "",
  twitchUsername: "",
  twitchGuest: false,
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
  tabAlertRules: {},
  hideCommands: false,
  keywordFilters: [],
  highlightKeywords: []
};

const hasTikTokSession = (settings: Settings) =>
  Boolean((settings.tiktokSessionId ?? "").trim() && (settings.tiktokTtTargetIdc ?? "").trim());
const normalizeUserKey = (value: string) => value.trim().toLowerCase();
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

const isTwitchMentionForUser = (message: ChatMessage, twitchUsername?: string) => {
  if (message.platform !== "twitch") return false;
  const username = (twitchUsername ?? "").trim().replace(/^@+/, "");
  if (!username) return false;
  if (normalizeUserKey(message.username) === normalizeUserKey(username)) return false;
  const text = message.message ?? "";
  if (!text.trim()) return false;

  const escaped = escapeRegExp(username);
  const mentionPattern = new RegExp(`(^|\\W)@?${escaped}(\\W|$)`, "i");
  return mentionPattern.test(text);
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
      ? true
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
  if (value === "twitch") return "T";
  if (value === "kick") return "K";
  if (value === "youtube") return "Y";
  if (value === "tiktok") return "Ti";
  return "?";
};

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

export const App: React.FC = () => {
  if (mode === "viewer") {
    return <ViewerView />;
  }
  return <MainApp />;
};

const ViewerView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>("");

  useEffect(() => {
    const handler = (event: MessageEvent<ChatMessage>) => {
      setMessages((prev) => [...prev.slice(-300), event.data]);
    };
    broadcast.addEventListener("message", handler);
    return () => broadcast.removeEventListener("message", handler);
  }, []);

  const visible = messages.filter((message) => !channelFilter || message.channel === channelFilter);
  const channels = Array.from(new Set(messages.map((message) => message.channel)));

  return (
    <div className="viewer">
      <header>
        <h1>Viewer Mode</h1>
        <div>
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
          <button type="button" onClick={() => window.electronAPI.closeViewer()}>
            Exit
          </button>
        </div>
      </header>
      <div className="viewer-messages">
        {visible.map((message) => (
          <div key={message.id} className="viewer-message">
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
  const [snippetToInsert, setSnippetToInsert] = useState("");

  const [sources, setSources] = useState<ChatSource[]>([]);
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [messagesBySource, setMessagesBySource] = useState<Record<string, ChatMessage[]>>({});
  const [statusBySource, setStatusBySource] = useState<Record<string, ChatAdapterStatus>>({});
  const [globalEmoteMap, setGlobalEmoteMap] = useState<EmoteMap>({});
  const [channelEmoteMapBySourceId, setChannelEmoteMapBySourceId] = useState<Record<string, EmoteMap>>({});
  const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [userLogTarget, setUserLogTarget] = useState<UserLogTarget | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [newestLocked, setNewestLocked] = useState(true);
  const [lockCutoffTimestamp, setLockCutoffTimestamp] = useState<number | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const adaptersRef = useRef<Map<string, ChatAdapter>>(new Map());
  const lastMessageByUser = useRef<Map<string, number>>(new Map());
  const emoteFetchInFlight = useRef<Set<string>>(new Set());
  const channelEmoteMapBySourceIdRef = useRef<Record<string, EmoteMap>>({});
  const mentionAudioContextRef = useRef<AudioContext | null>(null);
  const lastMentionAlertAtRef = useRef(0);
  const spamFilterRef = useRef<Map<string, number>>(new Map());
  const tabsRef = useRef<ChatTab[]>([]);
  const sourceByIdRef = useRef<Map<string, ChatSource>>(new Map());
  const lastTabAlertAtRef = useRef<Map<string, number>>(new Map());

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
        setTabAlertKeywordInput((nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.keyword ?? "").trim());
        setTabAlertSound(nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.sound !== false);
        setTabAlertNotify(nextSettings.tabAlertRules?.[saved.sessionActiveTabId ?? ""]?.notify !== false);

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

        if (restoredSources.length > 0) {
          void connectRestoredSources(restoredSources, nextSettings);
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
  }, [tabs]);

  useEffect(() => {
    let cancelled = false;
    if (settings.performanceMode) {
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
  }, [settings.performanceMode]);

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
    let cancelled = false;
    if (settings.performanceMode) return;
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
  }, [channelEmoteMapBySourceId, settings.performanceMode, settings.twitchClientId, settings.twitchToken, sources]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = `${event.ctrlKey ? "Control+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key.toUpperCase()}`;
      if (key === hotkeys.focusSearch.toUpperCase()) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    return () => {
      adaptersRef.current.forEach((adapter) => {
        void adapter.disconnect();
      });
      adaptersRef.current.clear();
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
  const activeTabSources = useMemo(
    () => (activeTab ? activeTab.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as ChatSource[] : []),
    [activeTab, sourceById]
  );
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
  const youtubeAlphaEnabled = Boolean(settings.youtubeAlphaEnabled);
  const tiktokAlphaEnabled = Boolean(settings.tiktokAlphaEnabled);
  const availablePlatforms = useMemo(() => {
    const next: Platform[] = [];
    if (settings.twitchToken || settings.twitchGuest) {
      next.push("twitch");
    }
    next.push("kick");
    if (youtubeAlphaEnabled) {
      next.push("youtube");
    }
    if (tiktokAlphaEnabled) {
      next.push("tiktok");
    }
    return next;
  }, [settings.twitchGuest, settings.twitchToken, tiktokAlphaEnabled, youtubeAlphaEnabled]);

  const activeMessages = useMemo(() => {
    if (!activeTab) return [];
    const merged = activeTab.sourceIds.flatMap((sourceId) => messagesBySource[sourceId] ?? []);
    const filtered = merged.filter((message) =>
      search ? message.message.toLowerCase().includes(search.toLowerCase()) : true
    );
    const sorted = filtered.sort((a, b) => messageTimestamp(a) - messageTimestamp(b));
    return collapseFanoutLocalEchoes(sorted);
  }, [activeTab, messagesBySource, search]);

  const replayFilteredMessages = useMemo(() => {
    if (replayWindow <= 0) return activeMessages;
    const cutoff = Date.now() - replayWindow * 60 * 1000;
    return activeMessages.filter((message) => messageTimestamp(message) >= cutoff);
  }, [activeMessages, replayWindow]);

  const visibleMessages = useMemo(() => {
    if (newestLocked || lockCutoffTimestamp === null) return replayFilteredMessages;
    return replayFilteredMessages.filter((message) => messageTimestamp(message) <= lockCutoffTimestamp);
  }, [replayFilteredMessages, lockCutoffTimestamp, newestLocked]);

  const pendingNewestCount = useMemo(() => {
    if (newestLocked) return 0;
    return Math.max(0, replayFilteredMessages.length - visibleMessages.length);
  }, [newestLocked, replayFilteredMessages.length, visibleMessages.length]);

  const chatHealth = useMemo(() => {
    const now = Date.now();
    const oneMinute = now - 60_000;
    const fiveMinutes = now - 5 * 60_000;
    const messagesPerMinute = replayFilteredMessages.filter((message) => messageTimestamp(message) >= oneMinute).length;
    const uniqueChatters = new Set(
      replayFilteredMessages
        .filter((message) => messageTimestamp(message) >= fiveMinutes)
        .map((message) => normalizeUserKey(message.username))
    ).size;
    return { messagesPerMinute, uniqueChatters };
  }, [replayFilteredMessages]);

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

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (!newestLocked) return;
    const raf = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeMessages, newestLocked]);

  const composerPlaceholder =
    writableActiveTabSources.length === 0
      ? "Read-only for YouTube/TikTok in this build"
      : sendTargetId === SEND_TARGET_TAB_ALL && writableActiveTabSources.length > 1
        ? `Type a message to all ${writableActiveTabSources.length} chats in this tab`
        : "Type a message";

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
      setStatusBySource((prev) => ({ ...prev, [source.id]: status }));
    });

    adapter.onMessage((message) => {
      const now = Date.now();
      const userKey = `${message.platform}-${message.channel}-${message.username}`;
      const last = lastMessageByUser.current.get(userKey) ?? 0;
      if (now - last < 400) return;
      lastMessageByUser.current.set(userKey, now);

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

      setMessagesBySource((prev) => {
        const maxHistory = currentSettings.performanceMode ? 300 : 800;
        const updated = [...(prev[source.id] ?? []), message].slice(-maxHistory);
        return { ...prev, [source.id]: updated };
      });

      if (isTwitchMentionForUser(message, currentSettings.twitchUsername)) {
        if (now - lastMentionAlertAtRef.current > 1000) {
          lastMentionAlertAtRef.current = now;
          triggerAttention(
            `Twitch mention in #${message.channel}`,
            `${message.displayName}: ${message.message}`,
            `mention:${message.channel}`
          );
        }
      }

      const tabRules = currentSettings.tabAlertRules ?? {};
      const sourceTabs = tabsRef.current.filter((tab) => tab.sourceIds.includes(source.id));
      for (const tab of sourceTabs) {
        const rule = tabRules[tab.id];
        const keyword = (rule?.keyword ?? "").trim();
        if (!keyword) continue;
        if (!message.message.toLowerCase().includes(keyword.toLowerCase())) continue;
        triggerAttention(
          `Tab alert in ${source.platform}/${source.channel}`,
          `${message.displayName}: ${message.message}`,
          `tab:${tab.id}:${keyword.toLowerCase()}`,
          rule?.sound !== false,
          rule?.notify !== false
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
    try {
      await adapter.connect();
    } catch (error) {
      setStatusBySource((prev) => ({ ...prev, [source.id]: "error" }));
      const text = error instanceof Error ? error.message : String(error);
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
    }
  };

  const addChannelTab = async () => {
    const channel = normalizeChannel(channelInput, platformInput);
    if (!channel) return;

    if (platformInput === "twitch" && !hasAuthForPlatform("twitch", settings)) {
      setAuthMessage(`Sign in to twitch before opening twitch/${channel}.`);
      return;
    }

    let key = `${platformInput}:${channel}`;
    let liveChatId: string | undefined;
    let youtubeChannelId: string | undefined;
    let youtubeVideoId: string | undefined;

    if (platformInput === "youtube") {
      try {
        const resolved = await window.electronAPI.resolveYouTubeLiveChat(channel);
        key = `${platformInput}:${resolved.channelId}:${resolved.liveChatId}`;
        liveChatId = resolved.liveChatId;
        youtubeChannelId = resolved.channelId;
        youtubeVideoId = resolved.videoId;
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : String(error));
        return;
      }
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
      platform: platformInput,
      channel,
      key,
      liveChatId,
      youtubeChannelId,
      youtubeVideoId
    };

    if (!existingSource) {
      setSources((prev) => [...prev, source]);
      await ensureAdapterConnected(source, settings);
    }

    const tab: ChatTab = {
      id: createId(),
      sourceIds: [source.id]
    };

    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setChannelInput("");
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

    for (const source of orphaned) {
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

  const checkForUpdatesNow = async () => {
    try {
      const status = await window.electronAPI.checkForUpdates();
      if (status.message) {
        setAuthMessage(status.message);
      } else {
        setAuthMessage("Checking for updates...");
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    }
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
    const username = message.username.trim();
    if (!username || username === "system") {
      setAuthMessage("This message cannot be moderated.");
      return;
    }

    const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
    if (!source) {
      setAuthMessage("Cannot map this message to a connected chat source.");
      return;
    }

    const adapter = adaptersRef.current.get(source.id);
    if (!adapter) {
      setAuthMessage("Chat connection is not ready for moderator commands.");
      return;
    }
    if (source.platform === "youtube" || source.platform === "tiktok") {
      const platformLabel = source.platform === "youtube" ? "YouTube" : "TikTok";
      setAuthMessage(`${platformLabel} moderation actions are not supported in this build.`);
      return;
    }

    let command = "";
    if (action === "timeout_60") {
      command = `/timeout ${username} 60`;
    } else if (action === "timeout_600") {
      command = `/timeout ${username} 600`;
    } else if (action === "ban") {
      command = `/ban ${username}`;
    } else if (action === "unban") {
      command = `/unban ${username}`;
    } else if (action === "delete") {
      const messageId = getRawMessageId(message);
      if (!messageId || message.platform !== "twitch") {
        setAuthMessage("Delete message is currently supported for Twitch messages with ids only.");
        return;
      }
      command = `/delete ${messageId}`;
    }

    const appendModeratorSystemMessage = (text: string) => {
      const systemMessage: ChatMessage = {
        id: `system-${source.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        platform: source.platform,
        channel: source.channel,
        username: "system",
        displayName: "System",
        message: text,
        timestamp: new Date().toISOString(),
        color: "#f08a65"
      };
      setMessagesBySource((prev) => {
        const updated = [...(prev[source.id] ?? []), systemMessage].slice(-800);
        return { ...prev, [source.id]: updated };
      });
      broadcast.postMessage(systemMessage);
    };

    try {
      await adapter.sendMessage(command);
      setMessageMenu(null);
      if (action === "ban") {
        appendModeratorSystemMessage(`${message.displayName || username} was banned.`);
        setAuthMessage(`${message.displayName || username} was banned in ${source.platform}/${source.channel}.`);
        return;
      }
      if (action === "unban") {
        appendModeratorSystemMessage(`${message.displayName || username} was unbanned.`);
        setAuthMessage(`${message.displayName || username} was unbanned in ${source.platform}/${source.channel}.`);
        return;
      }
      setAuthMessage(`Moderator action sent in ${source.platform}/${source.channel}.`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
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

    if (
      settings.confirmSendAll !== false &&
      sendTargetId === SEND_TARGET_TAB_ALL &&
      targetSourceIds.length > 1 &&
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

  const runQuickMod = async (action: Exclude<ModeratorAction, "delete">) => {
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

    const command =
      action === "timeout_60"
        ? `/timeout ${username} 60`
        : action === "timeout_600"
          ? `/timeout ${username} 600`
          : action === "ban"
            ? `/ban ${username}`
            : `/unban ${username}`;

    const results = await Promise.all(
      targetIds.map(async (sourceId) => {
        const adapter = adaptersRef.current.get(sourceId);
        if (!adapter) return false;
        try {
          await adapter.sendMessage(command);
          return true;
        } catch {
          return false;
        }
      })
    );
    const ok = results.filter(Boolean).length;
    setAuthMessage(ok > 0 ? `Quick mod sent to ${ok}/${targetIds.length} chats.` : "Quick mod failed.");
  };

  const jumpToNewest = () => {
    setNewestLocked(true);
    setLockCutoffTimestamp(null);
    const list = messageListRef.current;
    if (!list) return;
    window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  };

  const signInTwitch = async () => {
    setAuthBusy("twitch");
    setAuthMessage("");
    try {
      const next = await window.electronAPI.signInTwitch();
      setSettings({ ...defaultSettings, ...next });
      const mode = next.twitchGuest ? "guest mode" : "oauth";
      setAuthMessage(`Signed in to Twitch as ${next.twitchUsername ?? "unknown user"} (${mode}).`);
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
      setSettings({ ...defaultSettings, ...next });
      const mode = next.kickGuest ? "guest mode" : "oauth";
      setAuthMessage(`Signed in to Kick as ${next.kickUsername ?? "unknown user"} (${mode}).`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthBusy(null);
    }
  };

  const signOutTwitch = async () => {
    const next = await window.electronAPI.signOutTwitch();
    setSettings({ ...defaultSettings, ...next });
  };

  const signOutKick = async () => {
    const next = await window.electronAPI.signOutKick();
    setSettings({ ...defaultSettings, ...next });
  };

  useEffect(() => {
    if (!sessionHydrated || sources.length === 0) return;
    for (const source of sources) {
      if (source.platform === "twitch" && !hasAuthForPlatform("twitch", settings)) continue;
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
  }, [activeTabId, settings.tabAlertRules]);

  const persistSettings = async (updates: Partial<Settings>) => {
    const next = await window.electronAPI.setSettings(updates as Settings);
    setSettings({ ...defaultSettings, ...next });
  };

  const saveCurrentTabAlertRule = async () => {
    if (!activeTabId) return;
    const nextRules = {
      ...(settings.tabAlertRules ?? {}),
      [activeTabId]: {
        keyword: tabAlertKeywordInput.trim(),
        sound: tabAlertSound,
        notify: tabAlertNotify
      }
    };
    await persistSettings({ tabAlertRules: nextRules });
    setAuthMessage("Tab alert rule saved.");
  };

  useEffect(() => {
    if (!activeTab || writableActiveTabSources.length === 0) {
      setSendTargetId(SEND_TARGET_TAB_ALL);
      return;
    }

    const validSourceIds = writableActiveTabSources.map((source) => source.id);
    const defaultTarget = validSourceIds.length === 1 ? validSourceIds[0] : SEND_TARGET_TAB_ALL;

    setSendTargetId((previous) => {
      if (previous === SEND_TARGET_TAB_ALL) {
        return validSourceIds.length > 1 ? SEND_TARGET_TAB_ALL : validSourceIds[0];
      }
      return validSourceIds.includes(previous) ? previous : defaultTarget;
    });
  }, [activeTab, writableActiveTabSources]);

  useEffect(() => {
    setNewestLocked(true);
    setLockCutoffTimestamp(null);
  }, [activeTabId]);

  useEffect(() => {
    return window.electronAPI.onUpdateStatus((status) => {
      if (!status.message || status.state === "idle") return;
      setAuthMessage(status.message);
    });
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {
        // no-op
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="login-gate">
        <div className="login-card">
          <h1>MultiChat</h1>
          <p>Loading your local profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="chat-shell"
      onClick={() => {
        setTabMenu(null);
        setMessageMenu(null);
      }}
    >
      <header className="topbar">
        <div className="brand-block">
          <h1>MultiChat</h1>
          <p>Unified chat desk</p>
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
            value={channelInput}
            onChange={(event) => setChannelInput(event.target.value)}
            placeholder="Type channel username and press Enter"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button type="submit">Open Tab</button>
        </form>
        <div className="top-actions">
          <details className="menu-dropdown">
            <summary>Menu</summary>
            <div className="menu-dropdown-panel">
              <div className="menu-group">
                <strong>View</strong>
                <button type="button" onClick={() => window.electronAPI.openViewer()}>
                  Open Viewer
                </button>
                <label className="menu-inline">
                  Replay
                  <select value={replayWindow} onChange={(event) => setReplayWindow(Number(event.target.value) as ReplayWindow)}>
                    <option value={0}>All</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </label>
              </div>
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
              </div>
              <div className="menu-group">
                <strong>Filters</strong>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.smartFilterSpam !== false}
                    onChange={(event) => void persistSettings({ smartFilterSpam: event.target.checked })}
                  />
                  Smart spam filter
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.smartFilterScam !== false}
                    onChange={(event) => void persistSettings({ smartFilterScam: event.target.checked })}
                  />
                  Scam phrase filter
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={settings.performanceMode === true}
                    onChange={(event) => void persistSettings({ performanceMode: event.target.checked })}
                  />
                  Performance mode
                </label>
              </div>
              <div className="menu-group">
                <strong>Current Tab Alerts</strong>
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
                <button type="button" onClick={() => void saveCurrentTabAlertRule()} disabled={!activeTabId}>
                  Save tab alert
                </button>
              </div>
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
                <button type="button" onClick={() => void checkForUpdatesNow()}>
                  Check for Updates
                </button>
              </div>
            </div>
          </details>
        </div>
      </header>

      <div className="account-strip">
        <span className={settings.twitchToken || settings.twitchGuest ? "account-pill on" : "account-pill"}>
          <PlatformIcon platform="twitch" />
          Twitch: {settings.twitchUsername || "off"}
        </span>
        <span className={settings.kickAccessToken ? "account-pill on" : "account-pill"}>
          <PlatformIcon platform="kick" />
          Kick typing: {settings.kickUsername || "off"}
        </span>
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
      </div>

      <nav className="tabbar">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const tabSources = tab.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as ChatSource[];
          const firstSource = tabSources[0];
          const label = tabLabel(tab, sourceById);
          return (
            <div
              key={tab.id}
              className={active ? "tab active" : "tab"}
              onContextMenu={(event) => {
                event.preventDefault();
                setTabMenu({ x: event.clientX, y: event.clientY, tabId: tab.id });
              }}
            >
              <button type="button" className="tab-select" onClick={() => setActiveTabId(tab.id)}>
                {firstSource ? <PlatformIcon platform={firstSource.platform} /> : null}
                <span>{label}</span>
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
        <input
          ref={searchRef}
          type="search"
          placeholder="Search in active tab"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span>
          {activeTab
            ? newestLocked
              ? `${visibleMessages.length} messages · ${chatHealth.messagesPerMinute}/min · ${chatHealth.uniqueChatters} chatters`
              : `${visibleMessages.length} messages (${pendingNewestCount} new paused) · ${chatHealth.messagesPerMinute}/min · ${chatHealth.uniqueChatters} chatters`
            : "Open a channel tab to start"}
        </span>
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
                return (
                  <span key={source.id} className={`source-chip ${status}`}>
                    <PlatformIcon platform={source.platform} />
                    <span>{source.platform}/{source.channel} ({status})</span>
                  </span>
                );
              })}
            </div>
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
              {visibleMessages.map((message) => {
                const highlighted = settings.highlightKeywords?.some((word) =>
                  message.message.toLowerCase().includes(word.toLowerCase())
                );
                const source = sourceByPlatformChannel.get(`${message.platform}:${message.channel}`);
                const sourceEmoteMap = source ? channelEmoteMapBySourceId[source.id] : undefined;
                const resolveEmote = (token: string) => sourceEmoteMap?.[token] ?? globalEmoteMap[token];
                const messageChunks = buildMessageChunks(message, resolveEmote);
                const combinedChannels = readCombinedChannels(message);
                const channelLabel =
                  combinedChannels.length > 1
                    ? `#${combinedChannels[0]} +${combinedChannels.length - 1}`
                    : `#${message.channel}`;
                const channelTitle =
                  combinedChannels.length > 1 ? combinedChannels.map((channel) => `#${channel}`).join(", ") : `#${message.channel}`;
                return (
                  <div
                    key={message.id}
                    className={highlighted ? "chat-line highlight" : "chat-line"}
                    onContextMenu={(event) => {
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
                    <button
                      type="button"
                      className="username-button"
                      style={{ color: message.color }}
                      onClick={() =>
                        setIdentityTarget({
                          username: message.username,
                          displayName: message.displayName || message.username
                        })}
                    >
                      {message.displayName}
                    </button>
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
                            loading="lazy"
                          />
                        )
                      )}
                    </span>
                  </div>
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
                onChange={(event) => setComposerText(event.target.value)}
                placeholder={composerPlaceholder}
                maxLength={500}
                disabled={writableActiveTabSources.length === 0}
              />
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
              <button type="submit" disabled={sending || writableActiveTabSources.length === 0 || !composerText.trim()}>
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
            {writableActiveTabSources.length > 0 ? (
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

      {tabMenu ? (
        <div className="context-menu" style={{ top: tabMenu.y, left: tabMenu.x }} onClick={(event) => event.stopPropagation()}>
          <strong>Merge This Tab Into</strong>
          {tabs
            .filter((tab) => tab.id !== tabMenu.tabId)
            .map((tab) => (
              <button key={tab.id} type="button" onClick={() => mergeTabs(tabMenu.tabId, tab.id)}>
                {tabLabel(tab, sourceById)}
              </button>
            ))}
          {tabs.filter((tab) => tab.id !== tabMenu.tabId).length === 0 ? <span>No merge targets</span> : null}
          <button type="button" onClick={() => setTabMenu(null)}>
            Close
          </button>
        </div>
      ) : null}

      {messageMenu ? (
        <div
          className="context-menu"
          style={{ top: messageMenu.y, left: messageMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <strong>Moderation</strong>
          <button type="button" onClick={() => void runModeratorAction("timeout_60", messageMenu.message)}>
            Timeout 1m
          </button>
          <button type="button" onClick={() => void runModeratorAction("timeout_600", messageMenu.message)}>
            Timeout 10m
          </button>
          <button type="button" onClick={() => void runModeratorAction("ban", messageMenu.message)}>
            Ban user
          </button>
          <button type="button" onClick={() => void runModeratorAction("unban", messageMenu.message)}>
            Unban user
          </button>
          {messageMenu.message.platform === "twitch" ? (
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

      {authMessage ? <p className="floating-status">{authMessage}</p> : null}
    </div>
  );
};
