import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const appDir = path.join(process.cwd(), "apps", "desktop");

execSync("pnpm --filter @multichat/desktop build:main", { stdio: "inherit" });

const require = createRequire(path.join(appDir, "package.json"));
const electronPath = require("electron");

const mainPath = path.join(appDir, "dist", "main", "main.js");

const child = spawn(electronPath, [mainPath], {
  env: {
    ...process.env,
    E2E_SMOKE: "1",
    VITE_DEV_SERVER_URL: "about:blank"
  },
  stdio: "inherit"
});

const timeout = setTimeout(() => {
  child.kill();
}, 8000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    process.exit(code ?? 1);
  }
});
