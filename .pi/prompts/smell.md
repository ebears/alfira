---
description: Find and evaluate code smells — structural design issues worth refactoring
argument-hint: "[area to focus on]"
---

Search for code smells in the repo. $1

Follow these principles:

## Approach

**Understand first.** Before flagging anything, build a holistic understanding of the project — not just individual files, but how they fit together. Read related files, trace call paths, and grasp the architecture. A pattern that looks like a smell in isolation may be a deliberate tradeoff when you see the full picture.

**Evaluate cost vs. benefit.** Not every smell is worth fixing. Ask: does this actually cause bugs or slow down development? A long function that never changes and is well-tested may not be worth the churn. Be honest about when the juice isn't worth the squeeze.

**Focus on one smell at a time.** If you find multiple candidates, pick the most impactful one and stay with it.

**Behavior must be preserved.** A refactor changes structure, not behavior. If tests exist, they must still pass. If they don't, be explicit about what you're relying on for safety.

## What to look for

Smells relevant to this TypeScript + React codebase:

- **Long functions** — functions over ~40 lines that juggle multiple responsibilities. Especially common in route handlers and Discord event callbacks.
- **God objects** — classes or modules that know and do too much. GuildPlayer, large React components with many hooks, or utility modules that have become grab-bags.
- **Primitive obsession** — strings and numbers used where a small typed wrapper would prevent bugs (e.g., raw strings for IDs, magic numbers for durations, untyped config dictionaries).
- **Feature envy** — a function that spends more time accessing another module's data than its own. Often a sign that the logic belongs somewhere else.
- **Too many parameters** — functions with 4+ positional parameters, especially when several are always passed together (data clump).
- **Commented-out explanations** — comments that narrate *what* the code does rather than *why*. The code should be self-documenting; comments should explain intent.
- **Inconsistent patterns** — the same problem solved differently in different places (error handling, validation, async patterns, state management).
- **Shotgun surgery** — a single conceptual change requiring edits across many files. Often a sign of poor cohesion.
- **Speculative generality** — hooks, abstractions, or configuration built for a future that never arrived.

## Standards

The goal is code that's easy to reason about and cheap to change. Every refactor should make the codebase clearly better, not just different. If the improvement is marginal, say so — it might not be worth the risk.

## If you find a smell worth fixing

1. Describe the smell: what it is, where it lives, why it hurts
2. Propose the fix at a high level (not a line-by-line plan — that's what `/plan` is for)
3. Offer to proceed: "Want me to `/plan` this and implement it?"

## Honesty

If you don't find anything worth acting on, say so. A clean bill of health is a good result. Don't invent problems.
