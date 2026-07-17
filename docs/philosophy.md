# Philosophy

Design principles that guide decisions in this project.

---

## 1. Self-hosting without the operational burden

Docker + Bun + SQLite means no external managed services. One `docker compose up` gets you running. Networking (domain/reverse proxy) is the only unavoidable external dependency.

---

## 2. Fewer, better dependencies

Prefer stdlib/native runtime APIs over npm packages. Bun's built-in HTTP, WebSocket, test runner, and SQLite driver replace whole categories of dependencies. Drizzle gives type-safe SQL without ORM bloat.

### Dependencies we keep intentionally

**`ws`** — Bun's global `WebSocket` follows the WHATWG standard (`new WebSocket(url, protocols?)`) which provides no way to set custom HTTP headers on the handshake. The `ws` library supports `new WebSocket(url, { headers })`, which is needed to send `Authorization` and `User-Id` headers when connecting to NodeLink. This is a small (sub-1MB), focused, well-maintained package filling a genuine gap in the WHATWG API.

**`seyfert`** — Handles the Discord gateway protocol: heartbeats, identify, resume, sharding, opcode dispatch, and rate-limit backpressure. The codebase interacts with it at only ~6 call sites, but those are backed by hundreds of lines of non-trivial protocol logic. Reimplementing that correctly would be error-prone and violate the spirit of "better dependencies."

**`jsonwebtoken`** — Bun has Web Crypto API primitives (HMAC-SHA256, base64url) but no built-in JWT encode/decode. Implementing JWT from scratch — with correct expiration, audience, and algorithm handling — would be a net negative in maintenance surface area. This is a focused, zero-dependency library.

---

## 3. Single-process simplicity by design

The bot, API, and WebSocket run in a single Bun process. Shared memory = real-time updates without Redis pub/sub or message queues.

This is a deliberate tradeoff: horizontal scaling is sacrificed because the scope is a single self-hosted community, not a multi-tenant SaaS. Vertical scaling covers the actual use case; multi-replica complexity isn't justified.

---

## 4. Web UI as primary interface

Not a slash-command-only workflow. The Discord bot is the playback engine; the web app is the control plane. This avoids Discord's rate limits and UX constraints.

---

## 5. Audio is audio — no assumptions about content

Alfira functions equally as a traditional music bot and as a tabletop audio player. The data model — songs, playlists, tags — is content-type-agnostic: a three-minute pop song and an hour-long dungeon ambience are the same shape under the hood. Nothing in the schema or UI enforces "music" as the only valid use case.
