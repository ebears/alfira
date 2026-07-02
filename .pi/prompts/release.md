---
description: Create a release PR from dev to main with changelog summary
argument-hint: "[version or semver bump: major|minor|patch]"
---

Follow these steps exactly, reporting progress as you go.

## 1. Check what's pending

Show what commits are on `dev` but not `main`:

```bash
git fetch origin
git log origin/main..origin/dev --oneline --no-merges
```

Summarize the changes by conventional commit type (feat, fix, chore, etc.).

## 2. Determine version (if applicable)

$@

If the user provided a semver bump (major, minor, patch) or a specific version, note it. If this is pre-release and they didn't provide one, skip versioning.

## 3. Create release branch

```bash
git checkout dev && git pull origin dev
git checkout -b release/<version-or-description>
```

If no version was specified, use a short description — e.g., `release/q3-2026` or `release/july-updates`.

## 4. Create release PR

```bash
gh pr create \
  --title "release: <version-or-description>" \
  --body "## Release Summary

<brief description of what's being released>

## Changes Since Last Release

$(git log origin/main..origin/dev --oneline --no-merges | sed 's/^/- /')" \
  --base main
```

Open the PR URL for the user.

## 5. Post-merge reminder

Remind the user that after the release PR is merged to `main`, `dev` should be synced:

```bash
git checkout dev && git merge main && git push origin dev
```
