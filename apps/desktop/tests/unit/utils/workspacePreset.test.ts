import { describe, expect, it } from "vitest";
import {
  formatWorkspacePresetLabel,
  getWorkspacePresetConfig,
  resolveWorkspacePresetDecision,
} from "../../../src/renderer/utils/workspacePreset";

describe("workspacePreset", () => {
  it("maps broadcaster tabs to the streamer desk", () => {
    expect(
      resolveWorkspacePresetDecision({
        hasActiveTab: true,
        isMergedTab: false,
        hasSharedChat: false,
        isBroadcaster: true,
        canModerate: true,
      }),
    ).toMatchObject({
      preset: "streamer",
      role: "broadcaster",
      label: "Broadcaster",
    });
  });

  it("maps moderator tabs to mod desk", () => {
    expect(
      resolveWorkspacePresetDecision({
        hasActiveTab: true,
        isMergedTab: false,
        hasSharedChat: false,
        isBroadcaster: false,
        canModerate: true,
      }),
    ).toMatchObject({
      preset: "moddesk",
      role: "moderator",
      label: "Moderator",
    });
  });

  it("maps merged tabs to mod desk even without mod rights", () => {
    expect(
      resolveWorkspacePresetDecision({
        hasActiveTab: true,
        isMergedTab: true,
        hasSharedChat: false,
        isBroadcaster: false,
        canModerate: false,
      }),
    ).toMatchObject({
      preset: "moddesk",
      role: "multi-channel",
    });
  });

  it("falls back to viewer when the user is just watching", () => {
    expect(
      resolveWorkspacePresetDecision({
        hasActiveTab: true,
        isMergedTab: false,
        hasSharedChat: false,
        isBroadcaster: false,
        canModerate: false,
      }),
    ).toMatchObject({
      preset: "viewer",
      role: "viewer",
    });
  });

  it("exposes stable preset labels and config", () => {
    expect(formatWorkspacePresetLabel("moddesk")).toBe("Mod Desk");
    expect(getWorkspacePresetConfig("viewer")).toMatchObject({
      uiMode: "simple",
      globalSearchMode: false,
      collaborationMode: false,
      dockedPanels: {
        mentions: true,
        modHistory: false,
        userCard: false,
        globalTimeline: false,
      },
    });
  });
});
