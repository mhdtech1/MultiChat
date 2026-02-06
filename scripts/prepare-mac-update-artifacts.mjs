#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

const desktopDir = process.cwd();
const distDir = path.join(desktopDir, "dist");
const appPath = path.join(distDir, "mac-arm64", "MultiChat.app");
const zipPath = path.join(distDir, "MultiChat-mac.zip");
const zipBlockmapPath = path.join(distDir, "MultiChat-mac.zip.blockmap");
const ymlPath = path.join(distDir, "latest-mac.yml");

if (!existsSync(appPath) || !existsSync(ymlPath)) {
  console.log("[mac-update] skipping: required mac artifacts are missing");
  process.exit(0);
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "multichat-mac-update-"));
const stagedAppPath = path.join(tempDir, "MultiChat.app");

try {
  execFileSync("ditto", [appPath, stagedAppPath], { stdio: "inherit" });

  // Remove filesystem metadata that breaks strict code-signature verification.
  execFileSync("xattr", ["-cr", stagedAppPath], { stdio: "inherit" });
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", stagedAppPath], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", stagedAppPath], { stdio: "inherit" });

  rmSync(zipPath, { force: true });
  execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", stagedAppPath, zipPath], {
    stdio: "inherit"
  });

  // Remove stale blockmap because the zip was recreated manually.
  rmSync(zipBlockmapPath, { force: true });

  const zipBuffer = readFileSync(zipPath);
  const zipSha512 = crypto.createHash("sha512").update(zipBuffer).digest("base64");
  const zipSize = statSync(zipPath).size;

  const parsed = yaml.load(readFileSync(ymlPath, "utf8"));
  const doc = parsed && typeof parsed === "object" ? { ...parsed } : {};
  const files = Array.isArray(doc.files) ? [...doc.files] : [];

  let sawZip = false;
  const nextFiles = files
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const file = entry;
      if (typeof file.url === "string" && file.url === "MultiChat-mac.zip") {
        sawZip = true;
        return {
          ...file,
          sha512: zipSha512,
          size: zipSize
        };
      }
      return file;
    });

  if (!sawZip) {
    nextFiles.unshift({
      url: "MultiChat-mac.zip",
      sha512: zipSha512,
      size: zipSize
    });
  }

  doc.files = nextFiles;
  doc.path = "MultiChat-mac.zip";
  doc.sha512 = zipSha512;

  writeFileSync(ymlPath, yaml.dump(doc, { lineWidth: -1, noRefs: true }), "utf8");
  console.log("[mac-update] prepared signed zip + refreshed latest-mac.yml");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
