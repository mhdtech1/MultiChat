type TopBarProps = {
  onAddChannel?: () => void;
  onOpenSettings?: () => void;
};

export function TopBar({ onAddChannel, onOpenSettings }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <div className="top-bar__logo" aria-hidden="true">
          💬
        </div>
        <h1 className="top-bar__title">MultiChat</h1>
      </div>
      <div className="top-bar__actions">
        <button
          type="button"
          className="top-bar__button top-bar__button--primary"
          onClick={onAddChannel}
        >
          Add Channel
        </button>
        <button
          type="button"
          className="top-bar__button"
          onClick={onOpenSettings}
        >
          Settings
        </button>
      </div>
    </header>
  );
}
