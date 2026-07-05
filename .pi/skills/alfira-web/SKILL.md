---
name: alfira-web
description: React 19 + Tailwind CSS 4 web UI, component and page structure, API client, WebSocket client, virtual list pattern, and settings sections. Use when working on packages/web/src/, UI components, or frontend features.
---

# Alfira Web UI

## Tech

- **Framework:** React 19
- **Styling:** Tailwind CSS 4
- **Bundler:** Bun (builds to `packages/web/dist/`)
- **Build command:** `bun run web:build`

## Entry Point & Routing

- **Entry:** `packages/web/src/main.tsx` — mounts `<App />`
- **Router:** `App.tsx` — client-side SPA routing via `react-router-dom` (Routes/Route)
- **Auth guard:** Routes check auth state, redirect to `/login` if unauthenticated

## Page Map

| Page file | Route | Purpose |
|-----------|-------|---------|
| `LoginPage.tsx` | `/login` | Discord OAuth2 login |
| `SetupWizard.tsx` | `/setup` | Initial guild setup (first run) |
| `SongsPage.tsx` | `/songs` | Song library with search, filter, add |
| `PlaylistsPage.tsx` | `/playlists` | Playlist list with create/delete |
| `PlaylistDetailPage.tsx` | `/playlists/:id` | Single playlist with songs + reorder |
| `TagsPage.tsx` | `/tags` | Tag management |
| `AudioPage.tsx` | `/audio` | Compressor + equalizer settings |
| `PermissionsPage.tsx` | `/permissions` | Role-based permission config |
| `RequestsPage.tsx` | `/requests` | Song request queue (pending/history, approve/deny) |

## Component Map

### Layout & Navigation
| Component | Purpose |
|-----------|---------|
| `Layout.tsx` | App shell with sidebar nav + NowPlayingBar |
| `MobileNav.tsx` | Mobile navigation bar |
| `NowPlayingBar.tsx` | Persistent bottom bar with playback controls |
| `ProtectedRoute.tsx` | Auth guard wrapper |
| `SettingsMenu.tsx` | Settings navigation menu (in `components/settings/`) |

### Song & Queue Components
| Component | Purpose |
|-----------|---------|
| `SongCard.tsx` | Song display — grid card or list row via `variant` prop |
| `SongEditPanel.tsx` | Song metadata editor (tags, volume boost, etc.) |
| `VirtualSongList.tsx` | Virtualized song list for performance |
| `QueuePanel.tsx` | Now playing + upcoming queue (in `components/queue/`) |
| `PlaylistRow.tsx` | Playlist list item |
| `VirtualPlaylistList.tsx` | Virtualized playlist list |
| `VirtualRequestList.tsx` | Virtualized request list |
| `RequestCard.tsx` | Song request card with approve/deny actions |
| `SourceIcons.tsx` | Source platform icons (YouTube, SoundCloud, etc.) |

### Modals & Overlays
| Component | Purpose |
|-----------|---------|
| `Backdrop.tsx` | Modal backdrop overlay |
| `ConfirmModal.tsx` | Confirmation dialog |
| `AddSongModal.tsx` | Add a single song (URL input) |
| `AddSongsModal.tsx` | Bulk-add songs (playlist import) |
| `OverrideModal.tsx` | Queue override dialog (in `components/queue/`) |
| `QuickAddModal.tsx` | Quick-add to queue dialog (in `components/queue/`) |

### Settings Components (in `components/settings/`)
| Component | Purpose |
|-----------|---------|
| `SettingsPage.tsx` | Settings page shell with tabs |
| `SettingsToggle.tsx` | Toggle switch component |
| `AdminSection.tsx` | Admin settings (roles, idle timeout, sources, notifications) |
| `UserSection.tsx` | User/profile settings |
| `CompressorSection.tsx` | Compressor controls (threshold, ratio, attack, release, gain) |
| `EqualizerSection.tsx` | 15-band equalizer sliders |

### Utility UI Components (in `components/ui/`)
| Component | Purpose |
|-----------|---------|
| `Button.tsx` | Reusable button component |
| `Card.tsx` | Reusable card wrapper |
| `Checkbox.tsx` | Reusable checkbox |
| `DurationBadge.tsx` | Formatted duration display |
| `ErrorBanner.tsx` | Error message banner |
| `PlayButton.tsx` | Play action button |
| `RoleComboBox.tsx` | Role selection dropdown |
| `Spinner.tsx` | Loading spinner |
| `VirtualListFooter.tsx` | Footer for virtualized lists |
| `VolumeBoostBadge.tsx` | Volume boost indicator |

### Other Components
| Component | Purpose |
|-----------|---------|
| `AddFilterPopover.tsx` | Tag filter popover |
| `BarButton.tsx` | NowPlayingBar action button |
| `EmptyState.tsx` | Empty state placeholder |
| `FilterChips.tsx` | Active filter tag chips |
| `NotificationToast.tsx` | Toast notification |
| `TagTicker.tsx` | Scrolling tag display for songs |
| `UserMenu.tsx` | User dropdown menu (profile, logout) |

### Context Menu Components (in `components/ContextMenu/`)
| Component | Purpose |
|-----------|---------|
| `SubmenuPanel.tsx` | Slide-out submenu panel |
| `EditSubmenuPanel.tsx` | Song edit submenu |
| `MenuItemButton.tsx` | Menu item button |

## Hooks (`packages/web/src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useSocket.ts` | WebSocket connection for real-time player state |
| `useSongActions.tsx` | Common song actions (play, queue, edit, delete) |
| `useAddToQueue.ts` | Add-to-queue logic (play now, play next, add to end) |
| `useCreatePlaylist.tsx` | Playlist creation form/dialog state |
| `useProgressBar.ts` | NowPlayingBar progress/scrubber logic |
| `useNotification.ts` | Toast notification state |
| `useVirtualizedInfiniteScroll.ts` | Virtual list with infinite scroll pagination |

## API Client (`packages/web/src/api/`) + Utils (`packages/web/src/utils/api.ts`)

Centralized API client. All frontend API calls go through this file. Provides typed functions for:
- Song CRUD: `fetchSongs()`, `updateSong()`, `deleteSong()`
- Song requests: `createRequest()`, `previewRequest()`, `fetchRequests()`, `approveRequest()`, `denyRequest()`, `cancelRequest()`
- Playlist operations: `fetchPlaylists()`, `createPlaylist()`, `updatePlaylist()`, etc.
- Player control: `play()`, `pause()`, `skip()`, `seek()`, `setVolume()`, etc.
- Settings: compressor, equalizer, general, permissions
- Authentication: login, logout, session check

Uses the shared API service from `@alfira-bot/server/shared/api` for type consistency. Always use this client — never raw `fetch` in components.

## WebSocket Client

Connects to `/ws` for real-time player state updates. Used primarily by the now-playing bar and queue panel. The client is receive-only (never sends messages).

## Constants (`packages/web/src/constants.ts`)

Shared constants used across the web UI. Common values like API base URLs, default settings, etc.

## Tailwind CSS 4 Conventions

- Use Tailwind utility classes for all styling
- Custom components use Tailwind's `@apply` sparingly
- Dark theme is the default
- Responsive design: mobile-first with breakpoint utilities

## Build & Serve

- `bun run web:build` — Builds to `packages/web/dist/`
- Served by the Bun server as static files with SPA fallback (`index.html` for non-asset paths)
- Static extensions mapped in `index.ts`: `.html`, `.js`, `.css`, `.png`, `.jpg`, `.svg`, `.ico`, `.webmanifest`, `.woff2`
