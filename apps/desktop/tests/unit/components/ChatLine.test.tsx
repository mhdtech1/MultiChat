import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChatMessage } from "@chatrix/chat-core";
import { ChatLine } from "../../../src/renderer/ui/components/MessageList/ChatLine";

const mockMessage: ChatMessage = {
  id: "test-123",
  platform: "twitch",
  channel: "testchannel",
  username: "testuser",
  displayName: "TestUser",
  message: "Hello, world!",
  badges: ["subscriber/3"],
  color: "#FF0000",
  timestamp: "2024-01-15T12:00:00Z",
  raw: {}
};

describe("ChatLine", () => {
  it("renders message content and display name", () => {
    render(<ChatLine message={mockMessage} />);
    expect(screen.getByText("Hello, world!")).toBeInTheDocument();
    expect(screen.getByText("TestUser")).toBeInTheDocument();
  });

  it("shows timestamp when enabled", () => {
    render(<ChatLine message={mockMessage} showTimestamp />);
    const expected = new Date(mockMessage.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("hides timestamp when disabled", () => {
    render(<ChatLine message={mockMessage} showTimestamp={false} />);
    expect(screen.queryByText(/12:00/)).not.toBeInTheDocument();
  });

  it("shows badges when enabled", () => {
    render(<ChatLine message={mockMessage} showBadges />);
    expect(screen.getByTitle("Subscriber")).toBeInTheDocument();
  });

  it("calls onUsernameClick when username is clicked", () => {
    const handleClick = vi.fn();
    render(<ChatLine message={mockMessage} onUsernameClick={handleClick} />);
    fireEvent.click(screen.getByText("TestUser"));
    expect(handleClick).toHaveBeenCalledWith("testuser", "twitch");
  });

  it("applies username color style", () => {
    render(<ChatLine message={mockMessage} />);
    expect(screen.getByText("TestUser")).toHaveStyle({ color: "#FF0000" });
  });
});
