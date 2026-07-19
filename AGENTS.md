# AGENTS.md

## Project Overview

Alfira is a self-hosted Discord music bot with a web UI as the primary interface. It's a Bun workspaces monorepo with two packages:

- `packages/server` — Bun API server + Discord bot (`GuildPlayer`, NodeLink audio, custom Discord gateway), plus shared types, utilities, DB schema, and logger
- `packages/web` — React 19 + Tailwind CSS 4 web UI

The bot and API run in a **single Bun process**. For detailed architecture (startup sequence, WebSocket pipeline, build cycle, shared exports), load the `alfira-architecture` skill.

## Tech Stack

| Component | Technology                  |
| --------- | --------------------------- |
| Runtime   | Bun                         |
| Language  | TypeScript                  |
| Discord   | Custom gateway (WebSocket)  |
| Audio     | NodeLink (Lavalink v4)      |
| API       | Bun native HTTP + WebSocket |
| Database  | SQLite + Drizzle ORM        |
| Frontend  | React 19 + Tailwind CSS 4   |
| Linting   | oxlint + oxfmt              |

## Design Principles

- **Self-hosting without operational burden** — Docker + Bun + SQLite means no external managed services. One `docker compose up` gets you running. Networking (domain/reverse proxy) is the only unavoidable external dependency.
- **Fewer, better dependencies** — Prefer Bun's built-in HTTP, WebSocket, test runner, and SQLite driver over npm packages. Drizzle gives type-safe SQL without ORM bloat.
- **Single-process by design** — Bot, API, and WebSocket run in one Bun process. Shared memory gives real-time updates without Redis or message queues. This is a deliberate tradeoff: the scope is a single self-hosted community, not multi-tenant SaaS.
- **Web UI as primary interface** — The Discord bot is the playback engine; the web app is the control plane. This avoids Discord's rate limits and UX constraints.
- **Audio is audio — no assumptions about content** — Works equally as a music bot or tabletop audio player. The data model (songs, playlists, tags) is content-type-agnostic: a pop song and an hour-long dungeon ambience are the same shape.
- **Single source of truth** — Every concept, pattern, and piece of knowledge has one canonical home. Before creating something new, check if it already exists or can be extended. If nothing fits and your change would duplicate what already exists across files, extract the commonality into a shared location first. This applies as much to UI patterns (one toast, one button variant, one data-fetching hook) as it does to types and utilities. Copy-pasting is a last resort, not a first move.

## Development Commands

```bash
# Build server dist/, then start all services with Docker
bun run dev

# Build the web UI (needed after web/src changes before docker compose restart)
bun run web:build

# Lint + format with auto-fix (run before committing)
bun run check

# Lint only, with auto-fix
bun run lint:fix

# Format only, with auto-fix
bun run format
```

### Database Migrations

Migrations are handwritten `.sql` files in `packages/server/src/shared/db/migrations/`. They run automatically at server startup — no separate command needed.

To create one: pick the next sequential number (e.g., `0013_descriptive_name.sql`), write the DDL, and use `--> statement-breakpoint` on its own line to separate multiple statements. The runner is idempotent (SHA-256 content hashing) and catches "already exists" errors.

See the `alfira-database` skill for full details.

## Code Style

- oxlint + oxfmt for linting and formatting
- Run `bun run check` before committing
- CI runs `bun run lint` — code must pass before merging

## Domain Knowledge

Detailed architecture, audio pipeline, database schema, API routes, and web UI patterns live in **Pi skills** (`.pi/skills/`). The agent loads them on-demand when relevant. Force-load with `/skill:name` if needed.

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
4. **`/verify`** — The gate before `/submit`. Run `bun run check`, then `bun run --filter @alfira/server build && bun run --filter @alfira/web build` to verify both packages compile. Review the full diff and check for untracked files. Report pass/fail for each check. Do not proceed if anything fails.
5. **`/submit`** — Create a feature branch from `dev`, commit with a semantic message, push, and open a PR targeting `dev`.
6. **Review & Merge** — Address review feedback. CI must pass. Merge to `dev`.
7. **`/release`** — Batch accumulated `dev` changes into a release PR targeting `main`:
   1. Show pending commits between `main` and `dev` and determine the next version
   2. Create a release branch from `dev`: `git checkout -b release/vX.Y.Z dev`
   3. Bump the version in `package.json` and commit: `chore: bump version to vX.Y.Z`
   4. Push and open a PR targeting `main` with the changelog in the description
   5. After merge, create the GitHub Release **with the changelog** (not an empty body):
      ```bash
      git checkout main && git pull
      gh release create vX.Y.Z --target main --notes "$(gh pr view <PR#> --json body -q .body)"
      ```
   6. Sync `dev` with `main` to keep history clean:
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
- [Tech Stack](docs/tech-stack.md) — Detailed architecture
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions (also available as the `alfira-troubleshooting` skill)
