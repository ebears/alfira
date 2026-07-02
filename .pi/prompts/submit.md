---
description: Stage changes, create a feature branch, commit with semantic message, push, and open a PR
argument-hint: "[optional commit description]"
---

Follow these steps exactly, reporting progress as you go.

## 1. Determine the change type and scope

Read `git diff --stat` and `git diff` (or `git diff --cached` if staged) to understand what changed. Based on the changes, determine:

- **type**: one of `feat`, `fix`, `chore`, `refactor`, `docs`, `ci`, `style`, `test`, `perf`, `security`, `revert`
- **scope** (optional): affected package/area — `server`, `web`, `deps`, `db`, `docker`, `auth`, `ci`, `docs`
- **short description**: imperative, lowercase, no trailing period, max ~72 chars

If the user provided an argument ($@), use it to help formulate the message. If they provided a full conventional commit string (e.g. `fix(server): handle websocket timeout`), use it as-is.

## 2. Run quality checks

```bash
bun run check
```

If lint or format issues are found, fix them before proceeding. If fixes produce additional changes, re-run `bun run check`.

## 3. Create a feature branch

If currently on `main` or `dev`, create a new branch from `dev` that is up to date:

```bash
git checkout dev && git pull origin dev
git checkout -b <type>/<short-description>
```

If already on a feature branch (not `main` or `dev`), ask the user whether to use the current branch or create a new one.

## 4. Stage and commit

Stage all changes:

```bash
git add -A
```

Commit with the semantic message:

```bash
git commit -m "<type>[optional scope]: <description>"
```

If the changes span multiple logical concerns, suggest splitting into separate commits. Ask the user for guidance.

## 5. Push

```bash
git push -u origin HEAD
```

## 6. Create PR

```bash
gh pr create \
  --title "<type>[optional scope]: <description>" \
  --body "## Summary

<brief summary of changes>

## Changes

- <change 1>
- <change 2>" \
  --base dev
```

Open the PR URL for the user.
