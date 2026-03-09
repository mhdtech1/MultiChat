type YouTubeWebChatSession = {
  liveChatId: string;
  channelId: string;
  channelTitle: string;
  videoId: string;
  apiKey: string;
  clientVersion: string;
  visitorData?: string;
  continuation: string;
  updatedAt: number;
};

type YouTubeWebMessage = {
  id: string;
  snippet: { displayMessage: string; publishedAt: string };
  authorDetails: {
    channelId: string;
    displayName: string;
    isChatModerator?: boolean;
    isChatOwner?: boolean;
    isChatSponsor?: boolean;
  };
};

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_WEB_FETCH_TIMEOUT_MS = 15_000;
const YOUTUBE_DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const youtubeWebChatSessions = new Map<string, YouTubeWebChatSession>();

const withTimeout = (init: RequestInit = {}): RequestInit => {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(YOUTUBE_WEB_FETCH_TIMEOUT_MS),
    };
  }
  return init;
};

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const normalizeYouTubeInput = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    }
    if (host.includes("youtube.com")) {
      const watchId = parsed.searchParams.get("v")?.trim() ?? "";
      if (watchId) return watchId;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1]) return parts[1].replace(/^@/, "");
      if (parts[0] === "c" && parts[1]) return parts[1].replace(/^@/, "");
      if (parts[0] === "user" && parts[1]) return parts[1].replace(/^@/, "");
      if (parts[0]?.startsWith("@")) return parts[0].slice(1);
      if ((parts[0] === "shorts" || parts[0] === "live") && parts[1])
        return parts[1];
    }
  } catch {
    // Not a URL; fall back to plain-channel parsing.
  }

  const normalized = trimmed.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "");
  const compact = normalized.split(/[?#]/)[0];

  if (compact.startsWith("channel/")) {
    return compact.slice("channel/".length).split("/")[0].replace(/^@/, "");
  }
  if (compact.startsWith("c/")) {
    return compact.slice("c/".length).split("/")[0].replace(/^@/, "");
  }
  if (compact.startsWith("user/")) {
    return compact.slice("user/".length).split("/")[0].replace(/^@/, "");
  }

  return compact.split("/")[0].replace(/^@/, "");
};

const extractYouTubeVideoId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : "";
    }
    if (host.includes("youtube.com")) {
      const watchId = url.searchParams.get("v")?.trim() ?? "";
      if (YOUTUBE_VIDEO_ID_REGEX.test(watchId)) {
        return watchId;
      }
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (
        pathParts[0] === "shorts" &&
        pathParts[1] &&
        YOUTUBE_VIDEO_ID_REGEX.test(pathParts[1])
      ) {
        return pathParts[1];
      }
      if (
        pathParts[0] === "live" &&
        pathParts[1] &&
        YOUTUBE_VIDEO_ID_REGEX.test(pathParts[1])
      ) {
        return pathParts[1];
      }
    }
  } catch {
    // Input may not be a URL.
  }
  const fallbackMatch = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (fallbackMatch?.[1] && YOUTUBE_VIDEO_ID_REGEX.test(fallbackMatch[1])) {
    return fallbackMatch[1];
  }
  return "";
};

const htmlEntityDecode = (value: string) =>
  value
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u0025/g, "%")
    .replace(/\\u002f/g, "/");

const matchFromHtml = (html: string, regex: RegExp): string => {
  const match = html.match(regex);
  return typeof match?.[1] === "string"
    ? htmlEntityDecode(match[1]).trim()
    : "";
};

const parseYouTubeTextRuns = (runs: unknown): string => {
  if (!Array.isArray(runs)) return "";
  return runs
    .map((entry) => {
      const record = asUnknownRecord(entry);
      const text = asString(record?.text);
      if (text) return text;
      const emoji = asUnknownRecord(record?.emoji);
      const shortcuts = Array.isArray(emoji?.shortcuts) ? emoji?.shortcuts : [];
      const shortcut = shortcuts.find((item) => typeof item === "string");
      return typeof shortcut === "string" ? shortcut : "";
    })
    .join("");
};

const parseYouTubeAuthorBadges = (
  badges: unknown,
): {
  isChatOwner?: boolean;
  isChatModerator?: boolean;
  isChatSponsor?: boolean;
} => {
  if (!Array.isArray(badges)) return {};
  let isChatOwner = false;
  let isChatModerator = false;
  let isChatSponsor = false;

  for (const badge of badges) {
    const record = asUnknownRecord(badge);
    const renderer = asUnknownRecord(record?.liveChatAuthorBadgeRenderer);
    if (!renderer) continue;
    const icon = asUnknownRecord(renderer.icon);
    const iconType = asString(icon?.iconType).toLowerCase();
    const tooltip = asString(renderer.tooltip).toLowerCase();

    if (
      iconType.includes("owner") ||
      iconType.includes("broadcaster") ||
      tooltip.includes("owner") ||
      tooltip.includes("broadcaster")
    ) {
      isChatOwner = true;
      isChatModerator = true;
    } else if (
      iconType.includes("moderator") ||
      tooltip.includes("moderator")
    ) {
      isChatModerator = true;
    }

    if (
      iconType.includes("member") ||
      iconType.includes("sponsor") ||
      tooltip.includes("member") ||
      tooltip.includes("sponsor")
    ) {
      isChatSponsor = true;
    }
  }

  return { isChatOwner, isChatModerator, isChatSponsor };
};

const normalizeYouTubeWebActions = (actions: unknown): YouTubeWebMessage[] => {
  if (!Array.isArray(actions)) return [];
  const items: YouTubeWebMessage[] = [];

  for (const action of actions) {
    const record = asUnknownRecord(action);
    const addChatItem = asUnknownRecord(record?.addChatItemAction);
    const item = asUnknownRecord(addChatItem?.item);
    const renderer = asUnknownRecord(item?.liveChatTextMessageRenderer);
    if (!renderer) continue;

    const id = asString(renderer.id).trim();
    const message = parseYouTubeTextRuns(
      asUnknownRecord(renderer.message)?.runs,
    );
    if (!id || !message) continue;

    const authorName =
      asString(asUnknownRecord(renderer.authorName)?.simpleText).trim() ||
      "YouTube user";
    const channelId = asString(renderer.authorExternalChannelId).trim();
    const timestampUsecRaw = Number(asString(renderer.timestampUsec));
    const publishedAt =
      Number.isFinite(timestampUsecRaw) && timestampUsecRaw > 0
        ? new Date(Math.floor(timestampUsecRaw / 1000)).toISOString()
        : new Date().toISOString();
    const badges = parseYouTubeAuthorBadges(renderer.authorBadges);

    items.push({
      id,
      snippet: {
        displayMessage: message,
        publishedAt,
      },
      authorDetails: {
        channelId,
        displayName: authorName,
        ...badges,
      },
    });
  }

  return items;
};

const extractYouTubeWebContinuation = (
  payload: unknown,
): { continuation?: string; pollingIntervalMillis?: number } => {
  const root = asUnknownRecord(payload);
  const continuationContents = asUnknownRecord(root?.continuationContents);
  const liveChatContinuation = asUnknownRecord(
    continuationContents?.liveChatContinuation,
  );
  const continuations = Array.isArray(liveChatContinuation?.continuations)
    ? liveChatContinuation.continuations
    : [];

  for (const entry of continuations) {
    const record = asUnknownRecord(entry);
    const timed = asUnknownRecord(record?.timedContinuationData);
    if (timed) {
      const continuation = asString(timed.continuation).trim();
      const timeoutMs = Number(asString(timed.timeoutMs));
      return {
        continuation: continuation || undefined,
        pollingIntervalMillis:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.max(1000, Math.min(15000, timeoutMs))
            : undefined,
      };
    }
    const invalidation = asUnknownRecord(record?.invalidationContinuationData);
    if (invalidation) {
      const continuation = asString(invalidation.continuation).trim();
      const timeoutMs = Number(asString(invalidation.invalidationTimeoutMs));
      return {
        continuation: continuation || undefined,
        pollingIntervalMillis:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.max(1000, Math.min(15000, timeoutMs))
            : undefined,
      };
    }
    const reload = asUnknownRecord(record?.reloadContinuationData);
    if (reload) {
      const continuation = asString(reload.continuation).trim();
      return { continuation: continuation || undefined };
    }
  }
  return {};
};

const cleanupYouTubeWebSessions = () => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [key, session] of youtubeWebChatSessions.entries()) {
    if (session.updatedAt < cutoff) {
      youtubeWebChatSessions.delete(key);
    }
  }
};

const buildYouTubeLiveUrl = (rawInput: string) => {
  const directVideoId = extractYouTubeVideoId(rawInput);
  if (directVideoId) {
    return `https://www.youtube.com/watch?v=${directVideoId}`;
  }
  const normalized = normalizeYouTubeInput(rawInput);
  if (!normalized) {
    throw new Error("YouTube channel is required.");
  }
  if (normalized.startsWith("UC")) {
    return `https://www.youtube.com/channel/${normalized}/live`;
  }
  return `https://www.youtube.com/@${normalized}/live`;
};

const fetchYouTubeHtml = async (url: string, source: string) => {
  const response = await fetch(
    url,
    withTimeout({
      headers: {
        Accept: "text/html",
        "User-Agent": YOUTUBE_DESKTOP_USER_AGENT,
      },
    }),
  );
  if (!response.ok) {
    throw new Error(`${source} failed (${response.status}).`);
  }
  return {
    html: await response.text(),
    finalUrl: response.url,
  };
};

const findYouTubeLiveVideoViaSearch = async (
  rawInput: string,
): Promise<string> => {
  const query = normalizeYouTubeInput(rawInput) || rawInput.trim();
  if (!query) return "";
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgJAAQ%253D%253D`;
  const { html } = await fetchYouTubeHtml(
    searchUrl,
    "YouTube live search lookup",
  );
  const fromVideoId = matchFromHtml(html, /"videoId":"([A-Za-z0-9_-]{11})"/);
  if (fromVideoId && YOUTUBE_VIDEO_ID_REGEX.test(fromVideoId)) {
    return fromVideoId;
  }
  const fromWatchLink = matchFromHtml(
    html,
    /"url":"\\\/watch\?v=([A-Za-z0-9_-]{11})/,
  );
  if (fromWatchLink && YOUTUBE_VIDEO_ID_REGEX.test(fromWatchLink)) {
    return fromWatchLink;
  }
  return "";
};

export const resolveYouTubeLiveChatViaWeb = async (rawInput: string) => {
  cleanupYouTubeWebSessions();
  const liveUrl = buildYouTubeLiveUrl(rawInput);
  let liveHtml = "";
  let liveFinalUrl = liveUrl;
  try {
    const livePage = await fetchYouTubeHtml(
      liveUrl,
      "YouTube live page lookup",
    );
    liveHtml = livePage.html;
    liveFinalUrl = livePage.finalUrl;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!text.includes("(404)")) {
      throw error;
    }
  }

  const redirectedVideoId = extractYouTubeVideoId(liveFinalUrl);
  const pageVideoId =
    redirectedVideoId ||
    matchFromHtml(
      liveHtml,
      /"canonicalBaseUrl":"\\\/watch\?v=([A-Za-z0-9_-]{11})"/,
    ) ||
    matchFromHtml(liveHtml, /"videoId":"([A-Za-z0-9_-]{11})"/) ||
    (await findYouTubeLiveVideoViaSearch(rawInput));
  if (!pageVideoId) {
    throw new Error(`No active live stream found for ${rawInput}.`);
  }

  const watchUrl = `https://www.youtube.com/watch?v=${pageVideoId}`;
  const watchHtml =
    liveFinalUrl.includes("/watch") &&
    redirectedVideoId === pageVideoId &&
    liveHtml
      ? liveHtml
      : (await fetchYouTubeHtml(watchUrl, "YouTube watch page lookup")).html;

  const apiKey = matchFromHtml(watchHtml, /"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVersion = matchFromHtml(
    watchHtml,
    /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/,
  );
  const visitorData = matchFromHtml(watchHtml, /"VISITOR_DATA":"([^"]+)"/);
  const continuation =
    matchFromHtml(
      watchHtml,
      /"reloadContinuationData":\{"continuation":"([^"]+)"/,
    ) ||
    matchFromHtml(
      watchHtml,
      /"timedContinuationData":\{"timeoutMs":[0-9]+,"continuation":"([^"]+)"/,
    ) ||
    matchFromHtml(
      watchHtml,
      /"invalidationContinuationData":\{"invalidationId":"[^"]+","invalidationTimeoutMs":[0-9]+,"continuation":"([^"]+)"/,
    );
  const channelId = matchFromHtml(watchHtml, /"channelId":"(UC[^"]+)"/);
  const channelTitle =
    matchFromHtml(watchHtml, /"ownerChannelName":"([^"]+)"/) ||
    matchFromHtml(watchHtml, /<meta property="og:title" content="([^"]+)"/) ||
    normalizeYouTubeInput(rawInput);

  if (!apiKey || !clientVersion || !continuation) {
    throw new Error(
      "YouTube read-only web fallback could not extract live chat metadata for this stream.",
    );
  }

  const normalizedChannelId = channelId || normalizeYouTubeInput(rawInput);
  const liveChatId = `web:${pageVideoId}`;
  youtubeWebChatSessions.set(liveChatId, {
    liveChatId,
    channelId: normalizedChannelId,
    channelTitle,
    videoId: pageVideoId,
    apiKey,
    clientVersion,
    visitorData: visitorData || undefined,
    continuation,
    updatedAt: Date.now(),
  });

  return {
    channelId: normalizedChannelId,
    channelTitle,
    videoId: pageVideoId,
    liveChatId,
  };
};

export const fetchYouTubeWebLiveMessages = async (payload: {
  liveChatId: string;
  pageToken?: string;
}) => {
  cleanupYouTubeWebSessions();
  const session = youtubeWebChatSessions.get(payload.liveChatId);
  if (!session) {
    throw new Error(
      "YouTube web chat session expired. Re-open the YouTube tab.",
    );
  }

  const continuation = (
    payload.pageToken?.trim() || session.continuation
  ).trim();
  if (!continuation) {
    throw new Error("YouTube web chat continuation token is missing.");
  }

  const endpoint = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false&key=${encodeURIComponent(session.apiKey)}`;
  const body: Record<string, unknown> = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: session.clientVersion,
        hl: "en",
        gl: "US",
        ...(session.visitorData ? { visitorData: session.visitorData } : {}),
      },
    },
    continuation,
  };

  const response = await fetch(
    endpoint,
    withTimeout({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.youtube.com",
        Referer: `https://www.youtube.com/watch?v=${session.videoId}`,
        "User-Agent": YOUTUBE_DESKTOP_USER_AGENT,
      },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) {
    throw new Error(`YouTube web chat polling failed (${response.status}).`);
  }
  const parsed = (await response.json()) as unknown;
  const root = asUnknownRecord(parsed);
  const liveChatContinuation = asUnknownRecord(
    asUnknownRecord(root?.continuationContents)?.liveChatContinuation,
  );
  const actions = liveChatContinuation?.actions;
  const normalizedItems = normalizeYouTubeWebActions(actions);
  const continuationInfo = extractYouTubeWebContinuation(parsed);
  if (continuationInfo.continuation) {
    session.continuation = continuationInfo.continuation;
  }
  session.updatedAt = Date.now();
  youtubeWebChatSessions.set(payload.liveChatId, session);

  return {
    nextPageToken: continuationInfo.continuation ?? session.continuation,
    pollingIntervalMillis: continuationInfo.pollingIntervalMillis ?? 3000,
    items: normalizedItems,
  };
};
