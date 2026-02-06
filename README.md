# MultiChat (Electron)

Creator-facing and viewer-facing multi-chat desktop app built with Electron + Vite + React + TypeScript.

## Features

- Multi-column chat (1–4 columns) with channel tabs, search, and filters.
- Twitch chat sign-in flow (OAuth) with token/username auto-fill.
- Kick sign-in flow (OAuth) with token storage for future adapter use.
- Unified message model across Twitch/Kick/YouTube.
- OBS-friendly overlay pop-out window and viewer mode.
- Local-only moderation helpers (keyword filters, highlights, copy actions).
- Hotkeys for overlay, search focus, and clearing the chat.
- Local JSON settings storage (local only).
- Secure IPC (contextIsolation + preload API).

## Requirements

- Node.js >= 20
- pnpm >= 9

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Testing

```bash
pnpm test
```

## Linting & Formatting

```bash
pnpm lint
pnpm format
```

## Build & Package

```bash
pnpm build
```

Electron Builder will generate a DMG (macOS) or NSIS installer (Windows) for your current OS.

### Build Mac DMG Only

```bash
pnpm build:mac
```

This creates a single installer file at:

- `apps/desktop/dist/MultiChat-mac-<version>.dmg`

### Recreate Mac Build From Scratch

```bash
pnpm recreate:mac
```

This removes existing dependencies/build outputs, reinstalls everything, and creates a fresh DMG.

### Installers (macOS + Windows)

- macOS: `apps/desktop/dist/*.dmg`
- Windows: `apps/desktop/dist/*.exe` (NSIS installer)

To build for each OS, run the build command on that OS or use CI runners for macOS and Windows.

### Updates

Auto-updates are configured through GitHub Releases (`mhdtech1/MultiChat`).
After publishing a newer release, the app downloads it in the background and applies it on app restart.

## Configuration

Settings are stored locally in `settings.json` under Electron `userData` (not in git). Use the in-app Settings panel.

### Twitch

- Create a Twitch app and set a valid OAuth redirect URI.
- In app Settings, set `Twitch Client ID` (and optional redirect URI), then click **Sign in with Twitch**.
- The app stores the returned token and username automatically.

### YouTube

- Provide a YouTube API key and Live Chat ID.
- The app will poll the Live Chat API and normalize messages.

### Kick

- Create a Kick app and set a valid OAuth redirect URI.
- In app Settings, set `Kick Client ID`, `Kick Client Secret`, and redirect URI, then click **Sign in with Kick**.
- Kick chat adapter is still a stub; sign-in is wired and tokens are stored for upcoming chat integration.

## Project Structure

```
/
  apps/
    desktop/
      src/
        main/
        preload/
        renderer/
      electron-builder.yml
  packages/
    chat-core/
      src/
        adapters/
        types.ts
      tests/
```

## Security Notes

- `contextIsolation` is enabled.
- Node integration is disabled in the renderer.
- Only a safe preload API is exposed.

## .env

See `.env.example` for optional environment variables.
