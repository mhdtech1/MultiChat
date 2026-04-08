# Changelog

All notable changes to Chatrix are documented here.

## [1.0.10] – 2026-04-08

### Added

- **Linux builds** – Chatrix releases now include native Linux downloads in both `AppImage` and `deb` formats for `x64` systems.

### Changed

- **macOS installer architecture** – The default macOS release is now a single universal build, so one installer automatically runs natively on both Apple Silicon and Intel Macs.
- **Windows installer architecture** – Windows releases now use an auto-detecting NSIS web installer that selects the correct `x64` or `ARM64` package for the device during install.
- **Release automation** – GitHub Actions now publishes Windows `x64` + `ARM64`, universal macOS, and Linux artifacts from the same tagged release flow.

### Fixed

- **Windows updater compatibility** – The desktop updater no longer disables the web-installer path, which is required for architecture-aware Windows installs and updates.

## [1.0.9] – 2026-03-29

### Changed

- **Workspace readability** – Simplified the default workspace chrome by merging stacked status rows, reducing repeated live-summary text, and keeping more vertical space available for chat.
- **Quick Mod defaults** – Quick Mod now stays collapsed until opened, so moderation tools are still close at hand without constantly crowding the composer area.
- **Tab strip polish** – Cleaned up the navigation strip with quieter close controls and a calmer default tab presentation.

### Fixed

- **Renderer layout consistency** – Refined shell component spacing and styling so the simplified workspace layout, dock panels, and analytics surfaces render consistently across the desktop UI.

## [1.0.8] – 2026-03-28

### Added

- **Role-based desk switching** – Chatrix can now automatically choose the right workspace desk based on the active channel context, including broadcaster, moderator, shared chat, merged tabs, and viewer-only sessions.
- **Kick broker warm-up** – The desktop app now wakes the hosted Kick broker on launch and keeps it warm in the background while Chatrix is open, reducing Render cold-start failures during Kick sign-in and token refresh.

### Changed

- **Moderation controls** – Simplified the in-chat moderation rail so it stays readable during active chat, with a slimmer quick-mod layout and better separation of emergency actions.
- **Workspace density** – Reduced empty-state chrome by hiding inactive dock panels, zero-value analytics, and low-signal workspace strips until they are actually useful.

### Fixed

- **Kick auth reliability** – Kick sign-in and refresh now wait for the broker health check before attempting token exchange, which reduces the “needs multiple tries” problem when the hosted broker has spun down.
- **CI formatting** – Normalized renderer shell formatting so the desktop format check passes consistently in GitHub Actions.

## [1.0.7] – 2026-03-22

### Added

- **Intel Mac builds** – Release automation now publishes a dedicated `x64` macOS build alongside the Apple Silicon build, so Intel Macs get a native installer and update feed.

### Changed

- **Mac packaging scripts** – Split desktop packaging into explicit Apple Silicon and Intel targets, with architecture-specific `.dmg`, `.zip`, and update manifest outputs.
- **Release workflow** – GitHub Actions now builds macOS installers on both Apple Silicon and Intel runners before publishing a release.

### Fixed

- **Mac updater identity** – The mac release artifact signing and publish metadata now match the legacy `com.multichat.desktop` app identity, which is required for the existing updater path to recognize Chatrix as the same app lineage.

## [1.0.6] – 2026-03-22

### Changed

- **Workspace lockfile** – Refreshed the pnpm lockfile so the Kick broker workspace installs cleanly in CI and on Render with `--frozen-lockfile`.
- **Desktop formatting** – Applied the missing Prettier fix in the desktop auth handlers so CI and release validation pass cleanly.

### Fixed

- **Legacy app cleanup** – Packaged Chatrix installs now remove leftover `MultiChat.app` bundles from both standard macOS Applications folders, covering machines that ended up with both apps after the 1.0.4 rename update.

## [1.0.5] – 2026-03-22

### Added

- **Kick broker** – Added a dedicated Kick token broker service for secure token exchange and refresh without shipping the shared Kick client secret in the desktop app.
- **Render deployment** – Added Render Free deployment config and broker documentation so the Kick auth backend can be hosted cheaply and consistently.

### Changed

- **Kick sign-in** – Chatrix now treats the hosted Kick broker as the default sign-in path for public builds, so users can sign in to Kick without entering their own client credentials.
- **Kick UI flow** – Removed the local Kick credential prompt from the normal app flow and restored a simple read-only fallback if Kick sign-in is unavailable.

### Fixed

- **Clean reinstall testing** – Rebuilt, wiped local app state, and reinstalled a clean packaged Chatrix build to verify the hosted-broker auth path from a fresh app state.

## [1.0.4] – 2026-03-17

### Added

- **Rebrand announcement** – Added a startup popup announcing the move to Chatrix, with local dismissal persistence so existing users see the rename without being blocked on every launch.

## [1.0.2] – 2026-03-07

### Fixed

- **ESLint** – Migrated both `apps/desktop` and `packages/chat-core` from the legacy `.eslintrc.cjs` format to the ESLint 9 flat-config format (`eslint.config.js`). Added `typescript-eslint` so TypeScript files are linted correctly. `pnpm lint` was previously completely broken and now passes cleanly.
- **Dead code** – Removed unused `hasTikTokSession` helper function and unused `activeTabGroup` variable in `ChatShell.tsx`.
- **Type safety** – Replaced `any` with `Record<string, unknown>` in the `fetchJsonOrThrow` helper in `runtime.ts`.
- **Unused parameter** – Prefixed the unused `pathname` parameter in `loopbackOAuth.ts` with `_` to satisfy the linter.

### Added

- **ErrorBoundary** – New React `ErrorBoundary` component wraps the entire renderer. Unhandled render errors now show a friendly "Something went wrong" screen with a Reload button instead of leaving users with a blank window.
- **Renderer entry hardening** – `main.tsx` now throws an explicit error when the `#root` DOM element is missing, rather than silently failing.
- **Accessibility** – Improved `SettingsPanel` with `aria-label` on toggles, `role="tablist"` / `aria-selected` on tab buttons, `id` / `aria-controls` attributes, and `role="tabpanel"` / `aria-labelledby` on content panels.

### Removed

- **OBS overlay** – Completely removed the OBS overlay server and overlay window. Deleted `obsOverlayServer.ts`, `overlayWindow.ts`, all overlay types (`OverlaySourceRef`, `OverlayMessage`, `OverlayFeedEvent`), overlay IPC channels, preload API, UI components, and associated CSS styles.

### Security

- **Renderer sandbox** – Added `sandbox: true` to the main window `webPreferences`, restricting the renderer to Chromium's process sandbox and reducing the attack surface.
- **URL validation** – Added `isSafeExternalUrl()` gate on all `shell.openExternal()` calls, restricting navigation to `http` / `https` URLs only.
- **OAuth host binding** – Bound the OAuth loopback server to `127.0.0.1` instead of all interfaces.
- **CSS color validation** – Added `isSafeCssColor()` to validate user-provided chat colors, with a strict regex that only allows safe characters in `rgb()` / `hsl()` values.

### Documentation

- **`.env.example`** – Added all previously undocumented environment variables: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, `YOUTUBE_API_KEY`, and `TIKTOK_SIGN_API_KEY`.

---

## [1.0.1] – 2025-01-01

Initial public release.
