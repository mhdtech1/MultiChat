import { useState, type KeyboardEvent } from "react";
import type { ModeratorAction, Platform } from "../../../../shared/types";

type WritableSource = {
  id: string;
  platform: Platform;
  channel: string;
};

type ComposerCounterTone = "normal" | "warn" | "danger";

type ChatComposerPanelProps = {
  writableSources: WritableSource[];
  sendTargetId: string;
  allTargetId: string;
  onSendTargetChange: (value: string) => void;
  composerText: string;
  onComposerTextChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  composerPlaceholder: string;
  composerCharacterCount: number;
  composerCounterTone: ComposerCounterTone;
  composerLimit: number;
  isAdvancedMode: boolean;
  canModerateActiveTab: boolean;
  snippetToInsert: string;
  onSnippetSelect: (value: string) => void;
  commandSnippets: string[];
  sending: boolean;
  onSend: () => void;
  commandPaletteOpen: boolean;
  commandSuggestions: string[];
  onSelectCommandSuggestion: (suggestion: string) => void;
  showQuickMod: boolean;
  quickModUser: string;
  onQuickModUserChange: (value: string) => void;
  onRunQuickMod: (action: Exclude<ModeratorAction, "delete">) => void;
  autoBanEnabled: boolean;
  onToggleAutoBan: () => void;
};

export function ChatComposerPanel({
  writableSources,
  sendTargetId,
  allTargetId,
  onSendTargetChange,
  composerText,
  onComposerTextChange,
  onComposerKeyDown,
  composerPlaceholder,
  composerCharacterCount,
  composerCounterTone,
  composerLimit,
  isAdvancedMode,
  canModerateActiveTab,
  snippetToInsert,
  onSnippetSelect,
  commandSnippets,
  sending,
  onSend,
  commandPaletteOpen,
  commandSuggestions,
  onSelectCommandSuggestion,
  showQuickMod,
  quickModUser,
  onQuickModUserChange,
  onRunQuickMod,
  autoBanEnabled,
  onToggleAutoBan,
}: ChatComposerPanelProps) {
  const [advancedQuickModOpen, setAdvancedQuickModOpen] = useState(false);

  return (
    <section className="action-rail">
      <form
        className="composer composer--main"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        {writableSources.length > 0 ? (
          <select
            className="composer-main__target"
            value={sendTargetId}
            onChange={(event) => onSendTargetChange(event.target.value)}
          >
            {writableSources.length > 1 ? (
              <option value={allTargetId}>
                [ALL] All writable chats in this tab ({writableSources.length})
              </option>
            ) : null}
            {writableSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.platform}/{source.channel}
              </option>
            ))}
          </select>
        ) : null}
        <div className="composer-main__message-wrap">
          <input
            className="composer-main__message"
            value={composerText}
            onChange={(event) => onComposerTextChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={composerPlaceholder}
            maxLength={composerLimit}
            disabled={writableSources.length === 0}
          />
          <div className="composer-main__meta">
            <span
              className={`composer-main__counter${composerCounterTone === "normal" ? "" : ` composer-main__counter--${composerCounterTone}`}`}
              title={`Message length limit: ${composerLimit} characters`}
            >
              {composerCharacterCount} / {composerLimit}
            </span>
          </div>
        </div>
        {isAdvancedMode && canModerateActiveTab ? (
          <select
            className="composer-main__snippets"
            value={snippetToInsert}
            onChange={(event) => onSnippetSelect(event.target.value)}
            disabled={writableSources.length === 0}
          >
            <option value="">Snippets</option>
            {commandSnippets.map((snippet) => (
              <option key={snippet} value={snippet}>
                {snippet}
              </option>
            ))}
          </select>
        ) : null}
        <button
          className="composer-main__send"
          type="submit"
          disabled={
            sending || writableSources.length === 0 || !composerText.trim()
          }
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </form>

      {commandPaletteOpen && commandSuggestions.length > 0 ? (
        <div className="quick-mod-panel command-center-panel">
          <strong>Command Center</strong>
          {commandSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSelectCommandSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {showQuickMod ? (
        <div className="quick-mod-panel quick-mod-panel--action-rail">
          <div className="quick-mod-panel__compact-row">
            <strong>Quick Mod</strong>

            <div className="quick-mod-panel__identity">
              <input
                value={quickModUser}
                onChange={(event) => onQuickModUserChange(event.target.value)}
                placeholder="@username"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>

            <div className="quick-mod-panel__primary-actions">
              <button
                type="button"
                onClick={() => onRunQuickMod("timeout_60")}
                disabled={!canModerateActiveTab}
              >
                Timeout 1m
              </button>
              <button
                type="button"
                className="quick-mod-panel__danger"
                onClick={() => onRunQuickMod("ban")}
                disabled={!canModerateActiveTab}
              >
                Ban
              </button>
              <button
                type="button"
                onClick={() => setAdvancedQuickModOpen((previous) => !previous)}
              >
                {advancedQuickModOpen ? "Less" : "More"}
              </button>
            </div>

            {autoBanEnabled ? (
              <span className="quick-mod-panel__danger-indicator">
                Auto Ban ON
              </span>
            ) : null}
          </div>

          {advancedQuickModOpen ? (
            <div className="quick-mod-panel__expanded">
              <div className="quick-mod-panel__secondary-actions">
                <button
                  type="button"
                  onClick={() => onRunQuickMod("timeout_600")}
                  disabled={!canModerateActiveTab}
                >
                  Timeout 10m
                </button>
                <button
                  type="button"
                  onClick={() => onRunQuickMod("unban")}
                  disabled={!canModerateActiveTab}
                >
                  Unban
                </button>
              </div>

              <div className="quick-mod-panel__emergency">
                <button
                  type="button"
                  className={
                    autoBanEnabled
                      ? "quick-mod-panel__danger active"
                      : "quick-mod-panel__danger"
                  }
                  onClick={onToggleAutoBan}
                >
                  {autoBanEnabled ? "Auto Ban: ON" : "Auto Ban: OFF"}
                </button>
                <span className="menu-muted">
                  Emergency mode. Every new chatter message triggers a ban
                  attempt.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
