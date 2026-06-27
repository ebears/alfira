# Philosophy

Design principles that guide decisions in this project.

---

## 1. Self-hosting without the operational burden

Docker + Bun + SQLite means no external managed services. One `docker compose up` gets you running. Networking (domain/reverse proxy) is the only unavoidable external dependency.

---

## 2. Fewer, better dependencies

Prefer stdlib/native runtime APIs over npm packages. Bun's built-in HTTP, WebSocket, test runner, and SQLite driver replace whole categories of dependencies. Drizzle gives type-safe SQL without ORM bloat.

---

## 3. Single-process simplicity by design

The bot, API, and WebSocket run in a single Bun process. Shared memory = real-time updates without Redis pub/sub or message queues.

This is a deliberate tradeoff: horizontal scaling is sacrificed because the scope is a single self-hosted community, not a multi-tenant SaaS. Vertical scaling covers the actual use case; multi-replica complexity isn't justified.

---

## 4. Web UI as primary interface

Not a slash-command-only workflow. The Discord bot is the playback engine; the web app is the control plane. This avoids Discord's rate limits and UX constraints.

---

## 5. Type safety across the boundary

Shared package (`@alfira-bot/server/shared`) gives end-to-end types from DB → API → WebSocket → React. TypeScript is the contract — no manual DTOs, no `any` at the seams. Verified by `bun run check` across the workspace.