import fs from "node:fs/promises";
import path from "node:path";

const LEGACY_APP_NAME = "MultiChat";

type CleanupTarget = {
  path: string;
  label: string;
};

type ResolveCleanupTargetsOptions = {
  platform: NodeJS.Platform;
  currentExePath: string;
  homeDir?: string;
  localAppDataDir?: string;
};

const resolveMacBundlePath = (currentExePath: string): string | null => {
  const marker = ".app/";
  const markerIndex = currentExePath.indexOf(marker);
  if (markerIndex === -1) return null;
  return currentExePath.slice(0, markerIndex + ".app".length);
};

export const resolveLegacyInstallCleanupTargets = ({
  platform,
  currentExePath,
  homeDir = "",
  localAppDataDir = "",
}: ResolveCleanupTargetsOptions): CleanupTarget[] => {
  if (platform === "darwin") {
    const currentExe = path.posix.resolve(currentExePath);
    const currentBundlePath = resolveMacBundlePath(currentExe);
    if (!currentBundlePath) return [];

    const installDir = path.posix.dirname(currentBundlePath);
    const allowedInstallDirs = new Set(
      ["/Applications", homeDir ? path.join(homeDir, "Applications") : ""]
        .filter(Boolean)
        .map((value) => path.posix.resolve(value)),
    );
    if (!allowedInstallDirs.has(path.posix.resolve(installDir))) {
      return [];
    }

    const legacyBundlePath = path.posix.resolve(
      path.posix.join(installDir, `${LEGACY_APP_NAME}.app`),
    );
    if (legacyBundlePath === path.posix.resolve(currentBundlePath)) {
      return [];
    }

    return [
      {
        path: legacyBundlePath,
        label: `${LEGACY_APP_NAME}.app`,
      },
    ];
  }

  if (platform === "win32") {
    if (!localAppDataDir) return [];

    const currentExe = path.win32.resolve(currentExePath);
    const currentInstallDir = path.win32.dirname(currentExe);
    const programsDir = path.win32.resolve(
      path.win32.join(localAppDataDir, "Programs"),
    );
    if (
      path.win32.resolve(path.win32.dirname(currentInstallDir)) !== programsDir
    ) {
      return [];
    }

    const legacyInstallDir = path.win32.resolve(
      path.win32.join(programsDir, LEGACY_APP_NAME),
    );
    if (legacyInstallDir === path.win32.resolve(currentInstallDir)) {
      return [];
    }

    return [
      {
        path: legacyInstallDir,
        label: LEGACY_APP_NAME,
      },
    ];
  }

  return [];
};

type CleanupLegacyInstallArtifactsOptions = ResolveCleanupTargetsOptions & {
  logger?: (message: string) => void;
};

export const cleanupLegacyInstallArtifacts = async ({
  logger,
  ...options
}: CleanupLegacyInstallArtifactsOptions): Promise<void> => {
  const targets = resolveLegacyInstallCleanupTargets(options);
  for (const target of targets) {
    try {
      await fs.rm(target.path, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
      logger?.(`[install-cleanup] removed legacy install ${target.label}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger?.(
        `[install-cleanup] failed to remove legacy install ${target.label}: ${detail}`,
      );
    }
  }
};
