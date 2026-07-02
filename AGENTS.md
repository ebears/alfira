# AGENTS.md

## Project Overview

Alfira is a self-hosted Discord music bot with a web UI as the primary interface. It's a Bun workspaces monorepo with two packages:

- `packages/server` — Bun API server + Discord bot (`GuildPlayer`, NodeLink audio, Seyfert v4), plus shared types, utilities, DB schema, and logger
- `packages/web` — React 19 + Tailwind CSS 4 web UI

The bot and API run in a **single Bun process**. For detailed architecture (startup sequence, WebSocket pipeline, build cycle, shared exports), load the `alfira-architecture` skill.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Discord | Seyfert v4 |
| Audio | NodeLink (Lavalink v4) |
| API | Bun native HTTP + WebSocket |
| Database | SQLite + Drizzle ORM |
| Frontend | React 19 + Tailwind CSS 4 |
| Linting | Biome |

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

## Code Style

- Biome for linting and formatting
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
- [Troubleshooting](docs/troubleshooting.md) — Common issues and solutions (also available as the `alfira-troubleshooting` skill)
