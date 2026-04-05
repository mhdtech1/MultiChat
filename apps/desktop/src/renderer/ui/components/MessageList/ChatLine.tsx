import type { ReactNode } from "react";
import type { ChatMessage } from "@chatrix/chat-core";
import { PlatformIcon } from "../common/PlatformIcon";
import { RoleBadge, type RoleType } from "../common/RoleBadge";

type TwitchBadgeAsset = {
  title: string;
  imageUrl: string;
};

type TwitchBadgeCatalog = Record<string, Record<string, TwitchBadgeAsset>>;

const MESSAGE_LINK_REGEX = /(?:https?:\/\/|www\.)[^\s<]+/gi;

const isSafeCssColor = (value: string): boolean =>
  /^#(?:[0-9a-fA-F]{3,4}){1,2}$|^(?:rgb|hsl)a?\([\d\s,./%]+\)$|^[a-zA-Z]{1,30}$/.test(
    value,
  );

type ChatLineProps = {
  message: ChatMessage;
  showTimestamp?: boolean;
  showBadges?: boolean;
  showPlatformIcon?: boolean;
  isHighlighted?: boolean;
  twitchGlobalBadgeCatalog?: TwitchBadgeCatalog;
  twitchChannelBadgeCatalogByRoomId?: Record<string, TwitchBadgeCatalog>;
  onUsernameClick?: (username: string, platform: string) => void;
  onMessageClick?: (message: ChatMessage) => void;
};

const formatTime = (timestamp: number | string) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const roleFromBadge = (badge: string): RoleType | null => {
  const key = badge.trim().toLowerCase().split(/[/:]/)[0] ?? "";
  if (key === "broadcaster" || key === "streamer" || key === "owner")
    return "broadcaster";
  if (key === "moderator" || key === "mod") return "moderator";
  if (key === "vip") return "vip";
  if (key === "subscriber" || key === "sub") return "subscriber";
  if (key === "founder") return "founder";
  if (key === "prime") return "prime";
  if (key === "staff" || key === "admin") return "staff";
  if (key === "verified" || key === "partner") return "verified";
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const extractTwitchRoomId = (message: ChatMessage): string | null => {
  if (message.platform !== "twitch") return null;
  const raw = asRecord(message.raw);
  const roomId = typeof raw?.["room-id"] === "string" ? raw["room-id"] : "";
  return roomId.trim() || null;
};

const getTwitchBadgeEntries = (message: ChatMessage): { setId: string; versionId: string; key: string }[] => {
  const raw = asRecord(message.raw);
  if (Array.isArray(raw?.parsedBadges)) {
    return raw.parsedBadges as { setId: string; versionId: string; key: string }[];
  }
  return [];
};

const splitTrailingLinkText = (value: string) => {
  const match = value.match(/^(.*?)([)\]}.,!?;:'"`]+)$/);
  if (!match || !match[1]) {
    return {
      linkText: value,
      trailingText: "",
    };
  }
  return {
    linkText: match[1],
    trailingText: match[2],
  };
};

const normalizeMessageLinkHref = (value: string) =>
  value.trim().toLowerCase().startsWith("www.")
    ? `https://${value.trim()}`
    : value.trim();

const renderTextWithLinks = (text: string, keyPrefix: string): ReactNode[] => {
  if (!text) return [];

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(MESSAGE_LINK_REGEX)) {
    const rawMatch = match[0] ?? "";
    const start = match.index ?? -1;
    if (!rawMatch || start < 0) continue;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    const { linkText, trailingText } = splitTrailingLinkText(rawMatch);
    if (linkText) {
      parts.push(
        <a
          key={`${keyPrefix}-link-${matchIndex}`}
          className="chat-message-link"
          href={normalizeMessageLinkHref(linkText)}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
        >
          {linkText}
        </a>,
      );
      matchIndex += 1;
    }
    if (trailingText) {
      parts.push(trailingText);
    }
    lastIndex = start + rawMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

export function ChatLine({
  message,
  showTimestamp = true,
  showBadges = true,
  showPlatformIcon = true,
  isHighlighted = false,
  twitchGlobalBadgeCatalog = {},
  twitchChannelBadgeCatalogByRoomId = {},
  onUsernameClick,
  onMessageClick,
}: ChatLineProps) {
  const twitchBadgeEntries =
    message.platform === "twitch" ? getTwitchBadgeEntries(message) : [];
  const twitchRoomId =
    message.platform === "twitch" ? extractTwitchRoomId(message) : null;
  const twitchRoomCatalog = twitchRoomId
    ? twitchChannelBadgeCatalogByRoomId[twitchRoomId]
    : undefined;
  const renderedTwitchSetIds = new Set<string>();
  const fallbackBadgeValues =
    (message.badges?.length
      ? message.badges
      : twitchBadgeEntries.map((badge) => badge.key)) ?? [];
  const hasAnyBadges =
    (message.badges?.length ?? 0) > 0 || twitchBadgeEntries.length > 0;

  return (
    <div
      className={`chat-line ${isHighlighted ? "chat-line--highlighted" : ""}`}
      data-platform={message.platform}
      role="listitem"
      onClick={() => onMessageClick?.(message)}
    >
      {showPlatformIcon ? (
        <div className="chat-line__platform">
          <PlatformIcon platform={message.platform} size="sm" showBackground />
        </div>
      ) : null}
      <div className="chat-line__content">
        <div className="chat-line__header">
          <button
            type="button"
            className="chat-line__author"
            style={{
              color:
                message.color && isSafeCssColor(message.color)
                  ? message.color
                  : "var(--accent)",
            }}
            onClick={(event) => {
              event.stopPropagation();
              onUsernameClick?.(message.username, message.platform);
            }}
          >
            {message.displayName || message.username}
          </button>
          {showBadges && hasAnyBadges ? (
            <span className="chat-line__badges">
              {twitchBadgeEntries.map((badge) => {
                const asset =
                  twitchRoomCatalog?.[badge.setId]?.[badge.versionId] ??
                  twitchGlobalBadgeCatalog?.[badge.setId]?.[badge.versionId];
                if (!asset) return null;
                renderedTwitchSetIds.add(badge.setId);
                return (
                  <img
                    key={`${message.id}-${badge.key}`}
                    className="chat-line__badge-image"
                    src={asset.imageUrl}
                    alt=""
                    title={asset.title}
                    loading="lazy"
                    decoding="async"
                  />
                );
              })}
              {fallbackBadgeValues.map((badge) => {
                const setId = badge.trim().toLowerCase().split(/[/:]/)[0] ?? "";
                if (renderedTwitchSetIds.has(setId)) return null;
                const role = roleFromBadge(badge);
                return role ? (
                  <RoleBadge
                    key={`${message.id}-${badge}`}
                    role={role}
                    size="sm"
                  />
                ) : null;
              })}
            </span>
          ) : null}
          {showTimestamp ? (
            <span className="chat-line__time">
              {formatTime(message.timestamp)}
            </span>
          ) : null}
        </div>
        <div className="chat-line__message">
          {renderTextWithLinks(message.message, `${message.id}-body`)}
        </div>
      </div>
    </div>
  );
}
