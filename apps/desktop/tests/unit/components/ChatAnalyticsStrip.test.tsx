import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatAnalyticsStrip } from "../../../src/renderer/ui/components/Shell/ChatAnalyticsStrip";

describe("ChatAnalyticsStrip", () => {
  it("shows the primary analytics summary and expandable details", () => {
    const onCloseDetailsMenu = vi.fn();

    render(
      <ChatAnalyticsStrip
        show
        messagesPerMinute={12}
        activeChatters={7}
        mentionRatePerMinute={3}
        modActionRatePerMinute={2}
        onCloseDetailsMenu={onCloseDetailsMenu}
      />,
    );

    expect(screen.getByText("Live: 12/min")).toBeInTheDocument();
    expect(screen.getByText("Chatters: 7")).toBeInTheDocument();
    expect(screen.getByText("More stats")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close stats menu/i }));
    expect(onCloseDetailsMenu).toHaveBeenCalledTimes(1);
  });

  it("keeps the strip compact when there are no overflow analytics", () => {
    render(
      <ChatAnalyticsStrip
        show
        messagesPerMinute={5}
        activeChatters={2}
        mentionRatePerMinute={0}
        modActionRatePerMinute={0}
        onCloseDetailsMenu={vi.fn()}
      />,
    );

    expect(screen.getByText("Live: 5/min")).toBeInTheDocument();
    expect(screen.queryByText("More stats")).not.toBeInTheDocument();
  });
});
