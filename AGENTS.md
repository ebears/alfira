## Project Overview

Alfira is a self-hosted Discord music bot with a web UI as the primary interface. It's a Bun workspaces monorepo with two packages:

- `packages/server` — Bun API server + Discord bot (`GuildPlayer`, NodeLink audio, Seyfert v4), plus shared types, utilities, DB schema, and logger
- `packages/web` — React 19 + Tailwind CSS 4 web UI

The bot and API run in a **single Bun process** started from `packages/server/src/index.ts`. They share memory for player state, enabling real-time WebSocket broadcasts directly from playback events.

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Discord:** Seyfert v4
- **Audio:** NodeLink (Lavalink v4-compatible) with a thin WebSocket client + REST commands
- **API:** Bun native HTTP + WebSocket
- **Database:** SQLite + Drizzle ORM
- **Frontend:** React 19 + Tailwind CSS 4
- **Linting:** Biome

## Development Commands

```bash
# Build server dist/, then start all services with Docker
bun run dev

# Build the web UI (needed after web/src changes before docker compose restart)
bun run web:build

# Generate Drizzle migration files
bun run db:generate

# Run Drizzle migrations
bun run db:migrate

# Lint + format with auto-fix (run before committing)
bun run check

# Lint only, with auto-fix
bun run lint:fix

# Format only, with auto-fix
bun run format
```

## Key Architecture Notes

### Single-Process Startup Sequence (packages/server/src/index.ts)

1. Run database migrations (homegrown, reads `packages/shared/dist/db/migrations/*.sql`)
2. Verify database connectivity
3. Start NodeLink subprocess
4. Call `startDiscord()` — initializes Seyfert Discord client + NodeLink connection
5. Start Bun HTTP server on port 3001 (serves API routes, WebSocket at `/ws`, and static web assets from `packages/web/dist/`)

### Real-Time Updates (WebSocket Pipeline)

The bot never directly holds WebSocket connections. Instead:

1. `GuildPlayer` calls `emitPlayerUpdate(state)` directly (packages/server/src/lib/socket.ts)
2. `emitPlayerUpdate` fetches compressor settings, serializes the state, and sends to all registered WebSocket clients

WebSocket clients authenticate via session cookie on connection. The client never sends messages — it's receive-only.

### Server Changes Require Rebuild

The server is compiled to `packages/server/dist/` during Docker image build. If you change `packages/server/src/**`, run `bun run dev` again — it rebuilds the local `dist/` and then starts Docker with a fresh image. API source is live-mounted via Docker volume so `docker compose restart alfira` picks up changes without a rebuild.

### Environment Configuration

A single `.env` file at the project root is used for all configuration. Copy `.env.example` to `.env` and fill in all values before running. Required: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GUILD_ID`, `JWT_SECRET`, `ADMIN_ROLE_IDS`, `DATABASE_URL`.

### NodeLink Audio Service

The bot streams audio from NodeLink (a Lavalink v4-compatible server). The `nodelink` service runs in Docker (docker-compose.yml) on port 2333. Player control uses NodeLink's REST API directly; events (TrackEnd, etc.) are received over a WebSocket connection managed by `lib/lavalink.ts`. Voice connections use Discord's gateway (VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE) forwarded to NodeLink's REST endpoint.

## Code Style

- Biome for linting and formatting
- Run `bun run check` before committing
- CI runs `bun run lint` — code must pass before merging

## Shared Package Exports

`@alfira-bot/server/shared` provides:

**Types:** `Song`, `QueuedSong`, `LoopMode`, `QueueState`, `Playlist`, `PlaylistDetail`, `User`

**Utilities:** `formatDuration(seconds)`, `fisherYatesShuffle(array)`

**DB:** Schema defined in `packages/server/src/shared/db/schema.ts`

**Logger:** `logger` export from `@alfira-bot/server/shared/logger`

**API Service:** `@alfira-bot/server/shared/api` provides centralized API functions (`fetchSongs`, `createSong`, `importPlaylist`, etc.) that should be used by all consumers.

## Documentation

- [Installation Guide](docs/installation.md) — Setup, environment variables, Docker commands
- [Philosophy](docs/philosophy.md) — Design principles guiding the project
- [Tech Stack](docs/tech-stack.md) — Detailed architecture
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions
