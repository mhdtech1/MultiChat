import React from "react";
import { PlatformIcon } from "./PlatformIcon";

type WelcomeScreenProps = {
  onAddChannel?: () => void;
  onOpenSettings?: () => void;
};

export function WelcomeScreen({
  onAddChannel,
  onOpenSettings,
}: WelcomeScreenProps) {
  return (
    <div className="welcome-screen" role="region" aria-label="Welcome">
      <div className="welcome-screen__content">
        <div className="welcome-screen__hero">
          <div className="welcome-screen__logo" aria-hidden="true">
            <span className="welcome-screen__logo-icon">💬</span>
          </div>
          <h1 className="welcome-screen__title">
            Welcome to <span className="welcome-screen__brand">Chatrix</span>
          </h1>
          <p className="welcome-screen__subtitle">
            One chat to rule them all. Connect Twitch, Kick, YouTube, and TikTok
            in a single friendly desk.
          </p>
        </div>

        <div className="welcome-screen__platforms">
          <div className="platform-pill">
            <PlatformIcon platform="twitch" size="md" showBackground />
            <span>Twitch</span>
          </div>
          <div className="platform-pill">
            <PlatformIcon platform="kick" size="md" showBackground />
            <span>Kick</span>
          </div>
          <div className="platform-pill">
            <PlatformIcon platform="youtube" size="md" showBackground />
            <span>YouTube</span>
          </div>
          <div className="platform-pill">
            <PlatformIcon platform="tiktok" size="md" showBackground />
            <span>TikTok</span>
          </div>
        </div>

        <div className="welcome-screen__actions">
          <button
            className="welcome-screen__button welcome-screen__button--primary"
            onClick={onAddChannel}
            type="button"
          >
            <span className="welcome-screen__button-icon" aria-hidden="true">
              ➕
            </span>
            Add Your First Channel
          </button>
          <button
            className="welcome-screen__button welcome-screen__button--secondary"
            onClick={onOpenSettings}
            type="button"
          >
            <span className="welcome-screen__button-icon" aria-hidden="true">
              ⚙️
            </span>
            Open Settings
          </button>
        </div>

        <div className="welcome-screen__features">
          <div className="feature-card">
            <span className="feature-card__icon" aria-hidden="true">
              🎯
            </span>
            <h3 className="feature-card__title">Unified Chat</h3>
            <p className="feature-card__description">
              See all your chats in one place with clear platform indicators.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-card__icon" aria-hidden="true">
              ⚡
            </span>
            <h3 className="feature-card__title">Fast Moderation</h3>
            <p className="feature-card__description">
              Apply quick moderation actions without leaving the feed.
            </p>
          </div>
          <div className="feature-card">
            <span className="feature-card__icon" aria-hidden="true">
              🎨
            </span>
            <h3 className="feature-card__title">Customizable</h3>
            <p className="feature-card__description">
              Themes, filters, and layout controls tailored to your workflow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomeScreen;
