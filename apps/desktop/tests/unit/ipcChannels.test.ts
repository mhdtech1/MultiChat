import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.resolve(__dirname, "../../src/preload/preload.cts");

const extractPreloadIpcChannels = (source: string): Record<string, string> => {
  const marker = "const IPC_CHANNELS = {";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error("IPC_CHANNELS constant not found in preload");
  }

  const objectStart = source.indexOf("{", markerIndex);
  const objectEnd = source.indexOf("} as const;", objectStart);
  if (objectStart === -1 || objectEnd === -1) {
    throw new Error("IPC_CHANNELS object block not found in preload");
  }

  const objectBody = source.slice(objectStart + 1, objectEnd);
  const channels: Record<string, string> = {};
  const entryRegex = /([A-Z0-9_]+)\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(objectBody)) !== null) {
    channels[match[1]] = match[2];
  }
  return channels;
};

describe("IPC channel contract", () => {
  it("keeps preload IPC channel map in sync with shared constants", () => {
    const preloadSource = fs.readFileSync(preloadPath, "utf8");
    const preloadChannels = extractPreloadIpcChannels(preloadSource);
    expect(preloadChannels).toEqual(IPC_CHANNELS);
  });
});

