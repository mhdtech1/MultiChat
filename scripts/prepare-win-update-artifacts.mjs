#!/usr/bin/env node

import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const desktopDir = process.cwd();
const distDir = path.join(desktopDir, "dist");
const latestYmlPath = path.join(distDir, "latest.yml");
const stableYmlPath = path.join(distDir, "stable.yml");

if (!existsSync(latestYmlPath)) {
  console.log("[win-update] skipping: latest.yml was not found");
  process.exit(0);
}

copyFileSync(latestYmlPath, stableYmlPath);
console.log("[win-update] generated stable.yml from latest.yml");
