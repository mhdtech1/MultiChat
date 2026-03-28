import type { RefObject, ReactNode } from "react";
import type {
  AuthHealthSnapshot,
  ThemeOption,
  UpdateStatus,
  WorkspacePreset,
} from "../../../../shared/types";
import type {
  MentionInboxEntry,
  ModerationHistoryEntry,
} from "../../../types/chatSession";

type ReplayWindow = 0 | 5 | 10 | 30;
type TabAlertProfile =
  | "custom"
  | "default"
  | "quiet"
  | "mod-heavy"
  | "tournament";
type FilterProfile = "clean" | "mod" | "no-filter" | "custom";
type NotificationScene = "live" | "chatting" | "offline";
type DockedPanelKey = "mentions" | "globalTimeline" | "modHistory" | "userCard";
type DockedPanelsState = Partial<Record<DockedPanelKey, boolean>>;
type ConnectionHealthRow = {
  source: {
    id: string;
    platform: "twitch" | "kick" | "youtube" | "tiktok";
    channel: string;
  };
  status: string;
  canSend: boolean;
  canModerate: boolean;
  tokenExpiry: number | null;
  health?: {
    lastStatusAt?: number;
    reconnectReason?: string;
    lastError?: string;
  };
};
type LayoutPresetOption = {
  id: string;
  label: string;
};
type AccountProfileOption = {
  id: string;
  name: string;
};
type WritableSourceOption = {
  id: string;
  platform: "twitch" | "kick" | "youtube" | "tiktok";
  channel: string;
};
type MenuSectionProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
};

export type ChatShellMenuContentProps = {
  isAdvancedMode: boolean;
  autoWorkspacePreset: boolean;
  onAutoWorkspacePresetChange: (value: boolean) => void;
  workspacePreset: WorkspacePreset;
  onWorkspacePresetChange: (preset: WorkspacePreset) => void;
  workspacePresetStatusTitle: string;
  workspacePresetStatusReason: string;
  isSimpleMode: boolean;
  onModeChange: (mode: "simple" | "advanced") => void;
  theme: ThemeOption;
  onThemeChange: (theme: ThemeOption) => void;
  chatTextScale: number;
  onChatTextScaleChange: (value: number) => void;
  welcomeModeEnabled: boolean;
  onWelcomeModeChange: (enabled: boolean) => void;
  onOpenQuickTour: () => void;
  onReopenSetupWizard: () => void;
  replayWindow: ReplayWindow;
  onReplayWindowChange: (value: ReplayWindow) => void;
  collaborationModeEnabled: boolean;
  onCollaborationModeChange: (enabled: boolean) => void;
  dockedPanels: DockedPanelsState;
  onDockedPanelChange: (panel: DockedPanelKey, enabled: boolean) => void;
  streamDelayMode: boolean;
  onStreamDelayModeChange: (enabled: boolean) => void;
  streamDelaySeconds: number;
  onStreamDelaySecondsChange: (value: number) => void;
  spoilerBlurDelayed: boolean;
  onSpoilerBlurDelayedChange: (enabled: boolean) => void;
  tabGroupDraft: string;
  onTabGroupDraftChange: (value: string) => void;
  hasActiveTab: boolean;
  onAssignActiveTabGroup: () => void;
  uniqueGroups: string[];
  mutedGroups: string[];
  onToggleGroupMute: (group: string) => void;
  notificationScene: NotificationScene;
  onNotificationSceneChange: (value: NotificationScene) => void;
  layoutPresetName: string;
  onLayoutPresetNameChange: (value: string) => void;
  layoutPresetOptions: LayoutPresetOption[];
  onSaveLayoutPreset: () => void;
  onLoadLayoutPreset: () => void;
  autoBanEnabled: boolean;
  onToggleAutoBan: () => void;
  moderationHistory: ModerationHistoryEntry[];
  mentionInbox: MentionInboxEntry[];
  onOpenMention: (entry: MentionInboxEntry) => void;
  onClearMentionInbox: () => void;
  platformIconGlyph: (platform: MentionInboxEntry["platform"]) => string;
  tabAlertProfile: TabAlertProfile;
  onTabAlertProfileChange: (profile: TabAlertProfile) => void;
  tabAlertKeywordInput: string;
  onTabAlertKeywordInputChange: (value: string) => void;
  tabAlertSound: boolean;
  onTabAlertSoundChange: (value: boolean) => void;
  tabAlertNotify: boolean;
  onTabAlertNotifyChange: (value: boolean) => void;
  tabMentionSound: boolean;
  onTabMentionSoundChange: (value: boolean) => void;
  tabMentionNotify: boolean;
  onTabMentionNotifyChange: (value: boolean) => void;
  activeMentionMuted: boolean;
  activeMentionSnoozed: boolean;
  activeMentionSnoozeUntil: number;
  onToggleActiveTabMentionMute: () => void;
  onSnoozeActiveTabMentions: () => void;
  onClearActiveTabMentionSnooze: () => void;
  onSaveCurrentTabAlertRule: () => void;
  tabSendDefaultTarget: "all" | "first" | "specific";
  onTabSendDefaultTargetChange: (value: "all" | "first" | "specific") => void;
  tabSendSpecificSourceId: string;
  onTabSendSpecificSourceIdChange: (value: string) => void;
  writableActiveTabSources: WritableSourceOption[];
  tabSendBlockAll: boolean;
  onTabSendBlockAllChange: (value: boolean) => void;
  tabSendConfirmOnAll: boolean;
  onTabSendConfirmOnAllChange: (value: boolean) => void;
  onSaveCurrentTabSendRule: () => void;
  onClearCurrentTabSendRule: () => void;
  twitchSignedIn: boolean;
  kickSignedIn: boolean;
  onSignInTwitch: () => void;
  onSignOutTwitch: () => void;
  onSignInKick: () => void;
  onSignOutKick: () => void;
  authBusy: "twitch" | "kick" | null;
  kickWriteAuthConfigured: boolean;
  newAccountProfileName: string;
  onNewAccountProfileNameChange: (value: string) => void;
  onSaveCurrentAccountProfile: () => void;
  accountProfiles: AccountProfileOption[];
  onSwitchAccountProfile: (profileId: string) => void;
  authHealthBusy: boolean;
  onRefreshAuthHealth: (includePermissions: boolean) => void;
  authHealth: AuthHealthSnapshot | null;
  twitchUsername: string;
  kickUsername: string;
  canModerateActiveTab: boolean;
  activeSingleSourcePlatform: "twitch" | "kick" | null;
  formatOptionalExpiry: (value: number | null | undefined) => string;
  connectionHealthRows: ConnectionHealthRow[];
  search: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  globalSearchMode: boolean;
  onGlobalSearchModeChange: (value: boolean) => void;
  filterProfile: FilterProfile;
  onFilterProfileChange: (value: FilterProfile) => void;
  smartFilterSpam: boolean;
  onSmartFilterSpamChange: (value: boolean) => void;
  smartFilterScam: boolean;
  onSmartFilterScamChange: (value: boolean) => void;
  effectivePerformanceMode: boolean;
  performanceModeStatusNote: string;
  onPerformanceModeChange: (value: boolean) => void;
  backgroundMonitorOnClose: boolean;
  onBackgroundMonitorOnCloseChange: (value: boolean) => void;
  onExportSession: () => void;
  onImportSessionClick: () => void;
  importSessionInputRef: RefObject<HTMLInputElement | null>;
  onImportSessionFile: (file: File) => void;
  updateChannel: "stable" | "beta";
  onUpdateChannelChange: (channel: "stable" | "beta") => void;
  updateStatus: UpdateStatus;
  onCheckForUpdates: () => void;
  formatOptionalDateTime: (value: string | undefined) => string;
  confirmSendAll: boolean;
  onConfirmSendAllChange: (value: boolean) => void;
};

function MenuSection({ eyebrow, title, children }: MenuSectionProps) {
  return (
    <section className="menu-section">
      <div className="menu-section-header">
        <span className="menu-section-eyebrow">{eyebrow}</span>
        <strong className="menu-section-title">{title}</strong>
      </div>
      <div className="menu-section-grid">{children}</div>
    </section>
  );
}

export function ChatShellMenuContent({
  isAdvancedMode,
  autoWorkspacePreset,
  onAutoWorkspacePresetChange,
  workspacePreset,
  onWorkspacePresetChange,
  workspacePresetStatusTitle,
  workspacePresetStatusReason,
  isSimpleMode,
  onModeChange,
  theme,
  onThemeChange,
  chatTextScale,
  onChatTextScaleChange,
  welcomeModeEnabled,
  onWelcomeModeChange,
  onOpenQuickTour,
  onReopenSetupWizard,
  replayWindow,
  onReplayWindowChange,
  collaborationModeEnabled,
  onCollaborationModeChange,
  dockedPanels,
  onDockedPanelChange,
  streamDelayMode,
  onStreamDelayModeChange,
  streamDelaySeconds,
  onStreamDelaySecondsChange,
  spoilerBlurDelayed,
  onSpoilerBlurDelayedChange,
  tabGroupDraft,
  onTabGroupDraftChange,
  hasActiveTab,
  onAssignActiveTabGroup,
  uniqueGroups,
  mutedGroups,
  onToggleGroupMute,
  notificationScene,
  onNotificationSceneChange,
  layoutPresetName,
  onLayoutPresetNameChange,
  layoutPresetOptions,
  onSaveLayoutPreset,
  onLoadLayoutPreset,
  autoBanEnabled,
  onToggleAutoBan,
  moderationHistory,
  mentionInbox,
  onOpenMention,
  onClearMentionInbox,
  platformIconGlyph,
  tabAlertProfile,
  onTabAlertProfileChange,
  tabAlertKeywordInput,
  onTabAlertKeywordInputChange,
  tabAlertSound,
  onTabAlertSoundChange,
  tabAlertNotify,
  onTabAlertNotifyChange,
  tabMentionSound,
  onTabMentionSoundChange,
  tabMentionNotify,
  onTabMentionNotifyChange,
  activeMentionMuted,
  activeMentionSnoozed,
  activeMentionSnoozeUntil,
  onToggleActiveTabMentionMute,
  onSnoozeActiveTabMentions,
  onClearActiveTabMentionSnooze,
  onSaveCurrentTabAlertRule,
  tabSendDefaultTarget,
  onTabSendDefaultTargetChange,
  tabSendSpecificSourceId,
  onTabSendSpecificSourceIdChange,
  writableActiveTabSources,
  tabSendBlockAll,
  onTabSendBlockAllChange,
  tabSendConfirmOnAll,
  onTabSendConfirmOnAllChange,
  onSaveCurrentTabSendRule,
  onClearCurrentTabSendRule,
  twitchSignedIn,
  kickSignedIn,
  onSignInTwitch,
  onSignOutTwitch,
  onSignInKick,
  onSignOutKick,
  authBusy,
  kickWriteAuthConfigured,
  newAccountProfileName,
  onNewAccountProfileNameChange,
  onSaveCurrentAccountProfile,
  accountProfiles,
  onSwitchAccountProfile,
  authHealthBusy,
  onRefreshAuthHealth,
  authHealth,
  twitchUsername,
  kickUsername,
  canModerateActiveTab,
  activeSingleSourcePlatform,
  formatOptionalExpiry,
  connectionHealthRows,
  search,
  searchInputRef,
  onSearchChange,
  globalSearchMode,
  onGlobalSearchModeChange,
  filterProfile,
  onFilterProfileChange,
  smartFilterSpam,
  onSmartFilterSpamChange,
  smartFilterScam,
  onSmartFilterScamChange,
  effectivePerformanceMode,
  performanceModeStatusNote,
  onPerformanceModeChange,
  backgroundMonitorOnClose,
  onBackgroundMonitorOnCloseChange,
  onExportSession,
  onImportSessionClick,
  importSessionInputRef,
  onImportSessionFile,
  updateChannel,
  onUpdateChannelChange,
  updateStatus,
  onCheckForUpdates,
  formatOptionalDateTime,
  confirmSendAll,
  onConfirmSendAllChange,
}: ChatShellMenuContentProps) {
  return (
    <>
      <MenuSection
        eyebrow="Workspace"
        title="Experience, layout, and panel flow"
      >
        <div className="menu-group">
          <strong>Experience</strong>
          <label className="menu-check">
            <input
              type="checkbox"
              checked={autoWorkspacePreset}
              onChange={(event) =>
                onAutoWorkspacePresetChange(event.target.checked)
              }
            />
            Auto-switch desk by channel role
          </label>
          <span className="menu-muted">
            {workspacePresetStatusTitle} · {workspacePresetStatusReason}
          </span>
          <label className="menu-inline">
            Workspace
            <select
              value={workspacePreset}
              disabled={autoWorkspacePreset}
              onChange={(event) =>
                onWorkspacePresetChange(event.target.value as WorkspacePreset)
              }
            >
              <option value="streamer">Streamer</option>
              <option value="moddesk">Mod Desk</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <label className="menu-inline">
            Mode
            <select
              value={isSimpleMode ? "simple" : "advanced"}
              disabled={autoWorkspacePreset}
              onChange={(event) =>
                onModeChange(event.target.value as "simple" | "advanced")
              }
            >
              <option value="simple">Simple</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className="menu-inline">
            Theme
            <select
              value={theme}
              onChange={(event) =>
                onThemeChange(event.target.value as ThemeOption)
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="classic">Classic</option>
            </select>
          </label>
          <label className="menu-inline menu-inline--slider">
            <span>Chat text size</span>
            <input
              type="range"
              min={85}
              max={130}
              step={1}
              value={chatTextScale}
              onChange={(event) =>
                onChatTextScaleChange(Number(event.target.value))
              }
              aria-label="Chat text size"
            />
            <span className="menu-muted">{chatTextScale}%</span>
          </label>
          <span className="menu-muted">
            {autoWorkspacePreset
              ? "Auto mode chooses Streamer, Mod Desk, or Viewer based on whether you are the broadcaster, a moderator, or just watching."
              : isSimpleMode
                ? "Simple mode keeps the shell focused on core stream actions."
                : "Advanced mode keeps diagnostics and deeper routing controls in reach."}
          </span>
          <label className="menu-check">
            <input
              type="checkbox"
              checked={welcomeModeEnabled}
              onChange={(event) => onWelcomeModeChange(event.target.checked)}
            />
            Welcome mode (quiet non-mention alerts)
          </label>
        </div>

        <div className="menu-group">
          <strong>View</strong>
          <button type="button" onClick={onOpenQuickTour}>
            Open Quick Tour
          </button>
          <button type="button" onClick={onReopenSetupWizard}>
            Reopen Setup Wizard
          </button>
          {isAdvancedMode ? (
            <label className="menu-inline">
              Replay
              <select
                value={replayWindow}
                onChange={(event) =>
                  onReplayWindowChange(
                    Number(event.target.value) as ReplayWindow,
                  )
                }
              >
                <option value={0}>All</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={30}>30 min</option>
              </select>
            </label>
          ) : null}
        </div>

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Panels</strong>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={dockedPanels.mentions === true}
                disabled={autoWorkspacePreset}
                onChange={(event) =>
                  onDockedPanelChange("mentions", event.target.checked)
                }
              />
              Mentions panel
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={dockedPanels.globalTimeline === true}
                disabled={autoWorkspacePreset}
                onChange={(event) =>
                  onDockedPanelChange("globalTimeline", event.target.checked)
                }
              />
              Global timeline panel
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={dockedPanels.modHistory === true}
                disabled={autoWorkspacePreset}
                onChange={(event) =>
                  onDockedPanelChange("modHistory", event.target.checked)
                }
              />
              Mod history panel
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={dockedPanels.userCard === true}
                disabled={autoWorkspacePreset}
                onChange={(event) =>
                  onDockedPanelChange("userCard", event.target.checked)
                }
              />
              User card panel
            </label>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Stream Sync</strong>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={streamDelayMode}
                onChange={(event) =>
                  onStreamDelayModeChange(event.target.checked)
                }
              />
              Stream delay mode
            </label>
            <label className="menu-inline">
              Delay (sec)
              <input
                type="number"
                min={0}
                max={180}
                value={streamDelaySeconds}
                onChange={(event) =>
                  onStreamDelaySecondsChange(Number(event.target.value) || 0)
                }
              />
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={spoilerBlurDelayed}
                onChange={(event) =>
                  onSpoilerBlurDelayedChange(event.target.checked)
                }
              />
              Blur delayed lines
            </label>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Tab Groups</strong>
            <label className="menu-inline">
              Active tab group
              <input
                value={tabGroupDraft}
                onChange={(event) => onTabGroupDraftChange(event.target.value)}
                placeholder="e.g. Event A"
              />
            </label>
            <div className="menu-row">
              <button
                type="button"
                onClick={onAssignActiveTabGroup}
                disabled={!hasActiveTab}
              >
                Save group
              </button>
            </div>
            {uniqueGroups.length > 0 ? (
              <div className="menu-row">
                {uniqueGroups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => onToggleGroupMute(group)}
                  >
                    {mutedGroups.includes(group)
                      ? `Unmute ${group}`
                      : `Mute ${group}`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Collaboration</strong>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={collaborationModeEnabled}
                disabled={autoWorkspacePreset}
                onChange={(event) =>
                  onCollaborationModeChange(event.target.checked)
                }
              />
              Enable shared mod links (browser fallback)
            </label>
            <label className="menu-inline">
              Scene
              <select
                value={notificationScene}
                onChange={(event) =>
                  onNotificationSceneChange(
                    event.target.value as NotificationScene,
                  )
                }
              >
                <option value="live">Live</option>
                <option value="chatting">Just Chatting</option>
                <option value="offline">Offline</option>
              </select>
            </label>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Layouts</strong>
            <label className="menu-inline">
              Preset
              <select
                value={layoutPresetName}
                onChange={(event) =>
                  onLayoutPresetNameChange(event.target.value)
                }
              >
                {layoutPresetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="menu-row">
              <button type="button" onClick={onSaveLayoutPreset}>
                Save preset
              </button>
              <button type="button" onClick={onLoadLayoutPreset}>
                Load preset
              </button>
            </div>
          </div>
        ) : null}
      </MenuSection>

      <MenuSection
        eyebrow="Moderation"
        title="Quick controls, alerts, and emergency tools"
      >
        <div className="menu-group">
          <strong>Emergency Controls</strong>
          <button type="button" onClick={onToggleAutoBan}>
            {autoBanEnabled ? "Auto Ban: ON" : "Auto Ban: OFF"}
          </button>
          <span className="menu-muted">
            Emergency only. Any non-system chatter message triggers a ban
            attempt.
          </span>
        </div>

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Mention Inbox</strong>
            <div className="menu-row">
              <span>{mentionInbox.length} unread mentions</span>
              <button
                type="button"
                onClick={onClearMentionInbox}
                disabled={mentionInbox.length === 0}
              >
                Clear
              </button>
            </div>
            <div className="menu-mention-list">
              {mentionInbox.length === 0 ? (
                <span className="menu-muted">No mentions yet.</span>
              ) : (
                mentionInbox.slice(0, 12).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="menu-mention-item"
                    onClick={() => onOpenMention(entry)}
                  >
                    <span>
                      [{platformIconGlyph(entry.platform)}] #{entry.channel} ·{" "}
                      {entry.reason === "reply" ? "Reply" : "Mention"} ·{" "}
                      {entry.displayName}
                    </span>
                    <span>{entry.message.slice(0, 120)}</span>
                    <span>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Current Tab Alerts</strong>
            <label className="menu-inline">
              Profile
              <select
                value={tabAlertProfile}
                onChange={(event) =>
                  onTabAlertProfileChange(event.target.value as TabAlertProfile)
                }
              >
                <option value="custom">Custom</option>
                <option value="default">Default</option>
                <option value="quiet">Quiet</option>
                <option value="mod-heavy">Mod-heavy</option>
                <option value="tournament">Tournament</option>
              </select>
            </label>
            <input
              value={tabAlertKeywordInput}
              onChange={(event) =>
                onTabAlertKeywordInputChange(event.target.value)
              }
              placeholder="Keyword (e.g. urgent)"
            />
            <label className="menu-check">
              <input
                type="checkbox"
                checked={tabAlertSound}
                onChange={(event) =>
                  onTabAlertSoundChange(event.target.checked)
                }
              />
              Play sound
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={tabAlertNotify}
                onChange={(event) =>
                  onTabAlertNotifyChange(event.target.checked)
                }
              />
              Desktop notification
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={tabMentionSound}
                onChange={(event) =>
                  onTabMentionSoundChange(event.target.checked)
                }
              />
              Mention sound
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={tabMentionNotify}
                onChange={(event) =>
                  onTabMentionNotifyChange(event.target.checked)
                }
              />
              Mention notification
            </label>
            <div className="menu-row">
              <button
                type="button"
                onClick={onToggleActiveTabMentionMute}
                disabled={!hasActiveTab}
              >
                {activeMentionMuted ? "Unmute mentions" : "Mute mentions"}
              </button>
              <button
                type="button"
                onClick={onSnoozeActiveTabMentions}
                disabled={!hasActiveTab}
              >
                Snooze 15m
              </button>
              {activeMentionSnoozed ? (
                <button
                  type="button"
                  onClick={onClearActiveTabMentionSnooze}
                  disabled={!hasActiveTab}
                >
                  Clear snooze
                </button>
              ) : null}
            </div>
            <span className="menu-muted">
              {activeMentionMuted
                ? "Mentions are muted for this tab."
                : activeMentionSnoozed
                  ? `Mentions snoozed until ${new Date(activeMentionSnoozeUntil).toLocaleTimeString()}.`
                  : "Mentions are active for this tab."}
            </span>
            <button
              type="button"
              onClick={onSaveCurrentTabAlertRule}
              disabled={!hasActiveTab}
            >
              Save tab alert
            </button>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Current Tab Send Rule</strong>
            <label className="menu-inline">
              Default target
              <select
                value={tabSendDefaultTarget}
                onChange={(event) =>
                  onTabSendDefaultTargetChange(
                    event.target.value as "all" | "first" | "specific",
                  )
                }
                disabled={!hasActiveTab}
              >
                <option value="all">All chats in tab</option>
                <option value="first">First writable chat</option>
                <option value="specific">Specific chat</option>
              </select>
            </label>
            {tabSendDefaultTarget === "specific" ? (
              <label className="menu-inline">
                Specific chat
                <select
                  value={tabSendSpecificSourceId}
                  onChange={(event) =>
                    onTabSendSpecificSourceIdChange(event.target.value)
                  }
                  disabled={!hasActiveTab}
                >
                  <option value="">Select chat</option>
                  {writableActiveTabSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.platform}/{source.channel}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="menu-check">
              <input
                type="checkbox"
                checked={tabSendBlockAll}
                onChange={(event) =>
                  onTabSendBlockAllChange(event.target.checked)
                }
                disabled={!hasActiveTab}
              />
              Block send-to-all on this tab
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={tabSendConfirmOnAll}
                onChange={(event) =>
                  onTabSendConfirmOnAllChange(event.target.checked)
                }
                disabled={!hasActiveTab}
              />
              Confirm before send-to-all on this tab
            </label>
            <div className="menu-row">
              <button
                type="button"
                onClick={onSaveCurrentTabSendRule}
                disabled={!hasActiveTab}
              >
                Save send rule
              </button>
              <button
                type="button"
                onClick={onClearCurrentTabSendRule}
                disabled={!hasActiveTab}
              >
                Clear send rule
              </button>
            </div>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Mod Action History</strong>
            <div className="menu-mention-list">
              {moderationHistory.length === 0 ? (
                <span className="menu-muted">No moderator actions yet.</span>
              ) : (
                moderationHistory.slice(0, 12).map((entry) => (
                  <span key={entry.id} className="menu-muted">
                    {new Date(entry.at).toLocaleTimeString()} ·{" "}
                    {entry.ok ? "OK" : "FAIL"} · {entry.action} · {entry.target}{" "}
                    · {entry.source}
                  </span>
                ))
              )}
            </div>
          </div>
        ) : null}
      </MenuSection>

      <MenuSection
        eyebrow="Connections"
        title="Account sign-in, health, and source status"
      >
        <div className="menu-group">
          <strong>Accounts</strong>
          <details className="menu-submenu">
            <summary>Twitch</summary>
            {twitchSignedIn ? (
              <button type="button" onClick={onSignOutTwitch}>
                Sign out Twitch
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignInTwitch}
                disabled={authBusy !== null}
              >
                {authBusy === "twitch" ? "Signing in..." : "Sign in Twitch"}
              </button>
            )}
          </details>
          <details className="menu-submenu">
            <summary>Kick</summary>
            {kickSignedIn ? (
              <button type="button" onClick={onSignOutKick}>
                Sign out Kick
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignInKick}
                disabled={authBusy !== null}
              >
                {kickWriteAuthConfigured
                  ? authBusy === "kick"
                    ? "Signing in..."
                    : "Sign in Kick"
                  : "Use Kick read-only"}
              </button>
            )}
          </details>
          {isAdvancedMode ? (
            <>
              <label className="menu-inline">
                Save current as
                <input
                  value={newAccountProfileName}
                  onChange={(event) =>
                    onNewAccountProfileNameChange(event.target.value)
                  }
                  placeholder="Profile name"
                />
              </label>
              <button type="button" onClick={onSaveCurrentAccountProfile}>
                Save account profile
              </button>
              {accountProfiles.length > 0 ? (
                <label className="menu-inline">
                  Switch profile
                  <select
                    onChange={(event) =>
                      onSwitchAccountProfile(event.target.value)
                    }
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose profile
                    </option>
                    {accountProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
        </div>

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Auth Manager</strong>
            <div className="menu-row">
              <button
                type="button"
                onClick={() => onRefreshAuthHealth(false)}
                disabled={authHealthBusy}
              >
                Refresh health
              </button>
              <button
                type="button"
                onClick={() => onRefreshAuthHealth(true)}
                disabled={authHealthBusy}
              >
                Test permissions
              </button>
            </div>
            <div className="menu-health-list">
              <div className="menu-health-card">
                <span className="menu-health-title">Twitch</span>
                <span>
                  Signed in: {authHealth?.twitch.signedIn ? "yes" : "no"}
                </span>
                <span>
                  User: {authHealth?.twitch.username || twitchUsername || "n/a"}
                </span>
                <span>
                  Can send: {authHealth?.twitch.canSend ? "yes" : "no"}
                </span>
                <span>
                  Can mod (active tab):{" "}
                  {canModerateActiveTab &&
                  activeSingleSourcePlatform === "twitch"
                    ? "yes"
                    : "no"}
                </span>
                <span>
                  Token expiry:{" "}
                  {formatOptionalExpiry(authHealth?.twitch.tokenExpiry)}
                </span>
                {authHealth?.twitch.error ? (
                  <span className="menu-error">
                    Error: {authHealth.twitch.error}
                  </span>
                ) : null}
              </div>
              <div className="menu-health-card">
                <span className="menu-health-title">Kick</span>
                <span>
                  Signed in: {authHealth?.kick.signedIn ? "yes" : "no"}
                </span>
                <span>
                  User: {authHealth?.kick.username || kickUsername || "n/a"}
                </span>
                <span>Can send: {authHealth?.kick.canSend ? "yes" : "no"}</span>
                <span>
                  Write auth configured:{" "}
                  {authHealth?.kick.authConfigured === false ? "no" : "yes"}
                </span>
                <span>
                  Read-only available:{" "}
                  {authHealth?.kick.readOnlyAvailable === false ? "no" : "yes"}
                </span>
                <span>
                  Can mod (active tab):{" "}
                  {canModerateActiveTab && activeSingleSourcePlatform === "kick"
                    ? "yes"
                    : "no"}
                </span>
                <span>
                  Token expiry:{" "}
                  {formatOptionalExpiry(authHealth?.kick.tokenExpiry)}
                </span>
                {authHealth?.kick.error ? (
                  <span className="menu-error">
                    Error: {authHealth.kick.error}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Connection Health</strong>
            <details className="menu-submenu" open>
              <summary>Open sources ({connectionHealthRows.length})</summary>
              <div className="menu-connection-list">
                {connectionHealthRows.length === 0 ? (
                  <span className="menu-muted">No sources connected yet.</span>
                ) : (
                  connectionHealthRows.map((row) => (
                    <div key={row.source.id} className="menu-connection-row">
                      <span className="menu-health-title">
                        {row.source.platform}/{row.source.channel}
                      </span>
                      <span>Status: {row.status}</span>
                      <span>Can send: {row.canSend ? "yes" : "no"}</span>
                      <span>Can mod: {row.canModerate ? "yes" : "no"}</span>
                      <span>
                        Token expiry: {formatOptionalExpiry(row.tokenExpiry)}
                      </span>
                      <span>
                        Last status change:{" "}
                        {row.health?.lastStatusAt
                          ? new Date(
                              row.health.lastStatusAt,
                            ).toLocaleTimeString()
                          : "n/a"}
                      </span>
                      {row.health?.reconnectReason ? (
                        <span>
                          Reconnect reason: {row.health.reconnectReason}
                        </span>
                      ) : null}
                      {row.health?.lastError ? (
                        <span className="menu-error">
                          Last error: {row.health.lastError}
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </details>
          </div>
        ) : null}
      </MenuSection>

      <MenuSection
        eyebrow="Search & Filters"
        title="Find the right message and tame the noise"
      >
        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Search</strong>
            <input
              ref={searchInputRef}
              type="search"
              placeholder={
                globalSearchMode ? "Search all tabs" : "Search in active tab"
              }
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <label className="menu-check">
              <input
                type="checkbox"
                checked={globalSearchMode}
                disabled={autoWorkspacePreset}
                onChange={(event) =>
                  onGlobalSearchModeChange(event.target.checked)
                }
              />
              Global search
            </label>
          </div>
        ) : null}

        <div className="menu-group">
          <strong>{isAdvancedMode ? "Filters" : "Performance"}</strong>
          {isAdvancedMode ? (
            <label className="menu-inline">
              Profile
              <select
                value={filterProfile}
                onChange={(event) =>
                  onFilterProfileChange(event.target.value as FilterProfile)
                }
              >
                <option value="custom">Custom</option>
                <option value="clean">Clean</option>
                <option value="mod">Mod</option>
                <option value="no-filter">No filter</option>
              </select>
            </label>
          ) : null}
          {isAdvancedMode ? (
            <>
              <label className="menu-check">
                <input
                  type="checkbox"
                  checked={smartFilterSpam}
                  onChange={(event) =>
                    onSmartFilterSpamChange(event.target.checked)
                  }
                />
                Smart spam filter
              </label>
              <label className="menu-check">
                <input
                  type="checkbox"
                  checked={smartFilterScam}
                  onChange={(event) =>
                    onSmartFilterScamChange(event.target.checked)
                  }
                />
                Scam phrase filter
              </label>
            </>
          ) : null}
          <label className="menu-check">
            <input
              type="checkbox"
              checked={effectivePerformanceMode}
              onChange={(event) =>
                onPerformanceModeChange(event.target.checked)
              }
            />
            Performance mode {performanceModeStatusNote}
          </label>
          <label className="menu-check">
            <input
              type="checkbox"
              checked={backgroundMonitorOnClose}
              onChange={(event) =>
                onBackgroundMonitorOnCloseChange(event.target.checked)
              }
            />
            Keep running in background after close (macOS)
          </label>
        </div>
      </MenuSection>

      <MenuSection
        eyebrow="Session"
        title="Profiles, imports, and local behavior"
      >
        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>Session Transfer</strong>
            <div className="menu-row">
              <button type="button" onClick={onExportSession}>
                Export session
              </button>
              <button type="button" onClick={onImportSessionClick}>
                Import session
              </button>
            </div>
            <input
              ref={importSessionInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onImportSessionFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
        ) : null}

        {isAdvancedMode ? (
          <div className="menu-group">
            <strong>System</strong>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={confirmSendAll}
                onChange={(event) =>
                  onConfirmSendAllChange(event.target.checked)
                }
              />
              Confirm send-to-all
            </label>
          </div>
        ) : null}
      </MenuSection>

      <MenuSection
        eyebrow="Updates"
        title="Release channel and update reliability"
      >
        <div className="menu-group">
          <strong>Release Reliability</strong>
          {isAdvancedMode ? (
            <label className="menu-inline">
              Update channel
              <select
                value={updateChannel}
                onChange={(event) =>
                  onUpdateChannelChange(event.target.value as "stable" | "beta")
                }
              >
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
              </select>
            </label>
          ) : null}
          <span>Installed: v{updateStatus.currentVersion || "unknown"}</span>
          {isAdvancedMode ? (
            <span>
              Available:{" "}
              {updateStatus.availableVersion
                ? `v${updateStatus.availableVersion}`
                : "n/a"}
            </span>
          ) : null}
          {isAdvancedMode ? (
            <span>
              Release date: {formatOptionalDateTime(updateStatus.releaseDate)}
            </span>
          ) : null}
          <button type="button" onClick={onCheckForUpdates}>
            Check for Updates
          </button>
          {isAdvancedMode && updateStatus.releaseNotes ? (
            <pre className="release-notes-preview">
              {updateStatus.releaseNotes}
            </pre>
          ) : null}
        </div>
      </MenuSection>
    </>
  );
}
