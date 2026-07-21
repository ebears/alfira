# Changelog

All notable changes to Alfira are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Expanded audio filters** — All NodeLink filter types are now exposed on the Audio page: karaoke, timescale (speed/pitch/rate), tremolo, vibrato, rotation, distortion, channel mix, low pass, and rate. Previously only the 15-band equalizer and compressor were available (#717).
- **Clay press animation system** — Interactive elements (buttons, cards, list items) now have tactile click/tap press animations powered by motion, replacing the previous CSS-only approach (#714).
- **Requester on song cards** — The user who requested a song is now shown directly on song cards instead of buried in the context menu (#725).
- **Admin toggle hint animation** — The admin settings toggle button in the sidebar now has a subtle hint animation to improve discoverability (#728).

### Changed

- **CSS animations → motion** — All CSS keyframe animations have been replaced with motion (Framer Motion v12), giving smoother, interruptible transitions across the UI (#715).
- **Linting overhaul** — oxlint configuration has been significantly strengthened:
  - 53 new rules covering security, correctness, and modern JS/TS patterns (#707)
  - React performance lint rules enabled, with fixes across 33 components (#709, #710, #711, #712)
  - Type-aware lint rules via tsgolint (#713)
  - Strict mode enabled with zero tolerated violations (#705, #706, #708)
- **Typechecking via oxlint** — `bun run check` now includes type-aware type checking via oxlint's `--type-aware --type-check` flag (backed by tsgo). No separate `typescript` dependency needed (#700).

### Fixed

- **Progress bar timing** — Progress bar now correctly syncs with the audio server position, including when timescale speed filters are active (#719, #722).
- **Voice state seeding** — Voice channel states are now seeded from Discord's `READY` and `GUILD_CREATE` gateway events on connect, fixing stale voice state after reconnection (#721).
- **Grid view selection mode** — Selection checkboxes now work correctly in grid/masonry view (#716).
- **Request page race conditions** — Fixed a tab flash and empty-state flicker when navigating to the Requests page (#727).
- **React performance warnings** — Resolved missing `useCallback`/`useMemo` warnings across the codebase: NowPlayingBar, QueuePanel, and 45+ other components (#709, #710, #711, #712).
- **oxfmt config** — Corrected the oxfmt configuration key and disabled a conflicting TypeScript language server setting (#703).
- **Release tag timing** — Release tags are now pushed after the PR merge completes, not before (#701).
- **All oxlint warnings resolved** — Zero warnings, zero stale disable directives (#702).

### Dependencies

- Bumped `tailwindcss` from 4.3.2 to 4.3.3 (#726)
- Bumped `@tailwindcss/cli` from 4.3.2 to 4.3.3 (#726)

### Docs

- Added agent operating mode guidelines to AGENTS.md (#720)

## [0.2.2] - 2026-07-19

### Changed

- **Scroll ownership refactored** — Each page now owns its own scroll container instead of a shared `<main>` element, giving pages independent scroll behavior and fixing layout conflicts between the now-playing bar and virtualized lists (#690, #694, #695, #696, #697).
- **NowPlayingBar in normal flow** — The now-playing bar is no longer fixed-positioned. It sits in the normal document flow at root level, full-width, eliminating layout jank when the queue panel opens and closes (#695, #696).
- **Virtual list polish** — Spacing tightened and a scroll fade effect added at the bottom of virtualized lists for a cleaner look (#694).

### Fixed

- **Portal menu flash** — Context menus no longer flash at the top-left corner of the viewport on Chromium before positioning (#695).
- **Queue panel close jank** — Eliminated visual jank when closing the queue panel, and fixed a grid view layout flash on mount (#697).
- **Page padding restored** — Full page padding restored across all virtualized views after the scroll refactor. Bottom padding removed from virtualized page wrappers and end spacers removed from VirtualList in favor of explicit page-level padding (#696).
- **Horizontal scrollbar** — List item animation overflow is now clipped, preventing an unwanted horizontal scrollbar from appearing (#696).
- **Flexbox fill** — Virtualized views now use flexbox fill instead of hardcoded `maxHeight`, adapting properly to available space (#690).

### Docs

- Updated release workflow documentation with version bump and release notes steps (#693).

## [0.2.1] - 2026-07-19

### Added

- **Grid view** — Song library grid view re-added with a responsive masonic masonry layout (#689).

### Changed

- **Proper virtual lists** — Replaced the homegrown fake virtualization with `@tanstack/react-virtual` for all song, playlist, and tag lists, with spring animation on mount (#687).
- **Hover-only actions** — Play and more-actions buttons on song cards are now hidden until hover, reducing visual noise (#688).

### Fixed

- **Gapless playback silence** — Fixed an audio desync that caused a brief silence between gaplessly preloaded tracks (#690).
- **Song edit panel overlap** — The expanded inline song editor no longer overlaps adjacent cards in virtualized lists (#687).
- **Missing `hasMore` on PlaylistsPage** — Fixed the playlists page not detecting when more playlists were available to load (#687).

## [0.2.0] - 2026-07-22

### Added

- **Custom Discord gateway and REST client** — Replaces the Seyfert framework with a purpose-built, zero-dependency implementation: gateway WebSocket handling (`discordGateway.ts`), REST API client (`discordRest.ts`), and state management (`gatewayState.ts`). Lighter, faster, and free of framework churn (#672).
- **Motion-powered animations** — Framer Motion brings smooth transitions to the now-playing bar metadata, sidebar, and queue panel (#682, #684, #685).
- **Rate-limit cooldown feedback** — All player controls (play, pause, skip, shuffle, etc.) now show visual cooldown feedback when Discord rate limits apply, giving clear UX cues instead of silent failures (#680).
- **Discord rate-limit caching** — Guild members, roles, and channels are now cached to avoid hitting Discord's rate limits during normal operation (#683, #673).

### Changed

- **Bun-native crypto** — Replaced `jsonwebtoken` with Bun's built-in crypto hasher for JWT operations. Fewer dependencies, faster startup (#670).
- **Bun-native WebSocket** — Dropped the `ws` package in favor of Bun's built-in WebSocket implementation (#667).
- **Bun build pipeline** — Eliminated circular dependencies across the server package, switched from `tsc` to `bun build`, adopted Bun's native spawn for child processes, and enabled strict SQLite mode (#677, #679).
- **Database migrations renumbered** — Removed drizzle-kit artifacts and renumbered migrations sequentially (0001–0011) for clarity (#675).
- **Dependabot** — Now targets the `dev` branch instead of `main` (#666).

### Fixed

- **WebSocket double-connect** — The bot no longer opens duplicate WebSocket connections to Discord (#667).
- **Nested button hydration** — Fixed React hydration warnings from buttons nested inside buttons in the web UI (#668).
- **Priority queue audio desync** — Fixed an edge case where priority queue tracks could cause audio desync and stale metadata (#611).
- **Queue header and song card truncation** — Fixed layout issues with the queue header gap, empty actions menu, and long text truncation on song cards (#612).
- **Tag color consistency** — Unified tag color hashing and improved the color selector's visibility (#609).
- **Optional env vars** — Fixed optional environment variable passthrough in the production Docker Compose file (#615).
- **Token refresh logging** — Added diagnostic logging to token refresh paths to aid debugging auth issues (#601).

### Security

- **Constant-time JWT verification** — JWT signature comparison now uses constant-time comparison to prevent timing attacks (#671).
- **Bun-native crypto** — Replaced the `jsonwebtoken` npm package (which bundles its own crypto) with Bun's audited, built-in Web Crypto API (#670).

### Removed

- **Seyfert** — Discord bot framework replaced with a custom gateway and REST client (#672).
- **`jsonwebtoken`** — Replaced with Bun's native crypto (#670).
- **`ws`** — Replaced with Bun's native WebSocket (#667).
- **`undici` override** — Removed the unused dependency override from package.json (#669).
- **drizzle-kit artifacts** — Removed `drizzle.config.ts` and the generated migrations meta directory (#675).

### Dependencies

- Bumped `react-router-dom` from 7.18.0 to 7.18.1
- Bumped `@tanstack/react-virtual` from 3.14.2 to 3.14.6
- Bumped `tailwindcss` from 4.3.1 to 4.3.2
- Bumped `ws` from 8.21.0 to 8.21.1 (before removal)
- Bumped `@types/node` to 25.9.4
- Bumped GitHub Actions: `codeql-action`, `docker/build-push-action` to latest

## [0.1.1] - 2026-07-19

### Added

- **Context menu submenu arrows** — Context menu items that open a submenu now show a chevron indicator arrow (#621).

### Changed

- **Tooling migration** — Switched from Biome to oxlint + oxfmt for linting and formatting (#651, #652, #653).
- **TypeScript 7.0** — Upgraded to TypeScript 7.0.2 with sourcemaps and explicit no-emit for the web build (#648, #649).
- **Self-hosted fonts** — Fonts are now self-hosted and preloaded to eliminate flash of unstyled text (FOUT) (#650).
- **Codebase refactoring** — Extracted reusable components and utilities across server and web to reduce duplication:
  - `ListToolbar`, `PageHeader`, and `VirtualList` shell components extracted from repeated markup (#647, #634, #631).
  - `requirePlaylist` guard, `reSyncPlaylistsForTags`, and shared song query builders extracted on the server (#636, #628, #635).
  - Shared route table and `matchPath` helper replace regex-based routing (#633, #632).
  - Infinite scroll hook generalized with metadata support (#629).
- **Docker Compose** — Simplified compose files and fixed naming convention (#626).
- **CI/CD** — GitHub Releases now auto-generate from changelog notes on tag push (#625).

### Fixed

- Songs now sort by display name instead of raw title, matching the displayed value (#654).
- Sort options now correctly apply on the playlist detail page (#664).
- Removed broken `softprops/action-gh-release` step from the release workflow (#617).

### Dependencies

- Bumped `seyfert` from 4.3.0 to 5.0.0 (#637)
- Bumped `@tanstack/react-virtual` from 3.14.2 to 3.14.5 (#638)
- Bumped `@types/node` from 25.5.2 to 25.9.4 (#640)
- Bumped `tailwindcss` from 4.3.1 to 4.3.2 (#639)
- Bumped `@tailwindcss/cli` from 4.3.1 to 4.3.2 (#641)
- Bumped GitHub Actions: `codeql-action`, `setup-buildx-action`, `metadata-action`, `login-action` to latest

## [0.1.0] - 2026-07-05

### Added

- Import songs from YouTube URLs (single videos and playlists).
- **Multi-source support** — SoundCloud, Spotify, Apple Music, Tidal, and Google Drive in addition to YouTube. Admins can enable/disable sources per server; credential-backed sources (Spotify, Apple Music, Tidal) show a warning until credentials are provided.
- **Song request system** — Non-admin users can request songs via URL. Designated reviewers approve or deny requests in the web UI with optional DM notifications to the requester.
- **In-app setup wizard** — Guided first-run setup after OAuth login: pick your Discord server, enable music sources, select admin roles, configure a notification channel, set idle timeout, and optionally set a public URL. All configurable later from Settings → Admin.
- **Role-based granular permissions** — Separate permissions for playback, queue management, request review, and administration. Configured per-role from the Permissions page.
- **Tag-associated smart playlists** — Tag a song and it automatically joins that tag's playlist. Removing the tag removes the song. Works alongside manual playlist management.
- Library management with search, filter, and tag support.
- Playlist creation and management (public/private visibility).
- **Queue management** — Remove songs from the queue, promote to play next, demote to play later, or drag to reorder.
- **Sort and filter** — Sort the song library and playlists by title, artist, or date added. Filter by tags with chip-style selectors.
- **Bulk actions** — Multi-select songs or playlist entries, then delete or edit (tags, volume boost) in bulk.
- **Metadata editor in add-song modal** — Title, artist, album, and cover art auto-fill from the music source when adding a song via URL. Editable before saving.
- Playback controls: play, pause, seek, skip, loop (song/queue), shuffle.
- 15-band equalizer and compressor with per-guild settings.
- **Equalizer on/off persistence** — EQ enabled/disabled state persists across bot restarts.
- **Playlist cover art grid** — Playlist thumbnails show a 4-up mosaic of their songs' artwork.
- **Audio page** — Dedicated page with a 15-band equalizer visualizer, compressor controls, and toggle switches.
- Gapless track preloading via NodeLink.
- Auto-pause when all humans leave the voice channel.
- Idle auto-leave after configurable timeout.
- Discord OAuth2 authentication with refresh token rotation.
- Real-time WebSocket state synchronization.
- **User menu popover** — Discord avatar dropdown with logout, replacing the sidebar logout button.
- **Tags page** — Dedicated page for managing tags with a carousel layout.
- **Permissions page** — Role-centric cards for configuring granular access controls.
- **Source icons on song rows** — Monotone platform icon indicating which source a song came from.
- **Playful empty states** — Random icons and messaging when pages have no content.
- Multiple color themes.
- PWA support for installable web app experience.
- Docker-based deployment with pre-built images on GHCR.
- **Pi skills** — Domain knowledge skills for the Pi coding agent (`.pi/skills/`).
- **Release workflow** — GitHub Actions workflow triggered by `v*` tags: builds multi-arch Docker images, creates GitHub Releases with changelog notes, and attaches docker-compose.yml and .env.example as assets.

### Changed

- **Full UI redesign** — Clay design system with flat matte shadows on buttons and cards, duo-tone color themes (replacing single-accent palettes), and glassmorphism on popups, modals, and tooltips.
- **Song card layout** — Refined with a two-column metadata grid and improved tag display.
- **Queue panel** — Redesigned to match the song list aesthetic.
- **Now playing bar** — Layout overhauled with improved metadata display.
- **Settings restructured** — Split into User and Admin sections with dedicated pages. Controls redesigned with subtitles and consistent layout.
- **Environment configuration simplified** — `GUILD_ID` and `ADMIN_ROLE_IDS` are no longer required in `.env` for new installs; configured via the setup wizard instead. Existing deployments with those vars are auto-migrated.
- **Request page** — Defaults to the history tab when there are no pending requests.
- **Sidebar pages** — Consistent subtitle pattern and icons on page headers.
- **Database wipe redirect** — After resetting the database, users are redirected to the setup wizard instead of seeing a broken empty state.
- **Button styles unified** — All buttons use the shared Button component with the clay design aesthetic.
- **Theme-aware range inputs** — Sliders use theme colors instead of a hardcoded accent.
- **Tag color selection** — Improved visibility and unified color hashing.
- **Documentation overhaul** — README features section rewritten, philosophy reworked for content-type agnosticism, tech stack and installation docs corrected.

### Fixed

- Forced logout on transient Discord API failures (token refresh now handles temporary errors gracefully).
- Scrubber thumb stuck at the start during playback.
- Card hover/active states incorrectly firing on button clicks in Chromium.
- Multiple context menus opening simultaneously when right-clicking rapidly.
- Content flash (FOUC) on page navigation and artwork loading.
- Request history tab appearing blank and new requests not appearing after submission.
- Filter button styling mismatch, stale React ref in sort controls, and incorrect sort direction.
- URL playlist detection and re-request blocking logic.
- NodeLink filter updates using wrong guild ID in multi-guild edge cases.
- Admin role clearing prevention (can't accidentally remove all admin roles).
- UI actions now properly gated by granular permissions rather than a simple admin check.
- Inherited pointer cursor on modal cards.

[Unreleased]: https://github.com/ebears/alfira/compare/v0.2.2...dev
[0.2.2]: https://github.com/ebears/alfira/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/ebears/alfira/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ebears/alfira/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/ebears/alfira/releases/tag/v0.1.1
[0.1.0]: https://github.com/ebears/alfira/releases/tag/v0.1.0
