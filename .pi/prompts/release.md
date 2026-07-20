---
description: Create a release PR from dev to main, auto-determine version from conventional commits, and update the changelog
argument-hint: '[version or semver bump: major|minor|patch]'
---

Follow these steps exactly, reporting progress as you go.

> ⚠️ **Releases touch `main`, trigger CI/CD, and publish artifacts. This is the riskiest operation in the workflow. Double-check everything before pushing.**

## 1. Check what's pending

```bash
git fetch origin
git log origin/main..origin/dev --oneline --no-merges
```

If there are no pending commits, stop — there's nothing to release.

Summarize the changes grouped by conventional commit type: `feat`, `fix`, `chore`, `refactor`, `docs`, `ci`, `style`, `test`, `perf`, `security`, `revert`.

## 2. Run quality checks

```bash
bun run check
bunx tsc --noEmit -p packages/server/tsconfig.json
bunx tsc --noEmit -p packages/web/tsconfig.json
```

If anything fails, stop and report the issues. The release gate must be clean.

## 3. Determine the next version

Read the current version from `package.json` (the `"version"` field in the root):

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"
```

### If the user provided a version (argument $@)

Use it directly. Skip the auto-bump logic below.

### Auto-bump logic (no argument provided)

Count the pending commits by conventional commit type:

**Pre-stable (0.x.x):**

- Any `feat` commits → bump **minor** (e.g., 0.1.0 → 0.2.0)
- Only `fix`/`chore`/`refactor`/`docs`/`ci`/`style`/`test`/`perf` → bump **patch** (e.g., 0.1.0 → 0.1.1)

**Stable (1.x.x+):**

- Any `BREAKING CHANGE` footer or `!` in commit type (e.g., `feat!`) → bump **major**
- Any `feat` commits → bump **minor**
- Only `fix`/`chore`/etc. → bump **patch**

Compute: `v<major>.<minor>.<patch>`.

Tell the user what you determined and why (e.g., "Bumping minor because there are feat commits: v0.1.0 → v0.2.0"). If they disagree, they can provide a different version.

## 4. Update the changelog and version

Check that `CHANGELOG.md` exists. If it doesn't, stop and ask: "No CHANGELOG.md found. Want me to create one?"

### Changelog

Read `CHANGELOG.md`. Replace the `## [Unreleased]` section with:

```markdown
## [VERSION] - YYYY-MM-DD

### Added

- <items from feat commits>

### Changed

- <items from refactor/perf commits>

### Fixed

- <items from fix commits>

### Security

- <items from security commits>
```

Only include sections that have items. Under each section, list the commit messages (without the type prefix) as bullet points.

Then add a new empty `## [Unreleased]` section above the version just released.

Add a link reference at the bottom for the new version (following the existing `[Unreleased]` link pattern).

### Package version

Update the `"version"` field in root `package.json` to the new version **without the `v` prefix** (e.g., `"0.2.0"`, not `"v0.2.0"`).

### Review

Show the generated changelog entry to the user. Ask them to review and edit before proceeding — commit messages often need cleanup to read well as release notes.

## 5. Create release branch

```bash
git checkout dev && git pull origin dev
git checkout -b release/v<version>
```

If the branch already exists, append a counter: `release/v<version>-2`.

## 6. Stage, commit, and push

```bash
git add CHANGELOG.md package.json
git commit -m "chore(release): bump version to v<version>"
git push -u origin HEAD
```

## 7. Create release PR

```bash
gh pr create \
  --title "release: v<version>" \
  --body "$(cat <<'EOF'
## Release v<version>

<Paste the changelog entry for this version here — the Added/Changed/Fixed/Security sections with bullet points.>

## Commits

$(git log origin/main..origin/dev --oneline --no-merges | sed 's/^/- /')
EOF
)" \
  --base main
```

Open the PR URL for the user.

## 8. Post-merge instructions

Remind the user:

1. After the release PR merges to `main`, pull the latest `main` and tag it:

   ```bash
   git checkout main && git pull origin main
   git tag v<version>
   git push origin v<version>
   ```

   This triggers the `release.yml` workflow — Docker build, Docker push to GHCR, and GitHub Release creation with changelog notes and assets. Tagging `main` (not the release branch) ensures the release points to the merged commit.

2. Sync `dev` with `main` to keep history linear:

   ```bash
   git checkout dev && git merge main && git push origin dev
   ```

3. If the PR required changes (code, not just changelog), the tag and release point to the old commit. Delete the release and tag, then re-run from step 6.
