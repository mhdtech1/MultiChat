import React, { useState } from "react";
import { PlatformIcon, type Platform } from "../common/PlatformIcon";

type SettingsTab = "accounts" | "appearance" | "chat" | "moderation" | "about";

type ConnectedAccount = {
  username: string;
  connected: boolean;
};

type ConnectedAccounts = Partial<Record<Platform, ConnectedAccount>>;

type SettingsPanelProps = {
  onClose?: () => void;
  connectedAccounts?: ConnectedAccounts;
  onConnectPlatform?: (platform: Platform) => void;
  onDisconnectPlatform?: (platform: Platform) => void;
};

const PLATFORMS: Array<{ id: Platform; name: string; description: string }> = [
  { id: "twitch", name: "Twitch", description: "Connect your Twitch account" },
  { id: "kick", name: "Kick", description: "Connect your Kick account" },
  {
    id: "youtube",
    name: "YouTube",
    description: "Connect your YouTube channel",
  },
  { id: "tiktok", name: "TikTok", description: "Connect your TikTok account" },
];

export function SettingsPanel({
  onClose,
  connectedAccounts = {},
  onConnectPlatform,
  onDisconnectPlatform,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("accounts");

  const renderAccountsTab = () => (
    <div className="settings-panel__section">
      <h3 className="settings-panel__section-title">Connected Platforms</h3>
      <div className="platform-cards">
        {PLATFORMS.map((platform) => {
          const account = connectedAccounts[platform.id];
          const isConnected = account?.connected ?? false;

          return (
            <div
              key={platform.id}
              className={`platform-card ${isConnected ? "platform-card--connected" : ""}`}
            >
              <div className="platform-card__icon">
                <PlatformIcon platform={platform.id} size="lg" showBackground />
              </div>
              <div className="platform-card__info">
                <div className="platform-card__name">{platform.name}</div>
                <div
                  className={`platform-card__status ${isConnected ? "platform-card__status--connected" : ""}`}
                >
                  {isConnected
                    ? `Connected as ${account?.username}`
                    : platform.description}
                </div>
              </div>
              <button
                className={`platform-card__action ${isConnected ? "platform-card__action--disconnect" : "platform-card__action--connect"}`}
                type="button"
                onClick={() => {
                  if (isConnected) {
                    onDisconnectPlatform?.(platform.id);
                  } else {
                    onConnectPlatform?.(platform.id);
                  }
                }}
              >
                {isConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderAppearanceTab = () => (
    <div className="settings-panel__section">
      <h3 className="settings-panel__section-title">Theme</h3>
      <div className="theme-selector">
        <button className="theme-option theme-option--active" type="button">
          <div className="theme-option__preview theme-option__preview--dark" />
          <span>Dark</span>
        </button>
        <button className="theme-option" type="button">
          <div className="theme-option__preview theme-option__preview--light" />
          <span>Light</span>
        </button>
        <button className="theme-option" type="button">
          <div className="theme-option__preview theme-option__preview--classic" />
          <span>Classic</span>
        </button>
      </div>

      <h3 className="settings-panel__section-title">Chat Display</h3>
      <div className="settings-group">
        <label className="settings-toggle">
          <span className="settings-toggle__label">Show timestamps</span>
          <input type="checkbox" defaultChecked aria-label="Show timestamps" />
          <span className="settings-toggle__switch" aria-hidden="true" />
        </label>
        <label className="settings-toggle">
          <span className="settings-toggle__label">Show platform icons</span>
          <input
            type="checkbox"
            defaultChecked
            aria-label="Show platform icons"
          />
          <span className="settings-toggle__switch" aria-hidden="true" />
        </label>
        <label className="settings-toggle">
          <span className="settings-toggle__label">Show badges</span>
          <input type="checkbox" defaultChecked aria-label="Show badges" />
          <span className="settings-toggle__switch" aria-hidden="true" />
        </label>
      </div>
    </div>
  );

  return (
    <div
      className="settings-panel"
      role="dialog"
      aria-label="Settings"
      aria-modal="true"
    >
      <div className="settings-panel__header">
        <h2 className="settings-panel__title">Settings</h2>
        <button
          className="settings-panel__close"
          type="button"
          onClick={onClose}
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <div className="settings-panel__tabs" role="tablist">
        {[
          { id: "accounts", label: "Accounts", icon: "👤" },
          { id: "appearance", label: "Appearance", icon: "🎨" },
          { id: "chat", label: "Chat", icon: "💬" },
          { id: "moderation", label: "Moderation", icon: "⚔️" },
          { id: "about", label: "About", icon: "ℹ️" },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            className={`settings-tab ${activeTab === tab.id ? "settings-tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
          >
            <span className="settings-tab__icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="settings-tab__label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        className="settings-panel__content"
        role="tabpanel"
        id={`settings-tabpanel-${activeTab}`}
        aria-labelledby={`settings-tab-${activeTab}`}
      >
        {activeTab === "accounts" ? renderAccountsTab() : null}
        {activeTab === "appearance" ? renderAppearanceTab() : null}
        {activeTab === "chat" ? (
          <div className="settings-panel__section">
            <p className="text-dim">Chat settings coming soon...</p>
          </div>
        ) : null}
        {activeTab === "moderation" ? (
          <div className="settings-panel__section">
            <p className="text-dim">Moderation settings coming soon...</p>
          </div>
        ) : null}
        {activeTab === "about" ? (
          <div className="settings-panel__section settings-about">
            <div className="settings-about__logo">💬</div>
            <h3>MultiChat</h3>
            <p className="text-dim">Version {__APP_VERSION__}</p>
            <p className="text-secondary">
              The unified streaming chat client for Twitch, Kick, YouTube, and
              TikTok.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SettingsPanel;
