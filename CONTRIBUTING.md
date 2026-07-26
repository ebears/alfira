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

Two dev modes are available:

| Command          | What it does                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `bun dev`        | Lint + format check + tests → build web → start server with `--watch` (auto-restart on changes) |
| `bun dev:docker` | Full Docker integration test: lint + tests → build both packages → `docker compose up --build`  |

`bun dev` is the fast path for day-to-day work — the server runs directly on your machine and watches for changes. `bun dev:docker` mirrors the production deployment and is good for a final integration check before submitting.

During a `bun dev` session, if you change web source files you'll need to rebuild the UI separately:

```bash
bun run web:build
```

Server source changes are picked up automatically by `--watch`.

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

## Testing

The project uses [Bun's built-in test runner](https://bun.sh/docs/cli/test). Tests live alongside source files as `*.test.ts`.

```bash
# Run all tests
bun test

# Run tests for a specific package
bun test --filter @alfira/server
bun test --filter @alfira/web
```

## Code Quality

The project uses [oxlint](https://oxc.rs/) and [oxfmt](https://oxc.rs/) for linting and formatting, plus Bun's test runner. The universal pre-commit gate is:

```bash
# Lint (type-aware) + format check + tests — run this before every commit
bun run check
```

Individual commands are also available:

```bash
# Typecheck only
bun run typecheck

# Lint with auto-fix
bun run lint:fix

# Format with auto-fix
bun run format

# Tests only
bun test
```

CI runs `bun run check` plus Trivy vulnerability scanning, then builds both packages. Your code must pass `bun run check` locally before pushing — any failure in CI means you skipped the pre-commit check.

### Git Hooks (lefthook)

The project uses [lefthook](https://github.com/evilmartians/lefthook) to run checks automatically on commit. Install the hooks once:

```bash
bunx lefthook install
```

After that, every `git commit` will run lint, format check, and tests in parallel on staged files. If anything fails, the commit is blocked — same checks as CI, but before you push.

### Dead Code Detection (knip)

[knip](https://knip.dev/) finds unused files, dependencies, and exports. Run it periodically to keep the codebase lean:

```bash
bunx knip
```

It's preconfigured in `knip.json` and won't flag intentional exports (entry points, scripts, etc.).

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
