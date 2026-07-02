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

## Git Workflow

### Branch Model

```
feature branches  ──PR──►  dev  ──release PR──►  main
```

- `main` — protected, production-ready code. Only updated via release PRs from `dev`.
- `dev` — integration branch. All feature work merges here via PR.
- Feature branches — created from `dev`, merged back to `dev`.

Never commit directly to `main` or `dev`. All work happens in feature branches.

### Development Lifecycle

```
Discuss  →  /plan  →  Implement  →  /verify  →  /submit  →  Review & Merge  →  /release
```

Every change follows this pipeline. The agent should guide the user through each phase and not skip gates.

1. **Discuss** — Talk through the problem and explore approaches. Ask clarifying questions before proposing solutions.
2. **`/plan`** — Before writing any code, produce a written plan: goal, scope (files touched), ordered implementation steps, risks, and verification checklist. Get user agreement on the plan before proceeding.
3. **Implement** — Follow the plan one step at a time. After each step, confirm it works before moving on. If the plan needs adjustment mid-implementation, say so and update it.
4. **`/verify`** — The gate before `/submit`. Run `bun run check`, TypeScript compilation (`bunx tsc --noEmit`), review the full diff, and check for untracked files. Report pass/fail for each check. Do not proceed if anything fails.
5. **`/submit`** — Create a feature branch from `dev`, commit with a semantic message, push, and open a PR targeting `dev`.
6. **Review & Merge** — Address review feedback. CI must pass. Merge to `dev`.
7. **`/release`** — Batch accumulated `dev` changes into a release PR targeting `main`. Show pending commits, determine version if applicable, open the PR with a changelog.

After a release merges to `main`, sync `dev` with `main` to keep history clean:
```bash
git checkout dev && git merge main && git push origin dev
```

#### Agent rules for each phase

- Never skip `/plan` for non-trivial changes. If the user says "just fix X", ask one question: "Want me to plan it first or just go?"
- Never skip `/verify`. It's the universal gate before `/submit`.
- If implementation reveals the plan was wrong, stop and re-plan. Don't bulldoze through.
- After `/submit`, remind the user what the next step is (review → merge → `/release` when ready).

### Branch Naming

Feature branches must follow: `<type>/<short-description>`

Valid types: `feat`, `fix`, `chore`, `refactor`, `docs`, `ci`, `security`, `revert`, `ui`, `cleanup`, `test`

Examples: `fix/websocket-reconnect`, `feat/playlist-folders`, `chore/update-deps`

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

- `type` must be one of: `feat`, `fix`, `chore`, `refactor`, `docs`, `ci`, `style`, `test`, `perf`, `revert`, `security`
- `scope` is optional and should match the affected package/area (e.g., `server`, `web`, `deps`, `db`, `docker`, `auth`)
- Description should be lowercase, imperative mood, no trailing period

A commit template is available at `.git-commit-template`. Enable it locally:
```bash
git config commit.template .git-commit-template
```

Examples:
```
feat(server): add queue reordering endpoint
fix(web): prevent scrubber thumb from sticking at 0
chore(deps): bump ws to 8.21.0
refactor(server): extract shared audio filter builders
```

### PR Workflow

1. Create a feature branch from `dev` (not `main`)
2. Make changes, run `bun run check` before committing
3. Commit with a semantic message
4. Push the branch
5. Create a PR with `gh pr create`:
   - Use the conventional commit subject as the PR title
   - Include a brief summary of changes in the body
   - Target `dev` as the base branch

### Before Committing

Always run `bun run check` and resolve any lint/format issues before committing.

## Documentation

- [Installation Guide](docs/installation.md) — Setup, environment variables, Docker commands
- [Philosophy](docs/philosophy.md) — Design principles guiding the project
- [Tech Stack](docs/tech-stack.md) — Detailed architecture
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions
