import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn()
  }
}));

describe("JsonSettingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty object when settings file does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { JsonSettingsStore } = await import("../../src/main/services/settingsStore");
    const store = new JsonSettingsStore({});
    expect(store.getAll()).toEqual({});
  });

  it("reads existing settings from disk", async () => {
    const mockSettings = { theme: "dark", welcomeMode: true };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSettings) as any);
    const { JsonSettingsStore } = await import("../../src/main/services/settingsStore");
    const store = new JsonSettingsStore({});
    expect(store.getAll()).toMatchObject(mockSettings);
  });

  it("omits sensitive keys when persisting to disk and writes atomically", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { JsonSettingsStore } = await import("../../src/main/services/settingsStore");
    const store = new JsonSettingsStore({});
    store.set({
      twitchToken: "secret-token",
      tiktokSessionId: "session-token",
      kickClientSecret: "kick-secret",
      theme: "light"
    });

    const [tmpPath, serialized] = vi.mocked(fs.writeFileSync).mock.calls.at(-1) ?? [];
    expect(String(tmpPath)).toContain(".tmp");
    expect(String(serialized)).toContain("\"theme\": \"light\"");
    expect(String(serialized)).not.toContain("twitchToken");
    expect(String(serialized)).not.toContain("tiktokSessionId");
    expect(String(serialized)).not.toContain("kickClientSecret");
    expect(vi.mocked(fs.renameSync)).toHaveBeenCalledTimes(2);
    const renameCall = vi.mocked(fs.renameSync).mock.calls.at(-1) ?? [];
    expect(String(renameCall[0])).toContain(".tmp");
  });
});
