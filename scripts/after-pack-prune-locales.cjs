const fs = require("node:fs");
const path = require("node:path");

const KEEP_MAC_LPROJ = new Set(["en.lproj", "en-US.lproj"]);
const KEEP_WIN_LOCALES = new Set(["en-US.pak"]);

const safeRemove = (targetPath) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // no-op
  }
};

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const appOutDir = context.appOutDir;

  if (platform === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    const frameworkResourcesDir = path.join(
      appOutDir,
      `${appName}.app`,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
      "Resources"
    );
    const appResourcesDir = path.join(appOutDir, `${appName}.app`, "Contents", "Resources");

    for (const resourcesDir of [frameworkResourcesDir, appResourcesDir]) {
      if (!fs.existsSync(resourcesDir)) continue;
      const entries = fs.readdirSync(resourcesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.endsWith(".lproj")) continue;
        if (KEEP_MAC_LPROJ.has(entry.name)) continue;
        safeRemove(path.join(resourcesDir, entry.name));
      }
    }
  }

  if (platform === "win32") {
    const localesDir = path.join(appOutDir, "locales");
    if (fs.existsSync(localesDir)) {
      const entries = fs.readdirSync(localesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".pak")) continue;
        if (KEEP_WIN_LOCALES.has(entry.name)) continue;
        safeRemove(path.join(localesDir, entry.name));
      }
    }
  }
};
