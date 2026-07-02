---
description: Run quality checks and review the diff before submitting — the gate before /submit
---

Run the verification gate. Do not proceed to `/submit` until this passes.

## 1. Lint and format

```bash
bun run check
```

If issues are found, fix them and re-run.

## 2. TypeScript compilation

```bash
bunx tsc --noEmit -p packages/server/tsconfig.json
bunx tsc --noEmit -p packages/web/tsconfig.json
```

If errors, fix them and re-run from step 1.

## 3. Review the diff

```bash
git diff --stat
git diff
```

Check for:
- Debug logging left in
- Commented-out code
- Hardcoded values that should be config
- Missing error handling
- Changes that snuck in from unrelated work
- Files that shouldn't be committed (`.env`, `dist/`, etc.)

## 4. Untracked files

```bash
git status --short
```

Flag any untracked files that should be committed, gitignored, or deleted.

## 5. Report

Output a summary:

```
✅ Lint:       clean
✅ TypeScript: clean
⚠️  Diff:      3 files, +42/-8 — reviewed, no issues
✅ Untracked:  .pi/prompts/plan.md (should be committed)

Verdict: READY TO SUBMIT
```

If anything fails, report the issues and stop. Do not proceed to `/submit`.
