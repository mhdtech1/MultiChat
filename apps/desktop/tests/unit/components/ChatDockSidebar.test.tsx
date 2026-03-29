import type { ChatMessage } from "@chatrix/chat-core";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatDockSidebar } from "../../../src/renderer/ui/components/Shell/ChatDockSidebar";

const resultMessage: ChatMessage = {
  id: "msg-1",
  platform: "twitch",
  channel: "mazen",
  username: "viewer",
  displayName: "Viewer",
  message: "hello from search results",
  timestamp: "2024-01-15T12:00:00Z",
};

describe("ChatDockSidebar", () => {
  it("renders mentions, search results, and user card sections", () => {
    const onOpenMention = vi.fn();
    const onOpenGlobalSearchResult = vi.fn();

    render(
      <ChatDockSidebar
        showMentions
        mentionInbox={[
          {
            id: "mention-1",
            platform: "twitch",
            channel: "mazen",
            reason: "mention",
            displayName: "Viewer",
          },
        ]}
        onOpenMention={onOpenMention}
        platformIconGlyph={(platform) => platform[0].toUpperCase()}
        showGlobalTimeline
        globalSearchMode
        search="hello"
        globalSearchResults={[resultMessage]}
        onOpenGlobalSearchResult={onOpenGlobalSearchResult}
        isAdvancedMode
        showModHistory
        moderationHistory={[
          {
            id: "mod-1",
            at: "2024-01-15T12:01:00Z",
            action: "ban",
            target: "viewer",
          },
        ]}
        showUserCard
        identityTarget={{ username: "viewer", displayName: "Viewer" }}
        identityStats={{ total: 4, inLastMinute: 2, inLastFiveMinutes: 3 }}
      />,
    );

    expect(screen.getByText("Mentions")).toBeInTheDocument();
    expect(screen.getByText("Global Timeline")).toBeInTheDocument();
    expect(screen.getByText("Mod History")).toBeInTheDocument();
    expect(screen.getByText("User Card")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /viewer/i })[0]!);
    expect(onOpenMention).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: /hello from search results/i }),
    );
    expect(onOpenGlobalSearchResult).toHaveBeenCalledWith(resultMessage);
  });

  it("stays hidden when every dock section is empty or disabled", () => {
    const { container } = render(
      <ChatDockSidebar
        showMentions={false}
        mentionInbox={[]}
        onOpenMention={vi.fn()}
        platformIconGlyph={(platform) => platform[0].toUpperCase()}
        showGlobalTimeline={false}
        globalSearchMode={false}
        search=""
        globalSearchResults={[]}
        onOpenGlobalSearchResult={vi.fn()}
        isAdvancedMode={false}
        showModHistory={false}
        moderationHistory={[]}
        showUserCard={false}
        identityTarget={null}
        identityStats={{ total: 0, inLastMinute: 0, inLastFiveMinutes: 0 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
