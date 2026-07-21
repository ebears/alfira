# Development Choices

This document explains the tools and architectural decisions behind Alfira — not just _what_ is used, but _why_ each choice was made, what the alternatives were, and what tradeoffs were accepted.

---

## Runtime: Bun

**Alfira is a Bun project first and foremost.** [Bun](https://bun.sh/) (v1.3+) is the runtime, the package manager, the bundler, and the test runner. It's the single dependency that replaces a handful of tools you'd otherwise need in a Node.js project.

This is the closest thing to a win-win in the stack. Bun is flatly faster than Node.js across the board — HTTP serving, WebSocket throughput, filesystem operations, startup time — while also collapsing several concerns into one tool:

| Node.js would need              | Bun provides                             |
| ------------------------------- | ---------------------------------------- |
| `http` / Express / Fastify      | `Bun.serve()`                            |
| `ws` / `socket.io`              | Built-in `WebSocket` and `WebSocketPair` |
| `better-sqlite3` (native addon) | `bun:sqlite` (built-in, no compilation)  |
| `tsc` or `tsup` for TypeScript  | Native `.ts` execution                   |
| `tsx` / `ts-node` for dev       | Direct `bun run file.ts`                 |
| `vitest` / `jest` for testing   | `bun test`                               |

The catch is that Bun is younger and more experimental — it's not the safe, boring choice. But for this project, the tradeoff feels more "bleeding edge" than "restrictive." Bun's API surface is stable for what Alfira uses, and the developer experience of a single tool that does everything is worth the risk of being an early adopter.

---

## TypeScript, Linting & Formatting: The Oxc "Supertool"

Alfira uses the **[Oxc](https://oxc.rs/) toolchain** (`oxlint` + `oxfmt`) for all three code quality concerns: **linting, typechecking, and formatting**. There is no `typescript` dev dependency and no `tsconfig.json`.

This is a deliberate bet on a newer toolchain that does more with less:

### oxlint (linting + typechecking)

`oxlint` handles both traditional lint rules (~120 enabled) **and** full type-aware checking via **tsgo** — the Go-based TypeScript compiler that just landed as the native engine in TypeScript 7. This means Alfira gets TypeScript 7-level type inference and checking without depending on the `typescript` npm package at all.

```bash
bun run check    # lint + full typecheck + format check (runs in CI)
bun run typecheck # lint + typecheck only
```

The `--deny-warnings` flag means every rule — even `warn`-level — fails the build. There is no "fix it later" category.

### oxfmt (formatting)

Zero-config, runs as `oxfmt --write .`. Shares the same Rust-based parser and AST as oxlint, so there's no toolchain mismatch between "what the formatter produces" and "what the linter sees."

### Why not Biome?

[Biome](https://biomejs.dev/) is the closest alternative and is also excellent. But Oxc won out for a few reasons:

- **ESLint rule compatibility.** `oxlint` supports a large subset of existing ESLint rules and plugins (`@typescript-eslint`, `unicorn`, `import`, `react`, `jsx-a11y`, `promise`, etc.). Biome has its own rule set that reinvents the wheel — powerful, but not what the ecosystem already speaks. Being able to carry forward ESLint knowledge and configurations is a practical advantage.
- **Type-aware linting with tsgo.** Biome has no type-aware rules. `oxlint` with tsgo catches things like `no-unsafe-assignment`, `no-floating-promises`, `switch-exhaustiveness-check`, and ~40 other type-level issues that a purely syntactic linter can't see. This matters for a codebase that pushes hard on type safety.
- **VoidZero backing.** Oxc is developed by [VoidZero](https://voidzero.dev/) (Evan You's company), which also builds Vite, Vue, and Rolldown. That's a serious engineering organization behind the tool.
- **Speed.** Biome is fast. Oxc is a little faster. When the tools are otherwise close, the edge goes to the faster one.

The `oxlint.config.ts` is the most detailed config file in the project (300+ lines) — a reflection of how seriously type safety and correctness are taken here. Every rule has a reason, and every file-specific override has a comment explaining why.

---

## Validation: Valibot

Runtime schema validation uses **[Valibot](https://valibot.dev/)** via `drizzle-valibot` for API input validation. Valibot was chosen over [Zod](https://zod.dev/) for consistency with the project's dependency philosophy.

Zod is the more established choice, and its API reads well. But Valibot is:

- **Modular and tree-shakeable.** Valibot's design means unused validators are eliminated at bundle time. This matters more for the frontend (where the shared types are imported) than the server, but consistency across packages is valuable.
- **Smaller.** A direct consequence of the modular design — Valibot ships less code.
- **Philosophically aligned with Drizzle.** Both are tree-shakeable, TypeScript-first, and minimal. Using Zod alongside Drizzle would have felt like mixing two different dependency philosophies.

This is a consistency choice more than a strong conviction — Zod would have worked fine. But in a project that's deliberate about every dependency, Valibot fits the pattern better.

---

## Database: SQLite + Drizzle ORM

### Why SQLite?

SQLite is the database you don't have to manage — no separate process, no connection strings, no replication. It's a single file (`/data/alfira.db`) that can be backed up with `cp`. For a single-guild music bot serving at most a few concurrent users, this is all the database you need.

The alternative would be PostgreSQL, which would add a separate Docker container, connection pooling, and backup complexity — all for features (concurrent writers, horizontal scaling) that Alfira will never use at this scale.

### Why Drizzle over Prisma?

**[Drizzle ORM](https://orm.drizzle.team/)** was chosen over Prisma for a specific reason: **it's minimal**. Prisma takes the opposite approach — schema files, code generation, a generated client with hundreds of methods — it's a full-featured ORM. Drizzle is barely an ORM at all. It's a thin type-safe SQL builder where the schema is TypeScript and queries read like SQL:

```typescript
const songs = await db.select().from(song).where(eq(song.id, id));
```

Drizzle has tighter TypeScript integration than Prisma. Prisma's schema-first approach with code generation was built for JavaScript-first workflows and feels bolted on when you're already working in TypeScript. Drizzle's code-first approach (define your schema in `.ts`, write queries in `.ts`) is a natural fit.

The combination of Drizzle + the custom migration runner has been seamless so far — 14 migrations and counting with zero issues.

---

## Migration Runner: Homegrown (60 Lines)

Instead of Drizzle Kit, Alfira uses a custom migration runner in `index.ts`:

1. Reads `.sql` files from `packages/server/src/shared/db/migrations/`
2. Computes a SHA-256 hash of each file
3. Tracks applied migrations in a `__drizzle_migrations` table
4. Runs unapplied migrations at server startup, splitting multi-statement files on `--> statement-breakpoint`

Migrations are handwritten SQL. This gives full control over DDL — indexes, constraints, `CREATE TABLE IF NOT EXISTS` — without an abstraction layer. The runner is trivial code (under 60 lines, no external dependencies) that does exactly what's needed and nothing more.

---

## Monorepo: Bun Workspaces

```
packages/
├── server/     # API server + Discord bot (Bun)
└── web/        # React 19 frontend (Bun build)
```

Two packages in a single Bun workspace. The server exports a `shared/` entrypoint that the web package imports directly as `"@alfira/server": "workspace:*"`. Shared types (`Song`, `Playlist`, `QueuedSong`), utilities, and the API client live in one place with zero duplication. An API schema change surfaces immediately as a type error in the frontend build.

The project used to be four packages (bot, API, shared, web) but was consolidated to two when the bot and API were merged into one process. Fewer packages, fewer boundaries, simpler mental model.

---

## Audio Pipeline: NodeLink as the Boundary Line

Audio playback runs through **[NodeLink](https://github.com/PerformanC/NodeLink)**, a Lavalink v4-compatible audio server. It's spawned as a child process inside the Docker container:

```
Bun API server
  └── spawns: bun /usr/local/nodelink/src/index.ts
        └── communicates via: WebSocket (opcodes) + REST (player control)
```

### NodeLink is the deliberate boundary

This is the one area of the project explicitly designated as **out of scope**. Source resolution — downloading audio from YouTube, SoundCloud, and other platforms — is a constant game of whack-a-mole with APIs that don't want to be scraped. Keeping that working requires dedicated effort and rapid response to breakages.

The original version of Alfira used `yt-dlp` + `ffmpeg` directly, which still offloaded the hard problem to an external tool (yt-dlp is community-maintained and updates frequently). NodeLink is a much smoother experience — REST API for player control, WebSocket for events, proper Opus encoding, and a feature set far beyond what a custom solution could reasonably provide. It's the perfect piece of the puzzle, and "it's their problem" is a feature, not a bug.

### Why a child process, not a separate container?

Alfira used to run as three or four Docker containers. Consolidating to one — backend, frontend, NodeLink, and SQLite all in the same container — was a deliberate simplification that eliminated inter-container networking, health check orchestration, and multi-service configuration. One `docker compose up` gets everything running.

---

## Discord Integration: Custom Gateway (Not discord.js)

Alfira uses a **custom Discord gateway client** instead of discord.js or any other Discord library. The gateway handles WebSocket lifecycle (identify, heartbeat, resume), voice state updates, and slash command registration — about 10% of what a full library provides.

### Why not discord.js?

discord.js is a full-featured library. Alfira used it early on, and also tried [Seyfert](https://seyfert.dev/) as an alternative. Both were eventually dropped in favor of a custom gateway built directly on Bun's `WebSocket`.

The math is simple: a Discord library brings in dozens of transitive dependencies for features Alfira doesn't use (message handling, cache management, permission resolution, REST client abstractions). The parts that _are_ used — the gateway, voice state events — are a few hundred lines of code. Maintaining those few hundred lines is less work than maintaining a dependency on a library that's orders of magnitude larger.

The same logic applies to other dependency cuts the project has made:

| Removed              | Replaced with                     | Lines added  |
| -------------------- | --------------------------------- | ------------ |
| discord.js / seyfert | Custom gateway on `Bun.WebSocket` | ~300         |
| `axios`              | `Bun.fetch()`                     | 0 (built-in) |
| `ws` (npm)           | `Bun.WebSocket` / `WebSocketPair` | 0 (built-in) |

Every cut follows the same principle: if Bun provides it or a small amount of custom code replaces it, the dependency goes.

---

## API Layer: Bun Native HTTP (No Framework)

The API server is `Bun.serve()` with a single `fetch` handler that routes by URL prefix. No Express, Hono, or any HTTP framework — just 11 route handlers, each a plain async function:

```typescript
(ctx: RouteContext, request: Request) => Promise<Response>;
```

Bun's native `Request`/`Response` API is fully standards-compliant. At this scale (prefix-based routing, single middleware function for security headers), a framework would add abstraction without removing complexity.

### Real-Time Updates: Receive-Only WebSocket

Player state changes are broadcast to the web UI via a WebSocket pipeline. The design is intentionally minimal:

- **The client never sends messages.** The WebSocket is a push channel for player state. All mutations go through REST. This keeps the protocol one-directional.
- **Auth before upgrade.** The session cookie is validated before the WebSocket connection is accepted. Failures return 401 without an upgrade. No post-upgrade auth handshake.
- **No external state store.** Player state lives in-process. When `GuildPlayer` fires an update, it pushes directly to connected WebSocket clients. No Redis, no pub/sub, no message queue. This is a deliberate tradeoff: the scope is one guild, one process — shared memory replaces infrastructure.

---

## Frontend: React 19 + Tailwind CSS 4

### React

React was, honestly, just what the project started with. There was no deep framework evaluation — it was the most familiar option at the time. After building with it, though, a few things have become genuinely appreciated:

- **TSX is remarkably powerful.** The combination of TypeScript and JSX — writing components as functions that return typed markup — creates a development flow where logic and presentation are co-located without ceremony. Component reuse feels natural and productive.
- **99% of code lives in `.tsx` and `.ts` files.** Between React components and Tailwind utility classes, there's very little touching of `.html` or `.css` files. The entire UI surface is expressed in TypeScript.
- **The ecosystem, while overwhelming, delivers.** When a specialized need arises — virtualized lists, drag-and-drop, masonry grids — there's a well-maintained library for it. Importing a library for these hard problems is pragmatic; writing them from scratch would be a distraction from the actual product.

If starting over today, [Vue](https://vuejs.org/) (also backed by VoidZero, whose tooling ecosystem is highly regarded) or [SolidJS](https://www.solidjs.com/) (TSX without a virtual DOM) would get a serious look. React isn't the only game in town, and the virtual DOM overhead is real. But React has been more than capable, and there's no compelling reason to rewrite.

### Pragmatic library imports

Some frontend concerns are hard enough to justify pulling in a dependency:

| Library                             | Why import it                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-virtual`           | Virtualizing lists of thousands of songs without DOM bloat. Not a thing you write yourself.               |
| `masonic`                           | Masonry grid for the card view — variable-height cards in a packed layout. Deceptively hard to get right. |
| `@atlaskit/pragmatic-drag-and-drop` | Playlist reordering via drag-and-drop. Writing custom DnD is a rabbit hole of edge cases.                 |
| `motion` (framer-motion)            | Page transitions and micro-animations. `LazyMotion` + `m` keeps the bundle at 4.6KB.                      |
| `@phosphor-icons/react`             | Consistent icon set, tree-shakeable, 6 styles per icon.                                                   |

These are chosen carefully — each one solves a problem that would take weeks to implement correctly.

### Tailwind CSS

Tailwind is... fine. The project uses it and it works. The utility-first approach keeps styles colocated with markup, and combined with React it means almost everything is a `.tsx` file — that's genuinely nice. There's also value in Tailwind being a "standardized library" that anyone familiar with it can pick up immediately.

If starting over today, it's not clear Tailwind would be the choice again. But it's not causing problems, and there's no reason to migrate away. Indifference is the operative emotion here.

### Build: Bun, not Vite

The web build uses `bun build` directly rather than Vite (which would be the conventional choice for a React project). Vite is an excellent tool but `bun build` handles TypeScript, JSX, and tree-shaking out of the box without additional configuration. Tailwind CSS 4 is compiled separately via `@tailwindcss/cli` before the JS bundle. Two build steps, no framework.

### Why not Next.js?

Next.js wasn't seriously evaluated — the project started as a React SPA because that's what made sense with the tools at hand, and it's never given a reason to look elsewhere.

Next.js's headline value is **server-side rendering**: sending complete HTML to the browser before JavaScript loads, so users see content immediately rather than a loading spinner. Combined with Server Components, it lets you fetch data at render time on the server rather than in a client-side `useEffect`. These are real, meaningful benefits — for content that can be pre-rendered.

Alfira's content can't, for the most part. Nearly all data flows through the REST API or arrives over the WebSocket. The song library, playlists, request queue — these change while you're looking at them and need client-side fetching to stay current regardless. The now-playing bar is literal real-time position updates. Even the pages where SSR _could_ pre-populate the initial state (settings, tags) would save a single API round-trip measured in single-digit milliseconds over a local network.

A public-facing marketing site or documentation (possible post-1.0, but firmly out of scope for now) would change the calculus — Next.js excels at mixing static content with an app. But for a single-purpose, authenticated, real-time dashboard behind a reverse proxy on a home NAS, an SPA is the right call.

---

## Containerization: One Container, Down from Four

The project used to run as three or four separate Docker containers: one for the API, one for the bot, one for frontend, and one for PostgreSQL. It has since been consolidated to **one container** containing:

- The Bun API server + Discord bot (single process)
- NodeLink (child process)
- SQLite (file on a mounted volume)
- Static web assets (served by Bun)

This consolidation was a big deal. Multi-container setups add networking, health check orchestration, `depends_on` chains, and separate configuration per service. One container means one `docker compose up`, one health check, one set of environment variables. The Dockerfile uses multi-stage builds (build → builder → runtime) to keep the final image lean, and the runtime runs as a non-root `nodejs` user.

---

## Design Principles

These are the principles that drive every tool choice and architectural decision in this project:

1. **Self-hosting without operational burden.** One container, one process, one config file, one database file. If a choice adds operational burden, it needs a very strong justification.
2. **Fewer, better dependencies.** Bun's built-ins over npm packages. A few hundred lines of custom code over importing an entire library for 10% of its features. Every dependency must pull its weight and justify its existence.
3. **Single-process by design.** Bot, API, and WebSocket share memory in one Bun process. Real-time updates reach the web UI without Redis, message queues, or inter-container networking. This is a deliberate tradeoff: the scope is a single self-hosted community, not multi-tenant SaaS.
4. **Web UI as primary interface.** The Discord bot is the playback engine; the web app is the control plane. This avoids Discord's rate limits and UX constraints while enabling features that wouldn't be possible through chat commands alone.
5. **Audio is audio — no assumptions about content.** Works equally as a music bot or tabletop audio player. The data model (songs, playlists, tags) is content-type-agnostic: a pop song and an hour-long dungeon ambience are the same shape.
6. **Type safety end-to-end.** TypeScript from database schema to frontend components. Type-aware linting on every file. Shared types between packages. Runtime validation with Valibot. The type system is the first line of defense against bugs.
7. **Quality ratchet.** Lint rules only get stricter. Warnings are errors. Stale suppressions fail the build. The bar never goes down.

Here's how each principle maps to specific decisions in this document:

| Principle                               | Drove                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Self-hosting without operational burden | SQLite over PostgreSQL, single Docker container, NodeLink as child process                                    |
| Fewer, better dependencies              | Custom Discord gateway over discord.js, Bun over Node.js + Express + ws + better-sqlite3, Drizzle over Prisma |
| Single-process by design                | One Bun process for bot + API + WebSocket, shared memory for player state, no Redis                           |
| Web UI as primary interface             | React SPA as the control plane, receive-only WebSocket, Discord bot as pure playback engine                   |
| Audio is audio                          | Content-type-agnostic data model, source resolution delegated to NodeLink                                     |
| Type safety end-to-end                  | oxlint with tsgo, Valibot, `@alfira/server/shared` cross-package type contracts                               |
| Quality ratchet                         | `--deny-warnings`, `reportUnusedDisableDirectives: 'error'`, ~120 lint rules                                  |
