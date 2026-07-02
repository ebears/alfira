---
description: Break down a feature or fix into a concrete implementation plan with file-level steps
argument-hint: "<task description>"
---

Before writing any code, produce a plan. If the user provided a task description ($@), use it as the starting point. Otherwise, ask what we're building.

## Plan format

Output a plan with these sections:

### Goal
One sentence. What are we doing and why?

### Scope
What files will be touched. Group by package:
```
packages/server/src/...
packages/web/src/...
docs/...
```

### Implementation steps
Numbered, ordered steps. Each step should be a single logical change at the file level. Avoid steps that touch 10 files at once — split them up.

Example:
```
1. Add new type to packages/server/src/shared/types.ts
2. Create new route handler in packages/server/src/routes/foo.ts
3. Wire up route in packages/server/src/index.ts
4. Add API call in packages/web/src/api/foo.ts
5. Create UI component in packages/web/src/components/Foo.tsx
```

### Risks / edge cases
Anything that could go wrong or needs special attention.

### Verification
What to check after implementation:
- [ ] `bun run check` passes
- [ ] TypeScript compiles
- [ ] Manual test steps (if applicable)

After the plan is agreed to, proceed with implementation one step at a time.
