# Contributing to Alfira

Thanks for your interest in contributing! This guide covers the development workflow and contributor-specific info.

For setup instructions, see the **[Installation Guide](docs/installation.md)**.

## Branching Model

```
feature branch  ──PR──►  dev  ──release PR──►  main
```

- **`main`** — protected, production-ready. Only updated via release PRs from `dev`.
- **`dev`** — integration branch. All feature work merges here.
- **Feature branches** — created from `dev`, named `type/short-description` (e.g., `feat/playlist-folders`, `fix/login-redirect`).

See [AGENTS.md](../AGENTS.md) for the full git workflow and commit conventions.

---

## Development Workflow

The main dev command is `bun run dev`, which builds the server dist/ locally and then starts all services with Docker.

| What Changed             | Action                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Any of the above         | `bun run dev` — rebuilds server dist/ and restarts Docker                               |
| `packages/web/src/**`    | Run `bun run web:build` locally to rebuild the UI, then `docker compose restart alfira` |
| `packages/server/src/**` | `docker compose restart alfira` (source is live-mounted)                                |

## Database Migrations

Migrations run automatically on startup — the server applies any pending SQL migration files before starting the HTTP server.

### Manual Migration Commands

```bash
# Generate new migration files after schema changes
bun run db:generate

# Run migrations manually via Drizzle Kit
bun run db:migrate

# Reset database (wipe all data)
docker compose down -v
docker compose up --build
```

---

## Code Quality

The project uses [oxlint](https://oxc.rs/) and [oxfmt](https://oxc.rs/) for linting and formatting.

```bash
# Lint + format check with auto-fix (recommended before committing)
bun run check

# Lint only, with auto-fix
bun run lint:fix

# Format only, with auto-fix
bun run format
```

CI runs `bun run lint` in the typecheck workflow — your code must pass before merging.

## Editor Tooling

The repo includes preconfigured settings for a couple of tools (optional — use whatever you prefer):

- **Zed** (`.zed/`) — oxlint/oxfmt integration, TypeScript inlay hints, Markdown formatting, and task shortcuts for common dev commands
- **Pi** (`.pi/`) — Prompt templates and extensions for the project's development pipeline (plan, verify, submit, release)

If you use Zed or Pi, you'll get a pre-tuned experience out of the box. Nothing is enforced — these are just defaults for convenience.

---

## Questions?

- Check the [Troubleshooting Guide](docs/troubleshooting.md)
- Open an issue on GitHub

Thanks for contributing! 😊
