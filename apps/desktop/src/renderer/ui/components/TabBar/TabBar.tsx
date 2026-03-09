type TabItem = {
  id: string;
  label: string;
  unread?: number;
};

type TabBarProps = {
  tabs: TabItem[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onAddTab?: () => void;
};

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}: TabBarProps) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTabId ? "tab-item active" : "tab-item"}
          onClick={() => onSelectTab?.(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.unread ? <span className="tab-unread">{tab.unread}</span> : null}
          {onCloseTab ? (
            <span
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ×
            </span>
          ) : null}
        </button>
      ))}
      <button type="button" className="tab-item add" onClick={onAddTab}>
        +
      </button>
    </div>
  );
}
