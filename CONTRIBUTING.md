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

The main dev command is `bun run dev`, which builds the shared and bot packages locally (for editor LSP support) and then starts all services with Docker.

| What Changed | Action |
|--------------|--------|
| Any of the above | `bun run dev` — builds changed packages and restarts Docker |
| `packages/web/src/**` | Run `bun run web:build` locally to rebuild the UI, then `docker compose restart alfira` |
| `packages/api/src/**` | `docker compose restart alfira` |

## Database Migrations

Migrations run automatically on startup via the `migrate` service.

### Manual Migration Commands

```bash
# Run migrations manually
docker compose run --rm migrate

# Reset database (wipe all data)
docker compose down -v
docker compose up --build
```

---

## Code Quality

The project uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Lint + format check with auto-fix (recommended before committing)
bun run check

# Lint only, with auto-fix
bun run lint:fix

# Format only, with auto-fix
bun run format
```

CI runs `bun run lint` in the typecheck workflow — your code must pass before merging. See the [Biome Setup](docs/biome-setup.md) doc for configuration details.

---

## Questions?

- Check the [Troubleshooting Guide](docs/troubleshooting.md)
- Open an issue on GitHub

Thanks for contributing! 😊