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

Alfira uses the **[Oxc](https://oxc.rs/) toolchain** (`oxlint` + `oxfmt`) for all three code quality concerns: **linting, typechecking, and formatting**. There is no `typescript` dev dependency — typechecking is handled entirely by oxlint's tsgo engine.

This is a deliberate bet on a newer toolchain that does more with less:

### oxlint (linting + typechecking)

`oxlint` handles both traditional lint rules (~120 enabled) **and** full type-aware checking via **tsgo** — the Go-based TypeScript compiler that just landed as the native engine in TypeScript 7. This means Alfira gets TypeScript 7-level type inference and checking without depending on the `typescript` npm package at all.

```bash
bun run check    # lint + full typecheck + format check + tests (runs in CI)
bun run typecheck # lint + typecheck only
bun test          # run all tests
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

### Additional QA tooling

Two more tools round out the quality pipeline:

- **[knip](https://knip.dev/)** finds unused files, dependencies, and exports. Run `bunx knip` periodically — it catches dead code that the linter can't see (unused exports, orphaned files, stale dependencies).
- **[lefthook](https://github.com/evilmartians/lefthook)** runs lint, format check, and tests automatically on `git commit`. Install once with `bunx lefthook install` and every commit gets the same checks as CI — no more "works on my machine but fails in CI" surprises.

Together with `oxlint --deny-warnings`, these create a ratchet: the bar never goes down, and violations are caught as early as possible (on save → on commit → in CI).

---

## Validation: Elysia `t` Type System

API input validation uses **[Elysia's built-in `t` (TypeSystem)](https://elysiajs.com/patterns/type-system.html)** rather than a standalone validation library. Elysia's type system is inspired by TypeBox and provides a fluent API for defining schemas that are both runtime validators and TypeScript type providers.

```typescript
import { t } from 'elysia';

// Input validation on a route — auto-rejects mismatches with 422
app.post('/api/songs', ({ body }) => { ... }, {
  body: t.Object({
    sourceUrl: t.String(),
    title: t.Optional(t.String()),
  }),
});

// Response schemas for Eden type inference
app.get('/api/songs', () => { ... }, {
  response: t.Object({
    songs: t.Array(SongSchema),
    meta: PaginationMeta,
  }),
});
```

The previous Valibot-based validation was replaced during the Elysia migration. Elysia's `t` system was chosen because:

- **No separate validation dependency.** Validation is part of the framework — the same `t` schemas define runtime validation, TypeScript types, and Eden client inference.
- **Single source of truth.** One schema definition covers three concerns (route validation, TypeScript types, client-side inference) — no duplication between Valibot schemas, TypeScript interfaces, and API documentation.
- **Eden integration.** Response schemas flow through to the frontend Eden Treaty client, giving components fully typed API responses without manual type declarations.

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

## API Layer: Elysia

The API server uses **[Elysia](https://elysiajs.com/)**, a Bun-native web framework with first-class TypeScript support. Elysia wraps `Bun.serve()` and provides ergonomic routing, validation, middleware, and WebSocket handling — all with end-to-end type inference.

### Why Elysia over raw `Bun.serve()`?

The project originally used `Bun.serve()` directly with prefix-based routing — no framework, just 11 async route handlers. That worked well at the start, but as the API grew, several pain points emerged:

- **Manual routing.** Adding a route meant editing a monolithic `fetch` handler in `index.ts` and wiring up context, auth, and security headers by hand.
- **No type-safe API contract.** Route handlers returned `Response` objects, which erased type information. The frontend client had to manually declare types for every endpoint.
- **Ad-hoc validation.** Input validation used Valibot separately from route definitions — two places to update when schemas changed.
- **Inconsistent error handling.** Some routes returned `json({ error }, status)`, others threw. No central error boundary.

Elysia solved all of these:

- **Plugin-based routing.** Routes are [Elysia plugins](https://elysiajs.com/essential/plugin.html) (`*.elysia.ts` files), each registering its own routes on a scoped instance. Adding a route means creating or extending a plugin — no central routing table.
- **Eden Treaty.** The [Eden Treaty](https://elysiajs.com/eden/treaty/overview.html) client generates fully typed API functions from Elysia's route definitions. Frontend code gets autocomplete and type checking on every API call — no hand-written type declarations.
- **Built-in validation via `t`.** Input schemas are defined inline with routes using Elysia's `t` type system. Invalid requests get 422 responses automatically. Response schemas provide runtime coercion and feed into Eden's type inference.
- **Central error handling.** `ApiError` (a lightweight error class) is thrown from route handlers and caught by Elysia's `onError` hook — no `instanceof` checks, no manual status code management.

### Architecture (`elysia-app.ts`)

The HTTP layer is defined in `packages/server/src/elysia-app.ts` as a composition of three Elysia instances:

```
root app (port 3001)
├── CORS middleware
├── apiApp (prefix: /api)
│   ├── onAfterHandle → security headers
│   ├── onError → ApiError → JSON response
│   ├── GET /api/version
│   ├── tagsPlugin, songsPlugin, playlistsPlugin, …  (all route plugins)
│   └── playerPlugin, setupPlugin, permissionsPlugin, …
├── authApp (prefix: /auth)
│   └── authPlugin (OAuth2 login/callback/logout)
├── GET /health
├── WS /ws (player state push)
└── GET /* (static assets + SPA fallback)
```

### Auth & Guards

Authentication is handled by the `authPlugin` (`lib/elysia-guards.ts`) using Elysia's [macro system](https://elysiajs.com/patterns/macro.html). Guards are opt-in annotations on routes:

```typescript
// Route requires authentication
.get('/profile', handler, { isAuth: true })
// Route requires admin
.get('/admin', handler, { isAdmin: true })
// Route requires granular permission (super-admins bypass)
.patch('/manage', handler, { hasPermission: 'queue.manage' })
// Route requires user in a voice channel
.post('/control', handler, { isVoiceChannel: true })
```

Each guard macro resolves the session cookie, verifies the JWT, and either populates `{ user }` into context or short-circuits with the appropriate 401/403/409 response. Macros compose — `isVoiceChannel` extends `isAuth`, so a route only needs to declare the most specific guard.

For plugins where every route requires auth, `requireAuth` (a scoped `resolve`) applies auth to all routes at once:

```typescript
new Elysia()
  .use(authPlugin)
  .use(requireAuth)
  .get('/songs', handler) // auth required (scoped)
  .get('/playlists', handler); // auth required (scoped)
```

### Real-Time Updates: Receive-Only WebSocket

Player state changes are broadcast via Elysia's `.ws()` handler. The design remains intentionally minimal:

- **The client never sends messages.** The WebSocket is a push channel for player state. All mutations go through REST.
- **Auth before accept.** The session cookie is validated in the `open` handler. Unauthenticated connections are closed immediately.
- **No external state store.** Player state lives in-process. When `GuildPlayer` fires an update, it pushes directly to connected WebSocket clients. No Redis, no pub/sub, no message queue.

---

## Frontend: React 19 + Tailwind CSS 4

### React

React was chosen for its pragmatic blend of developer experience and ecosystem maturity. A few things that turned out to be genuine advantages:

- **TSX is remarkably powerful.** The combination of TypeScript and JSX — writing components as functions that return typed markup — creates a development flow where logic and presentation are co-located without ceremony. Component reuse feels natural and productive.
- **99% of code lives in `.tsx` and `.ts` files.** Between React components and Tailwind utility classes, there's very little touching of `.html` or `.css` files. The entire UI surface is expressed in TypeScript.
- **The ecosystem, while large, delivers.** When a specialized need arises — virtualized lists, drag-and-drop, masonry grids — there's a well-maintained library for it. Importing a library for these hard problems is pragmatic; writing them from scratch would be a distraction from the actual product.

[SolidJS](https://www.solidjs.com/) (TSX without a virtual DOM, signals-based reactivity) is the only alternative that would get a serious look if starting over. Its reactivity model is genuinely compelling, and the syntax is close enough to React that the mental model transfers. But Solid's ecosystem is an order of magnitude smaller — the libraries this project depends on (`@tanstack/react-virtual`, `@atlaskit/pragmatic-drag-and-drop`, `motion`) don't have Solid equivalents at the same maturity level. React's ecosystem advantage is real, not just inertia, and it has been more than capable for everything Alfira needs.

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
6. **Type safety end-to-end.** TypeScript from database schema to frontend components. Type-aware linting on every file. Shared types between packages. Runtime validation with Elysia's built-in `t` type system. The type system is the first line of defense against bugs.
7. **Quality ratchet.** Lint rules only get stricter. Warnings are errors. Stale suppressions fail the build. The bar never goes down.

Here's how each principle maps to specific decisions in this document:

| Principle                               | Drove                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Self-hosting without operational burden | SQLite over PostgreSQL, single Docker container, NodeLink as child process                                    |
| Fewer, better dependencies              | Custom Discord gateway over discord.js, Bun over Node.js + Express + ws + better-sqlite3, Drizzle over Prisma |
| Single-process by design                | One Bun process for bot + API + WebSocket, shared memory for player state, no Redis                           |
| Web UI as primary interface             | React SPA as the control plane, receive-only WebSocket, Discord bot as pure playback engine                   |
| Audio is audio                          | Content-type-agnostic data model, source resolution delegated to NodeLink                                     |
| Type safety end-to-end                  | oxlint with tsgo, Elysia `t` validation, `@alfira/server/shared` cross-package type contracts                 |
| Quality ratchet                         | `--deny-warnings`, `reportUnusedDisableDirectives: 'error'`, ~120 lint rules                                  |
