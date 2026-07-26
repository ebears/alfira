# oxlint + oxfmt Setup Guide

This document describes the oxlint and oxfmt configuration for the Alfira project.

## What are oxlint and oxfmt?

[oxlint](https://oxc.rs/docs/guide/usage/linter.html) is a high-performance linter for JavaScript and TypeScript built on the Oxc compiler stack. [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) is its companion formatter.

Together they provide:

- **Linting**: 700+ rules across eslint, typescript, react, jsx-a11y, unicorn, import, and more
- **Formatting**: Prettier-compatible code formatting with near-identical options

## Installation

Both are installed as dev dependencies in the project root:

```bash
bun install
```

This installs `oxlint` and `oxfmt` — no global install required.

## Bun Scripts

The following scripts are available in the root `package.json`:

```bash
# Check for linting issues
bun run lint

# Auto-fix linting issues
bun run lint:fix

# Format all code
bun run format

# Check formatting without making changes
bun run format:check

# Lint with type-aware checking only
bun run typecheck

# Combined: lint + format check + tests
bun run check
```

## Editor Integration

### Zed Editor

Install the **Oxc** extension from Zed's extension marketplace. The project's `.zed/settings.json` configures both `oxlint` (LSP diagnostics) and `oxfmt` (formatter) language servers, with code actions for auto-fix on save.

### VS Code / Other Editors

See the [oxlint editor setup](https://oxc.rs/docs/guide/usage/linter/editors.html) and [oxfmt editor setup](https://oxc.rs/docs/guide/usage/formatter/editors.html) guides.

## CI Integration

CI runs `bun run check` (`.github/workflows/ci.yml`), which includes lint, format check, and tests — plus Trivy vulnerability scanning and full builds of both packages.

```yaml
- name: Lint, typecheck, and format check
  run: bun run check
```

## Common Workflows

### Before Committing

```bash
# Run both lint and format check
bun run check
```

### Fixing All Issues

```bash
# Auto-fix all safe fixes
bun run lint:fix

# Format all files
bun run format
```

### Configuration Files

- `oxlint.config.ts` — linter rules, plugins, overrides, globals
- `oxfmt.config.ts` — formatter options (print width, quotes, semicolons, etc.)

## Design Philosophy

### Explicit rules over categories

Every rule in the config is individually listed rather than using Oxlint's category-based defaults (correctness, suspicious, pedantic, etc.). This trades verbosity for full control:

- **Every rule is a deliberate choice.** The config serves as documentation of what we enforce and why.
- **No surprises from upstream.** New rules added to categories won't silently start flagging code.
- **Overrides are surgical.** File-level exceptions have clear justifications in comments.

### Warnings are errors

The `check` script runs with `--deny-warnings`, so `warn` and `error` are equivalent in CI. The distinction is for editor experience: errors are red squiggles (must fix now), warnings are yellow (should fix, but the build won't break locally until you run `check`).

### Type-aware by default

Type-aware rules (`--type-aware --type-check`) run everywhere. This catches a class of bugs that purely syntactic linting misses — type assertions that don't hold, unreachable conditions, unsafe coercions. Some files suppress specific type-aware rules (e.g., `no-unnecessary-condition` on Drizzle query results) where the rule has known false positives for defensive runtime guards.

## Resources

- [oxlint Documentation](https://oxc.rs/docs/guide/usage/linter.html)
- [oxfmt Documentation](https://oxc.rs/docs/guide/usage/formatter.html)
- [Oxc GitHub Repository](https://github.com/oxc-project/oxc)
- [Oxc Zed Extension](https://github.com/oxc-project/oxc)
