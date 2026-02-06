import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, "src/renderer"),
  // Electron file:// loads need relative asset paths in production.
  base: "./",
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, "dist/renderer"),
    emptyOutDir: true
  }
});
