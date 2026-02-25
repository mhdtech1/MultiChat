import type { ChatMessage } from "@multichat/chat-core";
import { PlatformIcon } from "../common/PlatformIcon";
import { RoleBadge, type RoleType } from "../common/RoleBadge";

type ChatLineProps = {
  message: ChatMessage;
  showTimestamp?: boolean;
  showBadges?: boolean;
  showPlatformIcon?: boolean;
  isHighlighted?: boolean;
  onUsernameClick?: (username: string, platform: string) => void;
  onMessageClick?: (message: ChatMessage) => void;
};

const formatTime = (timestamp: number | string) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

const roleFromBadge = (badge: string): RoleType | null => {
  const key = badge.trim().toLowerCase().split(/[/:]/)[0] ?? "";
  if (key === "broadcaster" || key === "streamer" || key === "owner") return "broadcaster";
  if (key === "moderator" || key === "mod") return "moderator";
  if (key === "vip") return "vip";
  if (key === "subscriber" || key === "sub") return "subscriber";
  if (key === "founder") return "founder";
  if (key === "prime") return "prime";
  if (key === "staff" || key === "admin") return "staff";
  if (key === "verified" || key === "partner") return "verified";
  return null;
};

export function ChatLine({
  message,
  showTimestamp = true,
  showBadges = true,
  showPlatformIcon = true,
  isHighlighted = false,
  onUsernameClick,
  onMessageClick
}: ChatLineProps) {
  return (
    <div className={`chat-line ${isHighlighted ? "chat-line--highlighted" : ""}`} role="listitem" onClick={() => onMessageClick?.(message)}>
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
            style={{ color: message.color || "var(--accent)" }}
            onClick={(event) => {
              event.stopPropagation();
              onUsernameClick?.(message.username, message.platform);
            }}
          >
            {message.displayName || message.username}
          </button>
          {showBadges && message.badges?.length ? (
            <span className="chat-line__badges">
              {message.badges.map((badge) => {
                const role = roleFromBadge(badge);
                return role ? <RoleBadge key={`${message.id}-${badge}`} role={role} size="sm" /> : null;
              })}
            </span>
          ) : null}
          {showTimestamp ? <span className="chat-line__time">{formatTime(message.timestamp)}</span> : null}
        </div>
        <div className="chat-line__message">{message.message}</div>
      </div>
    </div>
  );
}
