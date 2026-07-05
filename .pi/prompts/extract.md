---
description: Identify repeated code patterns and propose new abstractions — components, hooks, or utilities
argument-hint: "[area to focus on]"
---

Search for repeated code patterns in the repo and propose concrete abstractions. $1

## Mindset

This is a **design** activity, not a cleanup. The goal is not to find "duplication" and mechanically remove it. The goal is to ask: *what better structure could exist here?*

Repeated code is a signal. It tells you that the codebase wants an abstraction it doesn't have yet. Your job is to read that signal, imagine the abstraction, and make a concrete, specific proposal.

**You are not enforcing existing conventions.** An existing pattern might itself be the thing that needs to change. Question it.

## Approach

**Survey first, propose second.** Read broadly across the area — not just the files that look duplicated, but files that *should* share a pattern but don't. Build a mental model of the shapes that repeat, and the shapes that are weird one-offs.

**Propose one abstraction at a time.** If you find multiple candidates, pick the most impactful one and stay with it. A single well-designed extraction teaches the codebase more than three rushed ones.

**Show the tradeoff.** Every abstraction has a cost: indirection, lock-in, the mental overhead of "what does this wrapper do?" Be honest about what you lose. Not every repetition deserves extraction — the Rule of Three is real.

## What to look for

In this TypeScript + React codebase, focus on:

- **Structural skeletons** — the same state machine, layout shell, or container pattern appearing in 3+ files. The virtual list skeleton/empty/content pattern is the canonical example.
- **Repeated hook clusters** — the same 3-4 `useState`/`useEffect`/`useRef` combinations appearing in multiple components.
- **Repeated className palettes** — the same styling patterns (not just Tailwind utility strings, but compositional groups) that could be a shared component or `cva` variant.
- **Parallel prop drilling** — the same props threaded through multiple components to the same leaf. Often the leaf should hoist, or a context should carry the data.
- **Paired files that should be one** — two files that are always read together, changed together, and each is incomprehensible without the other.

## What to *not* flag

- Two occurrences of something. Wait for three.
- Things that look similar but solve different problems. Superficial similarity is a trap.
- Code that's unlikely to change. If it hasn't moved in months and won't, the extraction cost isn't worth it.
- "We could make this more generic." Speculative generality is an anti-pattern.

## Output format

For each abstraction you propose:

### What repeats
Show the concrete code fragments from 2-3 files. Don't describe — show.

### Proposed abstraction
What new thing would you create? (component, hook, context, utility, etc.)
Where would it live?

### Before / after sketch
Show one concrete file before and after the extraction. The "after" should be clearly simpler.

### Tradeoffs
- What gets better?
- What gets harder?
- What's the risk of extracting too early?

### Verdict
Your recommendation: **extract now**, **defer** (wait for a third occurrence), or **leave as-is** (pattern is fine).

## After agreement

If the user wants to proceed, say *"Want me to /plan this?"* — do not implement directly from this prompt. The plan step is the gate between design and code.
