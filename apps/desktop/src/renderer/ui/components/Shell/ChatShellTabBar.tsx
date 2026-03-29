import type { MouseEvent } from "react";
import type { Platform } from "../../../../shared/types";
import { PlatformIcon } from "../common/PlatformIcon";

export type ChatShellTabItem = {
  id: string;
  label: string;
  platform?: Platform;
  group?: string;
  groupMuted: boolean;
  active: boolean;
  unreadCount: number;
  mentionCount: number;
};

export type ChatShellTabBarProps = {
  items: ChatShellTabItem[];
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (tabId: string, position: { x: number; y: number }) => void;
};

export function ChatShellTabBar({
  items,
  onSelect,
  onClose,
  onContextMenu,
}: ChatShellTabBarProps) {
  return (
    <nav className="tabbar nav-strip">
      {items.map((item) => (
        <div
          key={item.id}
          className={
            item.active
              ? `tab active${item.groupMuted ? " muted" : ""}`
              : `tab${item.groupMuted ? " muted" : ""}`
          }
          onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            onContextMenu(item.id, {
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          <button
            type="button"
            className="tab-select"
            onClick={() => onSelect(item.id)}
          >
            {item.platform ? (
              <PlatformIcon platform={item.platform} size="sm" showBackground />
            ) : null}
            <span>{item.label}</span>
            {item.group ? (
              <span className="tab-badge group">{item.group}</span>
            ) : null}
            {!item.active && (item.mentionCount > 0 || item.unreadCount > 0) ? (
              <span className="tab-badges">
                {item.mentionCount > 0 ? (
                  <span
                    className="tab-badge mention"
                    title={`${item.mentionCount} mention${item.mentionCount === 1 ? "" : "s"}`}
                  >
                    @{item.mentionCount > 99 ? "99+" : item.mentionCount}
                  </span>
                ) : null}
                {item.unreadCount > 0 ? (
                  <span
                    className="tab-badge unread"
                    title={`${item.unreadCount} unread message${item.unreadCount === 1 ? "" : "s"}`}
                  >
                    {item.unreadCount > 999 ? "999+" : item.unreadCount}
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
              onClose(item.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </nav>
  );
}
