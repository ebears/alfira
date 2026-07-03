---
name: alfira-architecture
description: Server architecture, startup sequence, WebSocket pipeline, build/deploy cycle, shared package exports, and monorepo layout. Use when working on packages/server/src/index.ts, lib/socket.ts, startDiscord.ts, server config, or understanding how components connect.
---

# Alfira Architecture

## Monorepo Layout

```
packages/
├── server/     # Bun API + Discord bot (GuildPlayer, NodeLink audio, Seyfert v4)
│   └── src/
│       ├── index.ts          # Entry point — startup sequence + HTTP server
│       ├── startDiscord.ts   # Seyfert Discord client + NodeLink init
│       ├── GuildPlayer.ts    # Per-guild audio player state machine
│       ├── PlaybackCursor.ts # Queue cursor logic
│       ├── lib/              # Utilities (socket, voice, lavalink, config, etc.)
│       ├── middleware/        # Auth middleware
│       ├── routes/           # API route handlers (11 files)
│       ├── shared/           # Types, DB schema, logger, format, API service
│       └── utils/            # NodeLink subprocess helpers
└── web/        # React 19 + Tailwind CSS 4 web UI
```

The bot and API run in a **single Bun process**. They share memory for player state, enabling real-time WebSocket broadcasts directly from playback events.

## Startup Sequence (`packages/server/src/index.ts::main()`)

1. **Run database migrations** — Homegrown runner reads `.sql` files from `packages/server/src/shared/db/migrations/`, hashes them, tracks applied migrations in `__drizzle_migrations` table
2. **Migrate existing tags** — `ensureTagsMigrated()` transfers inline `song.tags` JSON arrays to the normalized `Tag` table
3. **Verify database connectivity** — `db.all(sql\`SELECT 1\`)`
4. **Initialize guild ID cache** — `initGuildId()` reads the single `guildSettings` row (id=1)
5. **Initialize enabled sources cache** — `initEnabledSources()` from `startDiscord.ts`
6. **Start NodeLink subprocess** — Spawns NodeLink as a child process (`/usr/local/bin/bun src/index.ts` inside `/usr/local/nodelink`), polls `http://127.0.0.1:2333/v4/info` until ready
7. **Start the Discord bot** — `startDiscord()` initializes Seyfert client + connects to NodeLink WebSocket
8. **Start HTTP server** — `Bun.serve()` on port 3001

### Graceful shutdown

On SIGTERM/SIGINT: kill NodeLink subprocess → stop HTTP server + close all WebSocket clients → destroy all players (FFmpeg + voice) → close database.

## WebSocket Pipeline

Real-time player state broadcast to the web UI:

```
GuildPlayer (player state change)
  → emitPlayerUpdate(state)         [packages/server/src/lib/socket.ts]
    → fetch compressor settings
    → serialize state
    → send to all registered WsClient connections
```

Key facts:
- The bot never directly holds WebSocket connections — all goes through `lib/socket.ts`
- Clients authenticate via session cookie on WebSocket upgrade (`/ws` endpoint in `index.ts`)
- The client never sends messages — it's receive-only
- Socket registration: `registerClient(ws, user)` / `unregisterClient(ws)` / `closeAllClients()`

## Server Build/Deploy Cycle

- Server source compiles to `packages/server/dist/` during Docker image build
- `bun run dev` rebuilds local `dist/` then starts Docker with a fresh image
- API source is live-mounted via Docker volume — `docker compose restart alfira` picks up changes without a full rebuild
- Web UI changes: run `bun run web:build` then `docker compose restart alfira`

## Environment Configuration

Single `.env` file at project root. Required: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `JWT_SECRET`, `DATABASE_URL`.

Guild ID, admin roles, idle timeout, and notification channel are configured via the in-app setup wizard. Can optionally pre-configure via `GUILD_ID` / `ADMIN_ROLE_IDS` env vars.

## Shared Package Exports

`@alfira-bot/server/shared` (imported by `packages/web`):

**Types:** `Song`, `QueuedSong`, `LoopMode`, `QueueState`, `Playlist`, `PlaylistDetail`, `User`
**Utilities:** `formatDuration(seconds)`, `fisherYatesShuffle(array)`
**DB:** Schema in `packages/server/src/shared/db/schema.ts`
**Logger:** `logger` from `@alfira-bot/server/shared/logger`
**API Service:** `@alfira-bot/server/shared/api` — centralized API functions (`fetchSongs`, `createRequest`, `fetchRequests`, etc.)

Always use the shared API service for API calls rather than raw `fetch`.

## Security Headers

Defined in `index.ts` as `SECURITY_HEADERS` constant, applied to all API responses via `setSecurityHeaders()`:
- `Content-Security-Policy: default-src 'none'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
