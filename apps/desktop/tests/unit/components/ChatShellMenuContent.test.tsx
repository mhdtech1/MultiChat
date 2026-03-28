import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatShellMenuContent } from "../../../src/renderer/ui/components/Shell/ChatShellMenuContent";

const baseProps: React.ComponentProps<typeof ChatShellMenuContent> = {
  isAdvancedMode: true,
  autoWorkspacePreset: true,
  onAutoWorkspacePresetChange: vi.fn(),
  workspacePreset: "streamer",
  onWorkspacePresetChange: vi.fn(),
  workspacePresetStatusTitle: "Moderator -> Mod Desk",
  workspacePresetStatusReason:
    "You can moderate this channel, so Mod Desk keeps those tools ready.",
  isSimpleMode: false,
  onModeChange: vi.fn(),
  theme: "dark",
  onThemeChange: vi.fn(),
  chatTextScale: 100,
  onChatTextScaleChange: vi.fn(),
  welcomeModeEnabled: false,
  onWelcomeModeChange: vi.fn(),
  onOpenQuickTour: vi.fn(),
  onReopenSetupWizard: vi.fn(),
  replayWindow: 10,
  onReplayWindowChange: vi.fn(),
  collaborationModeEnabled: false,
  onCollaborationModeChange: vi.fn(),
  dockedPanels: { mentions: true },
  onDockedPanelChange: vi.fn(),
  streamDelayMode: false,
  onStreamDelayModeChange: vi.fn(),
  streamDelaySeconds: 0,
  onStreamDelaySecondsChange: vi.fn(),
  spoilerBlurDelayed: false,
  onSpoilerBlurDelayedChange: vi.fn(),
  tabGroupDraft: "Event A",
  onTabGroupDraftChange: vi.fn(),
  hasActiveTab: true,
  onAssignActiveTabGroup: vi.fn(),
  uniqueGroups: ["Event A"],
  mutedGroups: [],
  onToggleGroupMute: vi.fn(),
  notificationScene: "live",
  onNotificationSceneChange: vi.fn(),
  layoutPresetName: "current",
  onLayoutPresetNameChange: vi.fn(),
  layoutPresetOptions: [{ id: "current", label: "Current" }],
  onSaveLayoutPreset: vi.fn(),
  onLoadLayoutPreset: vi.fn(),
  autoBanEnabled: true,
  onToggleAutoBan: vi.fn(),
  moderationHistory: [],
  mentionInbox: [],
  onOpenMention: vi.fn(),
  onClearMentionInbox: vi.fn(),
  platformIconGlyph: (platform) => platform[0].toUpperCase(),
  tabAlertProfile: "custom",
  onTabAlertProfileChange: vi.fn(),
  tabAlertKeywordInput: "",
  onTabAlertKeywordInputChange: vi.fn(),
  tabAlertSound: false,
  onTabAlertSoundChange: vi.fn(),
  tabAlertNotify: false,
  onTabAlertNotifyChange: vi.fn(),
  tabMentionSound: false,
  onTabMentionSoundChange: vi.fn(),
  tabMentionNotify: false,
  onTabMentionNotifyChange: vi.fn(),
  activeMentionMuted: false,
  activeMentionSnoozed: false,
  activeMentionSnoozeUntil: 0,
  onToggleActiveTabMentionMute: vi.fn(),
  onSnoozeActiveTabMentions: vi.fn(),
  onClearActiveTabMentionSnooze: vi.fn(),
  onSaveCurrentTabAlertRule: vi.fn(),
  tabSendDefaultTarget: "all",
  onTabSendDefaultTargetChange: vi.fn(),
  tabSendSpecificSourceId: "",
  onTabSendSpecificSourceIdChange: vi.fn(),
  writableActiveTabSources: [
    { id: "src-1", platform: "twitch", channel: "mazen" },
  ],
  tabSendBlockAll: false,
  onTabSendBlockAllChange: vi.fn(),
  tabSendConfirmOnAll: false,
  onTabSendConfirmOnAllChange: vi.fn(),
  onSaveCurrentTabSendRule: vi.fn(),
  onClearCurrentTabSendRule: vi.fn(),
  twitchSignedIn: false,
  kickSignedIn: false,
  onSignInTwitch: vi.fn(),
  onSignOutTwitch: vi.fn(),
  onSignInKick: vi.fn(),
  onSignOutKick: vi.fn(),
  authBusy: null,
  kickWriteAuthConfigured: true,
  newAccountProfileName: "",
  onNewAccountProfileNameChange: vi.fn(),
  onSaveCurrentAccountProfile: vi.fn(),
  accountProfiles: [],
  onSwitchAccountProfile: vi.fn(),
  authHealthBusy: false,
  onRefreshAuthHealth: vi.fn(),
  authHealth: {
    twitch: {
      platform: "twitch",
      signedIn: false,
      username: "",
      canSend: false,
      canModerate: false,
      tokenExpiry: null,
      lastCheckedAt: 0,
    },
    kick: {
      platform: "kick",
      signedIn: false,
      username: "",
      canSend: false,
      canModerate: false,
      authConfigured: true,
      readOnlyAvailable: true,
      tokenExpiry: null,
      lastCheckedAt: 0,
    },
    youtubeTokenExpiry: null,
    updateChannel: "stable",
  },
  twitchUsername: "",
  kickUsername: "",
  canModerateActiveTab: false,
  activeSingleSourcePlatform: null,
  formatOptionalExpiry: () => "n/a",
  connectionHealthRows: [],
  search: "",
  searchInputRef: createRef<HTMLInputElement>(),
  onSearchChange: vi.fn(),
  globalSearchMode: false,
  onGlobalSearchModeChange: vi.fn(),
  filterProfile: "custom",
  onFilterProfileChange: vi.fn(),
  smartFilterSpam: true,
  onSmartFilterSpamChange: vi.fn(),
  smartFilterScam: true,
  onSmartFilterScamChange: vi.fn(),
  effectivePerformanceMode: false,
  performanceModeStatusNote: "",
  onPerformanceModeChange: vi.fn(),
  backgroundMonitorOnClose: true,
  onBackgroundMonitorOnCloseChange: vi.fn(),
  onExportSession: vi.fn(),
  onImportSessionClick: vi.fn(),
  importSessionInputRef: createRef<HTMLInputElement>(),
  onImportSessionFile: vi.fn(),
  updateChannel: "stable",
  onUpdateChannelChange: vi.fn(),
  updateStatus: {
    state: "idle",
    message: "",
    channel: "stable",
    currentVersion: "1.0.7",
  },
  onCheckForUpdates: vi.fn(),
  formatOptionalDateTime: () => "n/a",
  confirmSendAll: true,
  onConfirmSendAllChange: vi.fn(),
};

describe("ChatShellMenuContent", () => {
  it("renders workflow sections in the intended order and keeps auto ban visible", () => {
    const { container } = render(<ChatShellMenuContent {...baseProps} />);

    const sectionLabels = Array.from(
      container.querySelectorAll(".menu-section-eyebrow"),
    ).map((node) => node.textContent?.trim());

    expect(sectionLabels).toEqual([
      "Workspace",
      "Moderation",
      "Connections",
      "Search & Filters",
      "Session",
      "Updates",
    ]);
    expect(
      screen.getByRole("button", { name: "Auto Ban: ON" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in Twitch" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("Moderator -> Mod Desk")),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Auto Ban: ON" }));
    expect(baseProps.onToggleAutoBan).toHaveBeenCalledTimes(1);
  });

  it("lets the user disable auto desk switching", () => {
    render(<ChatShellMenuContent {...baseProps} />);

    fireEvent.click(screen.getByLabelText("Auto-switch desk by channel role"));
    expect(baseProps.onAutoWorkspacePresetChange).toHaveBeenCalledWith(false);
  });
});
