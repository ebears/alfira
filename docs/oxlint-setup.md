# oxlint + oxfmt Setup Guide

This document describes the oxlint and oxfmt configuration for the Alfira project.

## What are oxlint and oxfmt?

[oxlint](https://oxc.rs/docs/guide/usage/linter.html) is a high-performance linter for JavaScript and TypeScript built on the Oxc compiler stack. [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) is its companion formatter.

Together they provide:

- **Linting**: 660+ rules across eslint, typescript, react, jsx-a11y, unicorn, import, and more
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

# Combined: lint + format check
bun run check
```

## Editor Integration

### Zed Editor

Install the **Oxc** extension from Zed's extension marketplace. The project's `.zed/settings.json` configures both `oxlint` (LSP diagnostics) and `oxfmt` (formatter) language servers, with code actions for auto-fix on save.

### VS Code / Other Editors

See the [oxlint editor setup](https://oxc.rs/docs/guide/usage/linter/editors.html) and [oxfmt editor setup](https://oxc.rs/docs/guide/usage/formatter/editors.html) guides.

## CI Integration

oxlint is integrated into the GitHub Actions workflow (`.github/workflows/ci.yml`):

```yaml
- name: Lint (oxlint)
  run: bun run lint
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

## Resources

- [oxlint Documentation](https://oxc.rs/docs/guide/usage/linter.html)
- [oxfmt Documentation](https://oxc.rs/docs/guide/usage/formatter.html)
- [Oxc GitHub Repository](https://github.com/oxc-project/oxc)
- [Oxc Zed Extension](https://github.com/oxc-project/oxc)
