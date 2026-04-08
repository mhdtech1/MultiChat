#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const APP_IDENTIFIER = "com.multichat.desktop";
const APP_NAME = "Chatrix";
const buildArch = (process.env.MAC_BUILD_ARCH ?? "").trim().toLowerCase();
const artifactSuffixValue = (process.env.MAC_ARTIFACT_SUFFIX ?? "")
  .trim()
  .toLowerCase();
const artifactSuffix = artifactSuffixValue ? `-${artifactSuffixValue}` : "";
const desktopDir = process.cwd();
const desktopPkgPath = path.join(desktopDir, "package.json");
const builderConfigPath = path.join(desktopDir, "electron-builder.yml");
const distDir = path.join(desktopDir, "dist");
const appPathCandidates = [
  buildArch === "universal"
    ? path.join(distDir, "mac-universal", `${APP_NAME}.app`)
    : "",
  buildArch ? path.join(distDir, `mac-${buildArch}`, `${APP_NAME}.app`) : "",
  buildArch === "x64" ? path.join(distDir, "mac", `${APP_NAME}.app`) : "",
  buildArch === "universal" ? path.join(distDir, "mac", `${APP_NAME}.app`) : "",
  path.join(distDir, "mac-arm64", `${APP_NAME}.app`),
  path.join(distDir, "mac-x64", `${APP_NAME}.app`),
  path.join(distDir, "mac", `${APP_NAME}.app`),
].filter(Boolean);
const appPath = appPathCandidates.find((candidate) => existsSync(candidate));
const zipFileName = `${APP_NAME}-mac${artifactSuffix}.zip`;
const dmgFileName = `${APP_NAME}-mac${artifactSuffix}.dmg`;
const zipPath = path.join(distDir, zipFileName);
const dmgPath = path.join(distDir, dmgFileName);
const zipBlockmapPath = path.join(distDir, `${zipFileName}.blockmap`);
const dmgBlockmapPath = path.join(distDir, `${dmgFileName}.blockmap`);
const ymlSuffix = artifactSuffixValue ? `-${artifactSuffixValue}` : "";
const ymlPath = path.join(distDir, `latest-mac${ymlSuffix}.yml`);
const stableYmlPath = path.join(distDir, `stable-mac${ymlSuffix}.yml`);

if (!appPath || !existsSync(appPath)) {
  console.log(
    `[mac-update] skipping: mac app bundle was not found for ${buildArch || "default"} build`,
  );
  process.exit(0);
}

const appVersion = (() => {
  try {
    const pkg = JSON.parse(readFileSync(desktopPkgPath, "utf8"));
    return typeof pkg?.version === "string" && pkg.version.length > 0
      ? pkg.version
      : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const appUpdatePublishConfig = (() => {
  try {
    const parsed = yaml.load(readFileSync(builderConfigPath, "utf8"));
    if (parsed && typeof parsed === "object") {
      const publish = parsed.publish;
      const primary = Array.isArray(publish) ? publish[0] : publish;
      if (primary && typeof primary === "object") {
        return {
          ...primary,
          updaterCacheDirName: APP_IDENTIFIER,
        };
      }
    }
  } catch {
    // fall through
  }

  return {
    provider: "github",
    owner: "mhdtech1",
    repo: "Chatrix",
    updaterCacheDirName: APP_IDENTIFIER,
  };
})();

const tempDir = mkdtempSync(
  path.join(os.tmpdir(), `chatrix-mac-release-${buildArch || "default"}-`),
);
const stagedAppPath = path.join(tempDir, `${APP_NAME}.app`);
const dmgRootPath = path.join(tempDir, "dmg-root");
const verifyExtractDir = path.join(tempDir, "verify-extract");

const toSha512 = (filePath) => {
  const buffer = readFileSync(filePath);
  return crypto.createHash("sha512").update(buffer).digest("base64");
};

try {
  execFileSync("ditto", [appPath, stagedAppPath], { stdio: "inherit" });

  // Remove file-provider metadata and apply stable ad-hoc signing.
  execFileSync("xattr", ["-cr", stagedAppPath], { stdio: "inherit" });
  writeFileSync(
    path.join(stagedAppPath, "Contents", "Resources", "app-update.yml"),
    yaml.dump(appUpdatePublishConfig, { lineWidth: -1, noRefs: true }),
    "utf8",
  );
  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--identifier",
      APP_IDENTIFIER,
      "--requirements",
      `=designated => identifier "${APP_IDENTIFIER}"`,
      stagedAppPath,
    ],
    { stdio: "inherit" },
  );
  execFileSync("codesign", ["--verify", "--deep", "--strict", stagedAppPath], {
    stdio: "inherit",
  });

  rmSync(zipPath, { force: true });
  execFileSync(
    "ditto",
    ["-c", "-k", "--sequesterRsrc", "--keepParent", stagedAppPath, zipPath],
    {
      stdio: "inherit",
    },
  );

  rmSync(dmgPath, { force: true });
  mkdirSync(dmgRootPath, { recursive: true });
  execFileSync(
    "ditto",
    [stagedAppPath, path.join(dmgRootPath, `${APP_NAME}.app`)],
    {
      stdio: "inherit",
    },
  );
  symlinkSync("/Applications", path.join(dmgRootPath, "Applications"));
  execFileSync(
    "hdiutil",
    [
      "create",
      "-volname",
      APP_NAME,
      "-srcfolder",
      dmgRootPath,
      "-ov",
      "-format",
      "UDZO",
      dmgPath,
    ],
    {
      stdio: "inherit",
    },
  );

  // Remove stale blockmaps generated by electron-builder artifacts we replaced.
  rmSync(zipBlockmapPath, { force: true });
  rmSync(dmgBlockmapPath, { force: true });

  // Verify zip payload is still strictly signed after extraction.
  rmSync(verifyExtractDir, { recursive: true, force: true });
  execFileSync("mkdir", ["-p", verifyExtractDir], { stdio: "inherit" });
  execFileSync("ditto", ["-x", "-k", zipPath, verifyExtractDir], {
    stdio: "inherit",
  });
  execFileSync(
    "codesign",
    [
      "--verify",
      "--deep",
      "--strict",
      path.join(verifyExtractDir, `${APP_NAME}.app`),
    ],
    {
      stdio: "inherit",
    },
  );

  const zipSha512 = toSha512(zipPath);
  const dmgSha512 = toSha512(dmgPath);
  const zipSize = statSync(zipPath).size;
  const dmgSize = statSync(dmgPath).size;

  const latestMac = {
    version: appVersion,
    files: [
      { url: zipFileName, sha512: zipSha512, size: zipSize },
      { url: dmgFileName, sha512: dmgSha512, size: dmgSize },
    ],
    path: zipFileName,
    sha512: zipSha512,
    releaseDate: new Date().toISOString(),
  };

  const ymlContent = yaml.dump(latestMac, { lineWidth: -1, noRefs: true });
  writeFileSync(ymlPath, ymlContent, "utf8");
  writeFileSync(stableYmlPath, ymlContent, "utf8");
  console.log(
    `[mac-update] generated signed ${zipFileName}/${dmgFileName} and refreshed ${path.basename(
      ymlPath,
    )} + ${path.basename(stableYmlPath)}`,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
