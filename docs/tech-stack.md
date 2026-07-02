# Tech Stack

## Overview

| Component | Technology |
|-----------|------------|
| **Runtime** | Bun |
| **Language** | TypeScript |
| **Discord** | `Seyfert` v4 |
| **Audio** | NodeLink (Lavalink v4) — direct WebSocket + REST |
| **API** | Bun native HTTP + WebSocket |
| **Database** | SQLite + Drizzle ORM |
| **Frontend** | React + Bun + Tailwind |
| **Logging** | Pino |

## Architecture

```mermaid
flowchart TB
    subgraph User
        WEB[Web UI<br/>React + Bun]
        DISC[Discord Client]
    end

    subgraph Server["Bun Server"]
        API[Bun API<br/>:3001]
        BOT[Discord Bot<br/>Seyfert + LavalinkClient]
    end

    subgraph Audio["Audio Pipeline"]
        NL[NodeLink<br/>Lavalink v4]
    end

    subgraph Data["Data Layer"]
        DRIZZLE[Drizzle ORM]
        DB[(SQLite)]
    end

    %% User interactions
    WEB -->|OAuth2 Login| API
    WEB -->|REST API| API
    WEB <-->|WebSocket| SOCKET
    DISC <-->|Voice Channel| BOT

    %% Server internal
    API <--> DRIZZLE
    BOT <--> SOCKET

    %% Audio pipeline
    BOT <-->|Player Control| NL

    %% Database
    DRIZZLE --> DB
```

The bot and API run in a **single Bun process**, sharing the same memory for the player state. This allows real-time updates to be broadcast directly from the bot's playback events without any additional infrastructure.

## Project Structure

The project is a Bun workspaces monorepo:

```
packages/
├── shared    # Shared types and runtime utilities (formatDuration, fisherYatesShuffle)
├── bot       # Discord bot (GuildPlayer, NodeLink audio via direct REST + WebSocket)
├── api       # Bun API, Drizzle ORM
└── web       # React + Tailwind web UI
```

## Development Scripts

Top-level scripts:

| Script | Description |
|--------|-------------|
| `bun run dev` | Build shared + bot locally, then start all services with Docker |
| `bun run web:build` | Build the web UI (used by Docker) |
| `bun run db:generate` | Generate Drizzle migration files |
| `bun run db:migrate` | Run Drizzle migrations |
| `bun run check` | Lint and format with auto-fix (Biome) |
| `bun run lint:fix` | Lint with auto-fix |
| `bun run format` | Format with auto-fix |

## Shared Package Exports

`@alfira-bot/shared` provides types and utilities consumed by all other packages:

### Types

| Type | Description |
|------|-------------|
| `Song` | Database song model (id, title, youtubeUrl, duration, thumbnailUrl, etc.) |
| `QueuedSong` | Song with `requestedBy` display name (runtime queue property) |
| `LoopMode` | `'off'` \| `'song'` \| `'queue'` |
| `QueueState` | Full player state snapshot for real-time broadcasts |
| `Playlist` | Database playlist model with optional song count |
| `PlaylistSong` | Join table entry linking a song to a playlist at a position |
| `PlaylistDetail` | Playlist with fully populated songs array |
| `PlaylistSongWithSong` | PlaylistSong where the song is guaranteed present |
| `User` | Authenticated Discord user (discordId, username, avatar, isAdmin) |

### Utilities

| Function | Description |
|----------|-------------|
| `formatDuration(seconds)` | Formats seconds as `mm:ss` or `h:mm:ss` |
| `fisherYatesShuffle(array)` | In-place Fisher-Yates shuffle |

## CI Workflows

Three GitHub Actions workflows run on the repository:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **ci.yml** | All PRs, pushes to `main` and `dev` | Lint with Biome + typecheck all packages |
| **codeql.yml** | All PRs, pushes to `main` and `dev`, weekly schedule | CodeQL security analysis |
| **docker-build.yml** | All PRs, pushes to `main` and `dev` (ignores `docs/`) | Build Docker images; publish to GHCR on `main` |
