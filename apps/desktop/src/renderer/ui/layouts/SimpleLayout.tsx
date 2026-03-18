import type { ChatMessage } from "@chatrix/chat-core";
import { Composer } from "../components/Composer";
import { MessageList } from "../components/MessageList";
import { TabBar } from "../components/TabBar";
import { TopBar } from "../components/TopBar";

type SimpleLayoutProps = {
  messages: ChatMessage[];
  onSend: (message: string) => void;
};

export function SimpleLayout({ messages, onSend }: SimpleLayoutProps) {
  return (
    <div className="chat-shell">
      <TopBar />
      <TabBar tabs={[{ id: "default", label: "Main" }]} activeTabId="default" />
      <main className="main-content">
        <MessageList messages={messages} />
        <Composer onSend={onSend} />
      </main>
    </div>
  );
}
