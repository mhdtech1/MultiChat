import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatComposerPanel } from "../../../src/renderer/ui/components/Shell/ChatComposerPanel";

const baseProps = {
  writableSources: [
    { id: "src-1", platform: "twitch" as const, channel: "mazen" },
  ],
  sendTargetId: "src-1",
  allTargetId: "all",
  onSendTargetChange: vi.fn(),
  composerText: "hello world",
  onComposerTextChange: vi.fn(),
  onComposerKeyDown: vi.fn(),
  composerPlaceholder: "Type a message",
  composerCharacterCount: 11,
  composerCounterTone: "normal" as const,
  composerLimit: 500,
  isAdvancedMode: true,
  canModerateActiveTab: false,
  snippetToInsert: "",
  onSnippetSelect: vi.fn(),
  commandSnippets: ["/clear"],
  sending: false,
  onSend: vi.fn(),
  commandPaletteOpen: false,
  commandSuggestions: [],
  onSelectCommandSuggestion: vi.fn(),
  showQuickMod: true,
  quickModUser: "baduser",
  onQuickModUserChange: vi.fn(),
  onRunQuickMod: vi.fn(),
  autoBanEnabled: true,
  onToggleAutoBan: vi.fn(),
};

describe("ChatComposerPanel", () => {
  it("keeps quick mod visible and disables mod actions when moderation is unavailable", () => {
    render(<ChatComposerPanel {...baseProps} />);

    expect(screen.getByText("Quick Mod")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timeout 1m" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ban" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
    expect(
      screen.getByText("Auto Ban ON"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Timeout 10m" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unban" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Auto Ban: ON" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Auto Ban: ON" }));
    expect(baseProps.onToggleAutoBan).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled composer when there are no writable targets", () => {
    render(
      <ChatComposerPanel
        {...baseProps}
        writableSources={[]}
        showQuickMod={false}
        composerText=""
      />,
    );

    expect(screen.getByPlaceholderText("Type a message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.queryByText("Quick Mod")).not.toBeInTheDocument();
  });
});
