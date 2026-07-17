---
description: Search for cleanup opportunities — unused, redundant, or repeated code
argument-hint: '[area to focus on]'
---

Search for a cleanup opportunity in the repo. $1

Follow these principles:

## Approach

**Understand first.** Before suggesting any change, build a holistic understanding of the project — not just individual files, but how they fit together as a whole. Read related files, trace the call paths, and grasp the architecture. Only then evaluate whether something is truly redundant or unused.

**Focus on one thing at a time.** If you find multiple candidates, pick one and stay with it. Precise, focused changes are better than sweeping ones.

## What to look for

- Dead code — functions, types, imports, or variables that are never used
- Redundant code — logic that appears in multiple places and should be unified
- Repeated patterns — duplicated blocks that could be extracted
- Leftover artifacts — debug logging, commented-out blocks, stale references

## Standards

The goal is a clean, legible codebase that's easy to reason about and extend. Every removal or simplification should raise the bar, not just churn the code.

## Boundaries

Structural design issues — long functions, god objects, feature envy, inconsistent patterns — aren't cleanup. Use `/smell` for those.

## Honesty

If you don't find anything worth acting on, say so. It's better to be honest than to manufacture a problem that doesn't exist. No cleanup is still a valid result.
