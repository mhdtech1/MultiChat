import type { ChatMessage } from "@multichat/chat-core";
import { useSettingsStore } from "../../../store";
import { ChatLine } from "./ChatLine";
import { WelcomeScreen } from "../common/WelcomeScreen";

type MessageListProps = {
  messages: ChatMessage[];
  onUsernameClick?: (username: string, platform: string) => void;
  onMessageClick?: (message: ChatMessage) => void;
};

export function MessageList({
  messages,
  onUsernameClick,
  onMessageClick,
}: MessageListProps) {
  const showTimestamps = useSettingsStore((state) => state.showTimestamps);
  const showBadges = useSettingsStore((state) => state.showBadges);

  if (messages.length === 0) {
    return (
      <div className="message-list" role="list">
        <WelcomeScreen />
      </div>
    );
  }

  return (
    <div className="message-list" role="list" aria-label="Chat messages">
      {messages.map((message) => (
        <ChatLine
          key={message.id}
          message={message}
          showTimestamp={showTimestamps}
          showBadges={showBadges}
          onUsernameClick={onUsernameClick}
          onMessageClick={onMessageClick}
        />
      ))}
    </div>
  );
}
