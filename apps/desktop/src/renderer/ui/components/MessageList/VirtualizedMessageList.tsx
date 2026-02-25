import React, { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessage } from "@multichat/chat-core";
import { useSettingsStore } from "../../../store";
import { ChatLine } from "./ChatLine";
import { WelcomeScreen } from "../common/WelcomeScreen";

type VirtualizedMessageListProps = {
  messages: ChatMessage[];
  onUsernameClick?: (username: string, platform: string) => void;
  onMessageClick?: (message: ChatMessage) => void;
  onAddChannel?: () => void;
  onOpenSettings?: () => void;
};

const ESTIMATED_ROW_HEIGHT = 32;
const OVERSCAN_COUNT = 10;

export function VirtualizedMessageList({
  messages,
  onUsernameClick,
  onMessageClick,
  onAddChannel,
  onOpenSettings
}: VirtualizedMessageListProps) {
  const showTimestamps = useSettingsStore((state) => state.showTimestamps);
  const showBadges = useSettingsStore((state) => state.showBadges);
  const parentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
    measureElement: (element) => element.getBoundingClientRect().height
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const checkIfAtBottom = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 120;
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    isAtBottomRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    checkIfAtBottom();
  }, [checkIfAtBottom]);

  useEffect(() => {
    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (isNewMessage && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages.length, scrollToBottom]);

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
          <WelcomeScreen onAddChannel={onAddChannel} onOpenSettings={onOpenSettings} />
        ) : (
          <div
            style={{
              height: `${totalSize}px`,
              width: "100%",
              position: "relative"
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
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  <ChatLine
                    message={message}
                    showTimestamp={showTimestamps}
                    showBadges={showBadges}
                    onUsernameClick={onUsernameClick}
                    onMessageClick={onMessageClick}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isAtBottomRef.current && messages.length > 0 ? (
        <button className="scroll-to-bottom" onClick={scrollToBottom} aria-label="Scroll to latest messages">
          ↓ New messages
        </button>
      ) : null}
    </div>
  );
}
