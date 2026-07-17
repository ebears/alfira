# Changelog

All notable changes to Alfira are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ebears/alfira/compare/v0.1.0...dev
[0.1.0]: https://github.com/ebears/alfira/releases/tag/v0.1.0
