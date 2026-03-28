import type { WorkspacePreset } from "../../shared/types";

export type WorkspacePresetConfig = {
  uiMode: "simple" | "advanced";
  dockedPanels: {
    mentions: boolean;
    modHistory: boolean;
    userCard: boolean;
    globalTimeline: boolean;
  };
  globalSearchMode: boolean;
  collaborationMode: boolean;
};

export type WorkspacePresetDecision = {
  preset: WorkspacePreset;
  role:
    | "idle"
    | "broadcaster"
    | "moderator"
    | "shared-chat"
    | "multi-channel"
    | "viewer";
  label: string;
  reason: string;
};

type WorkspacePresetDecisionInput = {
  hasActiveTab: boolean;
  isMergedTab: boolean;
  hasSharedChat: boolean;
  isBroadcaster: boolean;
  canModerate: boolean;
};

const PRESET_CONFIG: Record<WorkspacePreset, WorkspacePresetConfig> = {
  streamer: {
    uiMode: "simple",
    dockedPanels: {
      mentions: false,
      modHistory: false,
      userCard: false,
      globalTimeline: false,
    },
    globalSearchMode: false,
    collaborationMode: false,
  },
  moddesk: {
    uiMode: "advanced",
    dockedPanels: {
      mentions: true,
      modHistory: true,
      userCard: true,
      globalTimeline: true,
    },
    globalSearchMode: true,
    collaborationMode: true,
  },
  viewer: {
    uiMode: "simple",
    dockedPanels: {
      mentions: true,
      modHistory: false,
      userCard: false,
      globalTimeline: false,
    },
    globalSearchMode: false,
    collaborationMode: false,
  },
};

export const getWorkspacePresetConfig = (
  preset: WorkspacePreset,
): WorkspacePresetConfig => PRESET_CONFIG[preset];

export const formatWorkspacePresetLabel = (preset: WorkspacePreset): string => {
  if (preset === "moddesk") return "Mod Desk";
  if (preset === "streamer") return "Streamer";
  return "Viewer";
};

export const resolveWorkspacePresetDecision = ({
  hasActiveTab,
  isMergedTab,
  hasSharedChat,
  isBroadcaster,
  canModerate,
}: WorkspacePresetDecisionInput): WorkspacePresetDecision => {
  if (!hasActiveTab) {
    return {
      preset: "viewer",
      role: "idle",
      label: "Waiting",
      reason: "Open a channel tab and Chatrix will match the desk to your role.",
    };
  }

  if (isMergedTab) {
    return {
      preset: "moddesk",
      role: "multi-channel",
      label: "Multi-channel",
      reason: "Merged tabs use Mod Desk so routing and moderation stay visible.",
    };
  }

  if (hasSharedChat) {
    return {
      preset: "moddesk",
      role: "shared-chat",
      label: "Shared chat",
      reason: "Shared chat needs the denser desk so linked-channel tools stay in reach.",
    };
  }

  if (isBroadcaster) {
    return {
      preset: "streamer",
      role: "broadcaster",
      label: "Broadcaster",
      reason: "You are in your own channel, so the focused Streamer desk fits best.",
    };
  }

  if (canModerate) {
    return {
      preset: "moddesk",
      role: "moderator",
      label: "Moderator",
      reason: "You can moderate this channel, so Mod Desk keeps those tools ready.",
    };
  }

  return {
    preset: "viewer",
    role: "viewer",
    label: "Viewer",
    reason: "You are watching a channel where you do not have broadcaster or mod tools.",
  };
};
