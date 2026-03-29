import type { ChatMessage } from "@chatrix/chat-core";

type MentionInboxEntry = {
  id: string;
  platform: "twitch" | "kick" | "youtube" | "tiktok";
  channel: string;
  reason: "mention" | "reply";
  displayName: string;
};

type ModerationHistoryEntry = {
  id: string;
  at: string;
  action: string;
  target: string;
};

type IdentityTarget = {
  username: string;
  displayName: string;
};

type IdentityStats = {
  total: number;
  inLastMinute: number;
  inLastFiveMinutes: number;
};

export type ChatDockSidebarProps = {
  showMentions: boolean;
  mentionInbox: MentionInboxEntry[];
  onOpenMention: (entry: MentionInboxEntry) => void;
  platformIconGlyph: (platform: MentionInboxEntry["platform"]) => string;
  showGlobalTimeline: boolean;
  globalSearchMode: boolean;
  search: string;
  globalSearchResults: ChatMessage[];
  onOpenGlobalSearchResult: (message: ChatMessage) => void;
  isAdvancedMode: boolean;
  showModHistory: boolean;
  moderationHistory: ModerationHistoryEntry[];
  showUserCard: boolean;
  identityTarget: IdentityTarget | null;
  identityStats: IdentityStats;
};

export function ChatDockSidebar({
  showMentions,
  mentionInbox,
  onOpenMention,
  platformIconGlyph,
  showGlobalTimeline,
  globalSearchMode,
  search,
  globalSearchResults,
  onOpenGlobalSearchResult,
  isAdvancedMode,
  showModHistory,
  moderationHistory,
  showUserCard,
  identityTarget,
  identityStats,
}: ChatDockSidebarProps) {
  const showMentionsSection = showMentions && mentionInbox.length > 0;
  const showGlobalTimelineSection =
    showGlobalTimeline && globalSearchMode && search.trim().length > 0;
  const showModHistorySection =
    isAdvancedMode && showModHistory && moderationHistory.length > 0;
  const showUserCardSection =
    isAdvancedMode && showUserCard && Boolean(identityTarget);

  if (
    !showMentionsSection &&
    !showGlobalTimelineSection &&
    !showModHistorySection &&
    !showUserCardSection
  ) {
    return null;
  }

  return (
    <>
      {showMentionsSection ? (
        <section className="dock-panel">
          <div className="dock-panel__header">
            <strong>Mentions</strong>
            <span className="menu-muted">{mentionInbox.length} open</span>
          </div>
          {mentionInbox.slice(0, 8).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpenMention(entry)}
            >
              [{platformIconGlyph(entry.platform)}] #{entry.channel}{" "}
              {entry.reason === "reply" ? "Reply" : "Mention"} ·{" "}
              {entry.displayName}
            </button>
          ))}
        </section>
      ) : null}

      {showGlobalTimelineSection ? (
        <section className="dock-panel">
          <div className="dock-panel__header">
            <strong>Global Timeline</strong>
            <span className="menu-muted">
              {globalSearchResults.length} results
            </span>
          </div>
          {globalSearchResults.length === 0 ? (
            <span className="menu-muted">No results.</span>
          ) : (
            globalSearchResults.slice(0, 10).map((message) => (
              <button
                key={`${message.id}-${message.timestamp}`}
                type="button"
                onClick={() => onOpenGlobalSearchResult(message)}
              >
                [{platformIconGlyph(message.platform)}] #{message.channel}{" "}
                {message.displayName}: {message.message.slice(0, 42)}
              </button>
            ))
          )}
        </section>
      ) : null}

      {showModHistorySection ? (
        <section className="dock-panel">
          <div className="dock-panel__header">
            <strong>Mod History</strong>
            <span className="menu-muted">
              {moderationHistory.length} actions
            </span>
          </div>
          {moderationHistory.slice(0, 10).map((entry) => (
            <span key={entry.id} className="menu-muted">
              {new Date(entry.at).toLocaleTimeString()} {entry.action}{" "}
              {entry.target}
            </span>
          ))}
        </section>
      ) : null}

      {showUserCardSection ? (
        <section className="dock-panel">
          <div className="dock-panel__header">
            <strong>User Card</strong>
            <span className="menu-muted">Session stats</span>
          </div>
          <span className="menu-muted">
            {identityTarget?.displayName} @{identityTarget?.username}
          </span>
          <span className="menu-muted">
            Total {identityStats.total} · 1m {identityStats.inLastMinute} · 5m{" "}
            {identityStats.inLastFiveMinutes}
          </span>
        </section>
      ) : null}
    </>
  );
}
