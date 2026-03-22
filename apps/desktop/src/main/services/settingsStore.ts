import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { AppSettings } from "../../shared/types.js";

const SENSITIVE_KEYS = [
  "twitchToken",
  "kickAccessToken",
  "kickRefreshToken",
  "youtubeAccessToken",
  "youtubeRefreshToken",
  "tiktokSessionId",
  "kickClientSecret",
  "youtubeClientSecret",
];

export class JsonSettingsStore {
  private readonly filePath: string;
  private readonly defaults: AppSettings;
  private readonly hasLoadedPersistedState: boolean;
  private state: AppSettings;

  constructor(defaults: AppSettings, fileName = "settings.json") {
    this.defaults = defaults;
    this.filePath = path.join(app.getPath("userData"), fileName);
    const persisted = this.readFromDisk();
    this.hasLoadedPersistedState = Object.keys(persisted).length > 0;
    this.state = { ...defaults, ...persisted };
    this.writeToDisk();
  }

  get store(): AppSettings {
    return { ...this.state };
  }

  get hasPersistedState(): boolean {
    return this.hasLoadedPersistedState;
  }

  getAll(): AppSettings {
    return this.store;
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.state[key];
  }

  set(updates: Partial<AppSettings>): void;
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  set<K extends keyof AppSettings>(
    arg1: K | Partial<AppSettings>,
    arg2?: AppSettings[K],
  ): void {
    if (typeof arg1 === "string") {
      this.state[arg1] = arg2 as AppSettings[K];
    } else {
      this.state = { ...this.state, ...arg1 };
    }
    this.writeToDisk();
  }

  setMultiple(updates: Partial<AppSettings>): void {
    this.set(updates);
  }

  reset(overrides: Partial<AppSettings> = {}): void {
    this.state = { ...this.defaults, ...overrides };
    this.writeToDisk();
  }

  clear(): void {
    this.state = { ...this.defaults };
    this.writeToDisk();
  }

  removeKeys(keys: string[]): void {
    const nextState = { ...(this.state as Record<string, unknown>) };
    let changed = false;
    for (const key of keys) {
      if (!(key in nextState)) continue;
      delete nextState[key];
      changed = true;
    }
    if (!changed) return;
    this.state = nextState as AppSettings;
    this.writeToDisk();
  }

  private readFromDisk(): AppSettings {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const safeState = { ...(this.state as Record<string, unknown>) };
    for (const key of SENSITIVE_KEYS) {
      delete safeState[key];
    }
    const serialized = `${JSON.stringify(safeState, null, 2)}\n`;
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, serialized, "utf8");
    fs.renameSync(tempPath, this.filePath);
  }
}
