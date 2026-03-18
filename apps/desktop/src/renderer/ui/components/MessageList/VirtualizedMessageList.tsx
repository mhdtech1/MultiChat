import React, { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessage } from "@chatrix/chat-core";
import { useSettingsStore } from "../../../store";
import { ChatLine } from "./ChatLine";
import { WelcomeScreen } from "../common/WelcomeScreen";

type VirtualizedMessageListProps = {
  messages: ChatMessage[];
  autoScrollEnabled?: boolean;
  onPauseAutoScroll?: () => void;
  onUserActivity?: () => void;
  twitchGlobalBadgeCatalog?: Record<
    string,
    Record<string, { title: string; imageUrl: string }>
  >;
  twitchChannelBadgeCatalogByRoomId?: Record<
    string,
    Record<string, Record<string, { title: string; imageUrl: string }>>
  >;
  onUsernameClick?: (username: string, platform: string) => void;
  onMessageClick?: (message: ChatMessage) => void;
  onAddChannel?: () => void;
  onOpenSettings?: () => void;
};

const ESTIMATED_ROW_HEIGHT = 52;
const OVERSCAN_COUNT = 10;
const SCROLL_BOTTOM_THRESHOLD_PX = 220;

export function VirtualizedMessageList({
  messages,
  autoScrollEnabled = true,
  onPauseAutoScroll,
  onUserActivity,
  twitchGlobalBadgeCatalog,
  twitchChannelBadgeCatalogByRoomId,
  onUsernameClick,
  onMessageClick,
  onAddChannel,
  onOpenSettings,
}: VirtualizedMessageListProps) {
  const showTimestamps = useSettingsStore((state) => state.showTimestamps);
  const showBadges = useSettingsStore((state) => state.showBadges);
  const parentRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const checkIfAtBottom = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isAtBottomRef.current = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    lastScrollTopRef.current = container.scrollTop;
    isAtBottomRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;
    const currentScrollTop = container.scrollTop;
    const previousScrollTop = lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;
    checkIfAtBottom();
    const movedUp = currentScrollTop + 2 < previousScrollTop;
    if (autoScrollEnabled && movedUp && !isAtBottomRef.current) {
      onPauseAutoScroll?.();
      return;
    }
    if (!autoScrollEnabled) {
      onUserActivity?.();
    }
  }, [autoScrollEnabled, checkIfAtBottom, onPauseAutoScroll, onUserActivity]);

  useEffect(() => {
    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (!autoScrollEnabled) return;
    if (isNewMessage && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [autoScrollEnabled, messages.length, scrollToBottom]);

  useEffect(() => {
    if (!autoScrollEnabled) return;
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [autoScrollEnabled, scrollToBottom]);

  return (
    <div className="message-list-container">
      <div
        ref={parentRef}
        className="message-list virtualized"
        onScroll={handleScroll}
        role="list"
        aria-label="Chat messages"
        style={{ overflow: "auto", height: "100%" }}
      >
        {messages.length === 0 ? (
          <WelcomeScreen
            onAddChannel={onAddChannel}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <div
            style={{
              height: `${totalSize}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {items.map((virtualRow) => {
              const message = messages[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ChatLine
                    message={message}
                    showTimestamp={showTimestamps}
                    showBadges={showBadges}
                    twitchGlobalBadgeCatalog={twitchGlobalBadgeCatalog}
                    twitchChannelBadgeCatalogByRoomId={
                      twitchChannelBadgeCatalogByRoomId
                    }
                    onUsernameClick={onUsernameClick}
                    onMessageClick={(chatMessage) => {
                      if (autoScrollEnabled) {
                        onPauseAutoScroll?.();
                      } else {
                        onUserActivity?.();
                      }
                      onMessageClick?.(chatMessage);
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
