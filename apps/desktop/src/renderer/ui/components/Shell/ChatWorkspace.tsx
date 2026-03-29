import type { ReactNode } from "react";
import { PlatformIcon } from "../common/PlatformIcon";

type SourcePreviewItem = {
  source: {
    id: string;
    platform: "twitch" | "kick" | "youtube" | "tiktok";
    channel: string;
  };
  status: string;
  staleSeconds: number | null;
};

type RaidSignal = {
  messagesPerMinute: number;
  uniqueChatters: number;
};

type PinnedMessageLike = {
  platform: "twitch" | "kick" | "youtube" | "tiktok";
  channel: string;
  displayName: string;
  timestamp: string;
  message: string;
};

type PollOption = {
  id: string;
  label: string;
  votes: number;
};

type ActivePollLike = {
  question: string;
  active: boolean;
  createdAt: string;
  options: PollOption[];
};

export type ChatWorkspaceProps = {
  activeTab: boolean;
  welcomeScreen: ReactNode;
  showToolbar: boolean;
  toolbarSummaryText: string;
  isAdvancedMode: boolean;
  firstUnreadTimestamp: number;
  onJumpToFirstUnread: () => void;
  adaptivePerformanceMode: boolean;
  showActiveTabMeta: boolean;
  isSimpleMode: boolean;
  simpleActiveTabMetaText: string;
  activeSourcePreviewItems: SourcePreviewItem[];
  activeSourceStatusItems: SourcePreviewItem[];
  hiddenActiveSourceCount: number;
  closeClosestDetailsMenu: () => void;
  quickActions: ReactNode;
  activeRaidSignal: RaidSignal | null;
  onEnableWelcomeMode: () => void;
  onDismissRaidSignal: () => void;
  activePinnedMessage: PinnedMessageLike | null;
  onClearPinnedMessage: () => void;
  pollComposerOpen: boolean;
  pollQuestionDraft: string;
  onPollQuestionDraftChange: (value: string) => void;
  pollOptionsDraft: string;
  onPollOptionsDraftChange: (value: string) => void;
  onStartPoll: () => void;
  canStartPoll: boolean;
  onCancelPollComposer: () => void;
  activeTabPoll: ActivePollLike | null;
  onVoteInPoll: (optionId: string) => void;
  onCloseActivePoll: () => void;
  onClearActivePoll: () => void;
  messageFeed: ReactNode;
  newestLocked: boolean;
  pendingNewestCount: number;
  onJumpToNewest: () => void;
  composerPanel: ReactNode;
};

export function ChatWorkspace({
  activeTab,
  welcomeScreen,
  showToolbar,
  toolbarSummaryText,
  isAdvancedMode,
  firstUnreadTimestamp,
  onJumpToFirstUnread,
  adaptivePerformanceMode,
  showActiveTabMeta,
  isSimpleMode,
  simpleActiveTabMetaText,
  activeSourcePreviewItems,
  activeSourceStatusItems,
  hiddenActiveSourceCount,
  closeClosestDetailsMenu,
  quickActions,
  activeRaidSignal,
  onEnableWelcomeMode,
  onDismissRaidSignal,
  activePinnedMessage,
  onClearPinnedMessage,
  pollComposerOpen,
  pollQuestionDraft,
  onPollQuestionDraftChange,
  pollOptionsDraft,
  onPollOptionsDraftChange,
  onStartPoll,
  canStartPoll,
  onCancelPollComposer,
  activeTabPoll,
  onVoteInPoll,
  onCloseActivePoll,
  onClearActivePoll,
  messageFeed,
  newestLocked,
  pendingNewestCount,
  onJumpToNewest,
  composerPanel,
}: ChatWorkspaceProps) {
  const showSourceStatusBar = showActiveTabMeta;
  const showWorkspaceStatusBar = showSourceStatusBar || showToolbar;

  return (
    <main className="chat-main">
      {!activeTab ? (
        welcomeScreen
      ) : (
        <>
          {showWorkspaceStatusBar ? (
            <section className="toolbar workspace-statusbar">
              {showSourceStatusBar ? (
                <div className="workspace-statusbar__sources">
                  {isSimpleMode ? (
                    <span className="source-chip connected">
                      <span>{simpleActiveTabMetaText || "Live chat"}</span>
                    </span>
                  ) : (
                    <>
                      {activeSourcePreviewItems.map(
                        ({ source, status, staleSeconds }) => (
                          <span
                            key={source.id}
                            className={`source-chip ${status}`}
                          >
                            <PlatformIcon
                              platform={source.platform}
                              size="sm"
                              showBackground
                            />
                            <span>
                              {source.platform}/{source.channel} ({status}
                              {staleSeconds !== null && staleSeconds > 30
                                ? ` · lag ${staleSeconds}s`
                                : ""}
                              )
                            </span>
                          </span>
                        ),
                      )}
                      {hiddenActiveSourceCount > 0 ? (
                        <details className="source-more">
                          <summary>+{hiddenActiveSourceCount} more</summary>
                          <div className="source-more-menu">
                            <div className="menu-popover-header">
                              <span>Source status</span>
                              <button
                                type="button"
                                className="menu-close-button"
                                onClick={closeClosestDetailsMenu}
                                aria-label="Close source status menu"
                              >
                                ×
                              </button>
                            </div>
                            {activeSourceStatusItems
                              .slice(activeSourcePreviewItems.length)
                              .map(({ source, status, staleSeconds }) => (
                                <span
                                  key={source.id}
                                  className={`source-chip ${status}`}
                                >
                                  <PlatformIcon
                                    platform={source.platform}
                                    size="sm"
                                    showBackground
                                  />
                                  <span>
                                    {source.platform}/{source.channel} ({status}
                                    {staleSeconds !== null && staleSeconds > 30
                                      ? ` · lag ${staleSeconds}s`
                                      : ""}
                                    )
                                  </span>
                                </span>
                              ))}
                          </div>
                        </details>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {showToolbar ? (
                <div className="workspace-statusbar__summary-row">
                  <span className="workspace-statusbar__summary">
                    {toolbarSummaryText}
                  </span>
                  <div className="workspace-statusbar__actions">
                    {isAdvancedMode && firstUnreadTimestamp > 0 ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={onJumpToFirstUnread}
                      >
                        First unread
                      </button>
                    ) : null}
                    {isAdvancedMode && adaptivePerformanceMode ? (
                      <span className="account-pill on">Adaptive perf on</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {quickActions}

          {activeRaidSignal ? (
            <div className="raid-alert">
              <strong>Possible raid/host spike detected</strong>
              <span>
                {activeRaidSignal.messagesPerMinute}/min ·{" "}
                {activeRaidSignal.uniqueChatters} active chatters
              </span>
              <div className="menu-row">
                <button type="button" onClick={onEnableWelcomeMode}>
                  Enable Welcome Mode
                </button>
                <button type="button" onClick={onDismissRaidSignal}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {activePinnedMessage ? (
            <section className="workspace-callout">
              <div className="workspace-callout__header">
                <strong>Pinned</strong>
                <button type="button" onClick={onClearPinnedMessage}>
                  Unpin
                </button>
              </div>
              <span className="menu-muted">
                [{activePinnedMessage.platform}] #{activePinnedMessage.channel}{" "}
                · {activePinnedMessage.displayName} ·{" "}
                {new Date(activePinnedMessage.timestamp).toLocaleTimeString()}
              </span>
              <span>{activePinnedMessage.message}</span>
            </section>
          ) : null}

          {pollComposerOpen ? (
            <section className="workspace-callout workspace-callout--form">
              <div className="workspace-callout__header">
                <strong>Start Poll</strong>
              </div>
              <input
                value={pollQuestionDraft}
                onChange={(event) =>
                  onPollQuestionDraftChange(event.target.value)
                }
                placeholder="Question"
                maxLength={140}
              />
              <input
                value={pollOptionsDraft}
                onChange={(event) =>
                  onPollOptionsDraftChange(event.target.value)
                }
                placeholder="Options separated by comma, pipe, or newline"
              />
              <div className="menu-row">
                <button
                  type="button"
                  onClick={onStartPoll}
                  disabled={!canStartPoll}
                >
                  Start poll
                </button>
                <button type="button" onClick={onCancelPollComposer}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {activeTabPoll ? (
            <section className="workspace-callout">
              <div className="workspace-callout__header">
                <strong>{activeTabPoll.question}</strong>
              </div>
              <span className="menu-muted">
                {activeTabPoll.active ? "Live poll" : "Closed poll"} ·{" "}
                {new Date(activeTabPoll.createdAt).toLocaleTimeString()}
              </span>
              {activeTabPoll.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onVoteInPoll(option.id)}
                  disabled={!activeTabPoll.active}
                >
                  {option.label} ({option.votes})
                </button>
              ))}
              <div className="menu-row">
                {activeTabPoll.active ? (
                  <button type="button" onClick={onCloseActivePoll}>
                    Close poll
                  </button>
                ) : null}
                <button type="button" onClick={onClearActivePoll}>
                  Remove poll
                </button>
              </div>
            </section>
          ) : null}

          {messageFeed}

          {!newestLocked ? (
            <button
              type="button"
              className="go-newest-button"
              onClick={onJumpToNewest}
            >
              {pendingNewestCount > 0
                ? `▼ ${pendingNewestCount} new message${pendingNewestCount === 1 ? "" : "s"} - Click to resume`
                : "▼ Click to resume live feed"}
            </button>
          ) : null}

          {composerPanel}
        </>
      )}
    </main>
  );
}
