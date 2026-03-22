import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLegacyInstallCleanupTargets } from "../../src/main/services/legacyInstallCleanup";

describe("resolveLegacyInstallCleanupTargets", () => {
  it("targets legacy MultiChat.app beside a packaged mac Chatrix app", () => {
    const targets = resolveLegacyInstallCleanupTargets({
      platform: "darwin",
      currentExePath: "/Applications/Chatrix.app/Contents/MacOS/Chatrix",
      homeDir: "/Users/mazen",
    });

    expect(targets).toEqual([
      {
        path: "/Applications/MultiChat.app",
        label: "MultiChat.app",
      },
    ]);
  });

  it("does not target apps outside Applications on mac", () => {
    const targets = resolveLegacyInstallCleanupTargets({
      platform: "darwin",
      currentExePath: "/Volumes/Chatrix/Chatrix.app/Contents/MacOS/Chatrix",
      homeDir: "/Users/mazen",
    });

    expect(targets).toEqual([]);
  });

  it("targets the legacy MultiChat install directory on Windows", () => {
    const targets = resolveLegacyInstallCleanupTargets({
      platform: "win32",
      currentExePath:
        "C:\\Users\\mazen\\AppData\\Local\\Programs\\Chatrix\\Chatrix.exe",
      localAppDataDir: "C:\\Users\\mazen\\AppData\\Local",
    });

    expect(targets).toEqual([
      {
        path: path.win32.resolve(
          "C:\\Users\\mazen\\AppData\\Local\\Programs\\MultiChat",
        ),
        label: "MultiChat",
      },
    ]);
  });

  it("does not target the current install when still running from MultiChat", () => {
    const targets = resolveLegacyInstallCleanupTargets({
      platform: "win32",
      currentExePath:
        "C:\\Users\\mazen\\AppData\\Local\\Programs\\MultiChat\\MultiChat.exe",
      localAppDataDir: "C:\\Users\\mazen\\AppData\\Local",
    });

    expect(targets).toEqual([]);
  });
});
