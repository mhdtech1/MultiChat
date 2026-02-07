# MultiChat (Electron)

Creator-facing and viewer-facing multi-chat desktop app built with Electron + Vite + React + TypeScript.

## Download Installers

- macOS (DMG): [Download MultiChat for macOS](https://github.com/mhdtech1/MultiChat/releases/latest/download/MultiChat-mac.dmg)
- Windows (EXE): [Download MultiChat for Windows](https://github.com/mhdtech1/MultiChat/releases/latest/download/MultiChat-win.exe)

## macOS Gatekeeper Warning (Current)

If macOS says:

`Apple could not verify “MultiChat” is free of malware...`

that means the app is not yet signed + notarized with Apple Developer ID in release CI.

Temporary open steps:

1. Open the DMG and drag `MultiChat.app` to `Applications`.
2. In `Applications`, right-click `MultiChat.app` and click `Open`.
3. Click `Open` again in the security prompt.

If that prompt does not appear:

1. Open `System Settings -> Privacy & Security`.
2. Find the blocked MultiChat item and click `Open Anyway`.

Permanent fix (in progress):

- Sign with `Developer ID Application`.
- Notarize with Apple.
- Staple notarization ticket before publishing DMG.

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

### Windows Code Signing (GitHub Actions)

To avoid `Unknown publisher` and reduce SmartScreen warnings, add these GitHub repo secrets:

- `WIN_CSC_LINK`: Base64-encoded `.pfx` certificate file content
- `WIN_CSC_KEY_PASSWORD`: Password for that `.pfx`

Create `WIN_CSC_LINK` from your `.pfx`:

- macOS/Linux:
  `base64 -i your-cert.pfx | pbcopy`
- Windows PowerShell:
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-cert.pfx"))`

Then create a release tag (example `v0.1.9`) and push it:

```bash
git tag v0.1.9
git push origin v0.1.9
```

The workflow at `.github/workflows/release.yml` builds installers and publishes release artifacts to GitHub Releases.

### macOS Signing + Notarization (GitHub Actions)

To remove Gatekeeper warnings permanently, configure Apple signing credentials in GitHub secrets and notarize in CI.

Recommended credentials:

- `CSC_LINK`: Base64-encoded `.p12` Developer ID Application certificate
- `CSC_KEY_PASSWORD`: Password for that `.p12`
- `APPLE_API_KEY`: Base64-encoded App Store Connect API key (`.p8`)
- `APPLE_API_KEY_ID`: App Store Connect key id
- `APPLE_API_ISSUER`: App Store Connect issuer id

Once those are configured in workflow, releases can be signed/notarized automatically.

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
