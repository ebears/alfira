# Elysia Migration

## Goal

Replace the homegrown HTTP framework (`routeTable`, `matchPath`, `RouteContext`, manual JSON serialization, `Bun.serve({ routes })` wiring) with [Elysia](https://elysiajs.com) — a Bun-native web framework that provides:

- **Declarative routing** — paths, params, and HTTP verbs defined in one place instead of spread across handler functions, `routeTable` entries, and `index.ts` wiring
- **Automatic request validation** — Elysia `t` schemas in route definitions (`{ body: Schema }`); invalid requests never reach the handler
- **End-to-end type safety via Eden** — the server's route types auto-generate the client API surface, eliminating the manually-maintained `shared/api.ts` + `web/api/client.ts` (~680 lines of glue code)
- **Smaller, standard API surface** — Elysia is widely documented and has a large community, reducing onboarding friction

## Design decisions

- **Elysia `t` replaces Valibot.** Elysia's built-in TypeBox-based `t` system provides request/response validation and type inference without an external dependency. Valibot was removed in Phase 10 — the same `t` schemas will eventually power both request validation and response type inference for Eden.
- **Sub-apps for route groups.** Each route group (tags, songs, player, etc.) becomes an Elysia plugin that registers on the main app. This keeps route files self-contained.
- **Auth via `.derive()`.** The cookie → JWT → user pipeline runs once per request in Elysia's `derive`, replacing `createContext()`.
- **Guards as `onBeforeHandle` hooks.** Auth, permission, and voice checks run in Elysia's `onBeforeHandle` lifecycle hook, short-circuiting with error responses before handlers execute. Guards are composed declaratively via `.use()` and scoped with `.guard()`. This replaces the old pattern of calling guard functions inline at the top of every handler body.
- **Static files and SPA fallback stay on the main app.** The `/*` catch-all serves `packages/web/dist/` with SPA fallback.
- **Security headers via `onAfterHandle` on `apiApp`.** An `onAfterHandle` hook on the `apiApp` sub-app injects `API_SECURITY_HEADERS` (CSP, X-Content-Type-Options, etc.) into all `/api/*` responses. This replaced the per-handler `elysiaJson()` helper from earlier phases. Since `apiApp` is scoped to API routes, static files on the root app are unaffected. Guard `onBeforeHandle` short-circuits return `Response.json()` directly — these bypass `onAfterHandle` header injection, matching the pre-7b behavior where inline guards returned bare `Response` objects.

## Completed

### Phase 1 — Elysia shell (replaces `Bun.serve()`)

**New files:**

- `packages/server/src/elysia-app.ts` — Elysia instance with auth derive, health check, WebSocket, static files + SPA fallback, legacy route adapter
- `packages/server/src/lib/elysia-adapter.ts` — `wrapLegacy()` bridges old `RouteContext` handlers into Elysia (with error logging to catch unhandled exceptions); `elysiaJson()` JSON helper for native Elysia routes (includes `API_SECURITY_HEADERS` — CSP, X-Content-Type-Options, etc.)
- `packages/server/src/lib/cookies.ts` — `parseCookies()` extracted from `index.ts`

**Modified files:**

- `packages/server/src/index.ts` — replaced `Bun.serve()` + route table + static serving + WebSocket (~270 lines) with `createApp().listen(PORT)`. Startup sequence (migrations, NodeLink, Discord bot) unchanged.
- `packages/server/package.json` — added `elysia` + `@elysia/eden`
- `packages/server/src/lib/jwt.ts` — eslint-disable block for `Bun.CryptoHasher` (pre-existing issue surfaced by changed import graph)

### Phase 2 — First native route group (`/api/tags`)

**New files:**

- `packages/server/src/routes/tags.elysia.ts` — 5 endpoints (GET list, GET single, GET songs, PATCH, DELETE) as Elysia-native handlers with Valibot body validation on PATCH
- `packages/server/src/lib/elysia-guards.ts` — `requireAuth`, `requireAdmin`, `requirePermission`, `requireAdminOrPermission` adapted for Elysia

**Modified files:**

- `packages/server/src/elysia-app.ts` — `/tags` removed from legacy routes, replaced with `tagsPlugin()`

### Phase 3 — Filter settings + general settings (13 route groups)

**New files:**

- `packages/server/src/routes/compressor.elysia.ts` — GET/PATCH with `CompressorSchema` body validation
- `packages/server/src/routes/equalizer.elysia.ts` — GET/PATCH with `EqualizerSchema` (15-band + enabled)
- `packages/server/src/routes/karaoke.elysia.ts` — GET/PATCH with `KaraokeSchema` body validation
- `packages/server/src/routes/lowPass.elysia.ts` — GET/PATCH with `LowPassSchema` body validation
- `packages/server/src/routes/distortion.elysia.ts` — GET/PATCH with `DistortionSchema` body validation
- `packages/server/src/routes/rotation.elysia.ts` — GET/PATCH with `RotationSchema` body validation
- `packages/server/src/routes/timescale.elysia.ts` — GET/PATCH with `TimescaleSchema` body validation + player update broadcast
- `packages/server/src/routes/tremolo.elysia.ts` — GET/PATCH with `TremoloSchema` body validation
- `packages/server/src/routes/vibrato.elysia.ts` — GET/PATCH with `VibratoSchema` body validation
- `packages/server/src/routes/channelMix.elysia.ts` — GET/PATCH with `ChannelMixSchema` body validation
- `packages/server/src/routes/filters.elysia.ts` — GET-only, returns all filter settings in one response
- `packages/server/src/routes/generalSettings.elysia.ts` — GET/PATCH with `GeneralSettingsPatchSchema` (partial), attaches `availableSources`

**Modified files:**

- `packages/server/src/elysia-app.ts` — all 13 route groups removed from `API_LEGACY_ROUTES` and wired as native plugins on `apiApp`

### Phase 4 — Remaining legacy route groups (6 migrated, auth deferred)

Six route groups migrated to native Elysia plugins. Auth (`/auth`) was deferred to Phase 4a — at the time it used `wrapLegacy` registered directly on the `authApp` sub-app.

**New files:**

- `packages/server/src/routes/setup.elysia.ts` — 6 endpoints (GET status, GET guilds, GET roles, GET channels, POST complete). Uses new `requireSetupMode` guard.
- `packages/server/src/routes/permissions.elysia.ts` — 3 endpoints (GET list, PATCH update, GET /me). Admin-guarded with Valibot body validation.
- `packages/server/src/routes/player.elysia.ts` — 17 endpoints (play, skip, seek, pause, loop, shuffle, queue management, quick-add, override). Uses `requireAdminOrPermission` + `requireUserInVoice` guards.
- `packages/server/src/routes/songs.elysia.ts` — 6 endpoints (GET list with search/sort/pagination, bulk-delete, bulk-tag, bulk-edit, DELETE, PATCH). Admin-guarded with granular permissions.
- `packages/server/src/routes/playlists.elysia.ts` — 10 endpoints (CRUD, visibility, add/remove songs, bulk-remove, reorder). Auth-guarded with Valibot body validation.
- `packages/server/src/routes/requests.elysia.ts` — 5 endpoints (preview, create, list, approve/deny, cancel). Auth-guarded with auto-approve for users with `requests.autoapprove` permission.

**New guards added to `elysia-guards.ts`:**

- `requireSetupMode(ctx)` — returns 401 if not authenticated, 403 if user lacks `isSetupAdmin` flag. Used by setup routes.
- `requireUserInVoice(ctx)` — returns 503 if Discord bot not ready, 409 if user not in a voice channel. Used by player routes.

**Modified files:**

- `packages/server/src/elysia-app.ts` — all 6 route groups removed from `API_LEGACY_ROUTES` and wired as native plugins on `apiApp`. `API_LEGACY_ROUTES` array and `registerLegacyRoutes()` function removed (no remaining legacy routes on `apiApp`).
- `packages/server/src/lib/elysia-guards.ts` — added `requireSetupMode` and `requireUserInVoice` guards.

### Phase 4a — Migrate `/auth` to native Elysia plugin

The `/auth` route group (login, callback, refresh, me, logout) has been migrated to a native Elysia plugin. All 5 endpoints are now Elysia-native handlers. The manual `Response` construction for cookie setting is preserved (it's well-tested and robust). The auth plugin uses `elysiaJson()` for JSON responses and reads cookies via the Elysia `deriveAuth` context.

**Note:** The auth plugin still uses the original `function authPlugin(app: Elysia): Elysia` mutation pattern because it registers on `authApp` (a separate Elysia instance with `/auth` prefix), not `apiApp`. It can be converted to the `const` + `.use()` pattern as a follow-up.

**Modified files:**

- `packages/server/src/elysia-app.ts` — Replaced `wrapLegacy(handleAuth)` with native `authPlugin(authApp)`. Removed unused `wrapLegacy` import.

**Deleted files** (cleanup phase):

- `packages/server/src/lib/context.ts` — `RouteContext` type only used by legacy infrastructure
- `packages/server/src/lib/routeTable.ts` — `routeTable()` only used by legacy route files
- `packages/server/src/lib/routeTable.test.ts` — tests for deleted `routeTable`
- `packages/server/src/lib/routeGuards.ts` — `checkGuards()` only used by legacy route files
- `packages/server/src/lib/guards.ts` — `requireAuth`, `requireAdmin` only used by legacy route files
- `packages/server/src/lib/json.ts` — replaced by `elysiaJson` from `lib/apiResponse.ts`
- `packages/server/src/lib/elysia-adapter.ts` — `wrapLegacy` removed; `elysiaJson` + `API_SECURITY_HEADERS` extracted to `lib/apiResponse.ts`
- `packages/server/src/routes/auth.ts` — Legacy auth handler, replaced by `auth.elysia.ts`
- All legacy `.ts` route files that have `.elysia.ts` equivalents (tags, songs, player, playlists, requests, setup, permissions, compressor, equalizer, karaoke, lowPass, distortion, rotation, timescale, tremolo, vibrato, channelMix, filters, generalSettings)

### Phase 5a — Convert all plugins to proper Elysia instances

All 19 route plugins on `apiApp` (excluding `authPlugin` on `authApp`) were converted from the old `function xPlugin(app: Elysia): Elysia` mutation pattern to proper `const xPlugin = new Elysia()` instances composed via `.use()`. The old pattern mutates a passed-in `Elysia` argument; the new pattern creates a standalone Elysia instance with its own prefix and registers it with `apiApp.use(xPlugin)`.

**Plugin pattern (before → after):**

```ts
// Before: mutation pattern
export function tagsPlugin(app: Elysia): Elysia {
  return app
    .get('/tags', handleGet as never)
    .get('/tags/:nameLower', handleGetSingle as never)
    .patch('/tags/:nameLower', handlePatch as never, { body: TagPatchSchema })
    .delete('/tags/:nameLower', handleDelete as never) as unknown as Elysia;
}
// Registration: tagsPlugin(apiApp as unknown as Elysia)

// After: standalone instance with prefix
export const tagsPlugin = new Elysia({ prefix: '/tags' })
  .get('/', handleGet as never)
  .get('/:nameLower', handleGetSingle as never)
  .patch('/:nameLower', handlePatch as never, { body: TagPatchSchema })
  .delete('/:nameLower', handleDelete as never) as unknown as Elysia;
// Registration: apiApp.use(tagsPlugin)
```

**Auth access pattern (before → after):**

```ts
// Before: ad-hoc casts scattered throughout each handler
const guardErr = requireAuth({
  user: ctx.user as never,
  isAdmin: ctx.isAdmin as boolean,
});

// After: single getAuth() helper per plugin, used at top of each handler
function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}
// In handler:
const { user, isAdmin } = getAuth(ctx);
const guardErr = requireAuth({ user, isAdmin });
```

**`elysia-app.ts` changes:**

- All `xPlugin(apiApp as unknown as Elysia)` calls replaced with `apiApp.use(xPlugin)` (18 of 19 plugins — `authPlugin` still uses the function pattern on `authApp`)
- Remaining `as unknown as Elysia` casts: only 4 at the top-level composition layer (`apiApp`, `authApp`, `authPlugin`, and `app` return)

**Files changed:**
All 19 `.elysia.ts` route files on `apiApp`: `tags`, `channelMix`, `compressor`, `distortion`, `equalizer`, `filters`, `generalSettings`, `karaoke`, `lowPass`, `permissions`, `player`, `playlists`, `requests`, `rotation`, `setup`, `songs`, `timescale`, `tremolo`, `vibrato`.

### Phase 5b — Eden treaty on the web client ✅

**New files:**

- `packages/web/src/api/eden.ts` — Eden Treaty client with custom `fetcher` that handles `credentials: 'include'`, 10-second timeout, auth token refresh on 401 with concurrent request queuing, rate limit header extraction, and redirect-to-login on hard failures. Exports `api` (the treaty client), `ApiError` class, and `trySilentRefresh()` for AuthContext's initial mount check.
- `packages/web/src/api/routes.ts` — all typed API functions (~500 lines) moved from `shared/api.ts`, rewritten to use Eden's proxy chain (`$.api.player.queue.get()`) for URL construction. Each function unwraps the `{ data, error }` response shape, throwing `ApiError` on error.

**Modified files:**

- `packages/web/src/api/api.ts` — unified barrel: runtime functions from `./routes`, `ApiError`/`trySilentRefresh` from `./eden`, types from `@alfira/server/shared/api`.
- `packages/server/src/shared/api.ts` — stripped to type-only exports (~120 lines of interfaces/types). All runtime functions removed.
- `packages/server/src/shared/index.ts` — `export * from './api'` → `export type * from './api'` (only types remain).
- `oxlint.config.ts` — added `routes.ts` overrides for tsgo workarounds (`no-explicit-any`, `no-unsafe-*`, `promise/prefer-await-to-then`). Updated `no-console`/`no-await-in-loop`/`no-unnecessary-condition` overrides from deleted `client.ts` → `eden.ts`.
- 6 component/context files — import paths updated from `@alfira/server/shared/api` → `../api/api`:
  - `pages/TagsPage.tsx`, `context/TagsContext.tsx`, `context/PlayerContext.tsx`
  - `pages/PlaylistDetailPage.tsx`, `components/SongEditPanel.tsx`, `components/BulkEditModal.tsx`
  - `pages/PlaylistsPage.tsx`
- `utils/api.ts` + `utils/api.test.ts` — `ApiError` import from `../api/client` → `../api/eden`
- `context/AuthContext.tsx` — `trySilentRefresh` import from `../api/client` → `../api/eden`

**Deleted files:**

- `packages/web/src/api/client.ts` (~285 lines) — hand-rolled fetch wrapper replaced by Eden's custom `fetcher`.

**Test results:** 306 pass, 0 fail. Both packages build cleanly.

**Net:** 771 lines deleted, 114 added (reduction of 657 lines).

### Phase 5c — Remove `as unknown as Elysia` from all plugin exports ✅

With oxlint v1.75.0 + tsgolint v7.0.2001, tsgo now resolves Elysia's generic types. `as unknown as Elysia` casts on plugin exports are no longer needed.

**Removed `as unknown as Elysia` from 20 plugin exports across all route files** (19 on `apiApp` + `authPlugin` on `authApp`).

**Removed `as unknown as Elysia` from `.use()` calls in `elysia-app.ts`** — `apiApp.use(plugin)` and `app.use(apiApp)` / `app.use(authApp)` work without casts.

**Still needed at this point** (all resolved in later phases):

- `as never` on handler registrations — resolved in Phase 5f when tsgo began resolving Elysia handler types.
- `Record<string, unknown>` + `getAuth()` pattern — resolved in Phase 7 (`.derive(deriveAuth)` on each plugin).
- `deriveAuth` cast in `elysia-app.ts` — resolved in Phase 5e.
- `return app as unknown as Elysia` — resolved in Phase 5e.

### Phase 5d — Auth plugin conversion ✅

Converted `authPlugin` from the function mutation pattern to a proper Elysia instance:

```ts
// Before
export function authPlugin(app: Elysia): Elysia { ... }
authPlugin(authApp as unknown as Elysia)

// After
export const authPlugin = new Elysia()
  .get('/login', handleLogin as never)
  ... as unknown as Elysia;
authApp.use(authPlugin);
```

**Modified files:**

- `packages/server/src/routes/auth.elysia.ts` — `function authPlugin(app: Elysia): Elysia` → `const authPlugin = new Elysia()`. Changed `import { type Elysia }` → `import { Elysia }` (needed for `new` expression).
- `packages/server/src/elysia-app.ts` — `authPlugin(authApp as unknown as Elysia)` → `authApp.use(authPlugin)`. Removed one eslint-disable comment and one tsgo cast.

### Phase 5e — Remove `return app as unknown as Elysia` cast ✅

Removed the last `as unknown as Elysia` cast in the codebase. The explicit `Elysia` return type annotation on `createApp()` was also removed — tsgo infers the return type from the chained Elysia instance, making the cast unnecessary. This was independent of Elysia's derive propagation issue.

```ts
// Before
export function createApp(): Elysia {
  // ...
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return app as unknown as Elysia;
}

// After
export function createApp() {
  // ...
  return app;
}
```

**Modified files:**

- `packages/server/src/elysia-app.ts` — removed explicit `Elysia` return type and `as unknown as Elysia` cast.

**Note:** `index.ts` uses `ReturnType<typeof createApp>` which now resolves to the inferred type instead of `Elysia`. This is fine — the type is only used for the `server` variable declaration.

### Phase 5f — Remove `as never` cast workarounds ✅

With oxlint v1.75.0 + tsgolint v7.0.2001, tsgo now resolves Elysia handler types correctly — the `as never` workaround is no longer needed. Removed all 82 `as never` casts from 20 route files. Handlers use `Record<string, unknown>` + `getAuth()` pattern (later replaced by `.derive(deriveAuth)` in Phase 7).

**Remaining casts in routes:** Only the one `user as never` in `player.elysia.ts` was replaced with `user ?? undefined` to match `UserContext | undefined`.

**Modified files:** All 20 `.elysia.ts` route files.

### Phase 10 — Replace Valibot with Elysia `t` ✅

Replaced Valibot with Elysia's built-in TypeBox-based `t` validation system across all 20 route files. Elysia `t` provides the same runtime validation capabilities (Object, String, Number, Boolean, Array, Optional, Nullable, Union, Literal, Partial, Integer, Unknown) and automatically infers TypeScript types from schemas via `typeof Schema.static` (replacing `v.InferOutput<typeof Schema>`).

**Valibot → Elysia `t` mapping:**

| Valibot                                                         | Elysia `t`                                            |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `v.object({...})`                                               | `t.Object({...})`                                     |
| `v.partial(v.object({...}))`                                    | `t.Partial(t.Object({...}))`                          |
| `v.string()`                                                    | `t.String()`                                          |
| `v.number()`                                                    | `t.Number()`                                          |
| `v.boolean()`                                                   | `t.Boolean()`                                         |
| `v.unknown()`                                                   | `t.Unknown()`                                         |
| `v.nullable(v.string())`                                        | `t.Nullable(t.String())`                              |
| `v.optional(v.string())`                                        | `t.Optional(t.String())`                              |
| `v.array(v.string())`                                           | `t.Array(t.String())`                                 |
| `v.pipe(v.string(), v.minLength(n))`                            | `t.String({ minLength: n })`                          |
| `v.pipe(v.number(), v.minValue(a), v.maxValue(b))`              | `t.Number({ minimum: a, maximum: b })`                |
| `v.pipe(v.number(), v.integer(), v.minValue(a), v.maxValue(b))` | `t.Integer({ minimum: a, maximum: b })`               |
| `v.pipe(v.array(v.string()), v.minLength(a), v.maxLength(b))`   | `t.Array(t.String(), { minLength: a, maxLength: b })` |
| `v.literal('x')`                                                | `t.Literal('x')`                                      |
| `v.union([...])`                                                | `t.Union([...])`                                      |
| `v.picklist(['a', 'b'])`                                        | `t.Union([t.Literal('a'), t.Literal('b')])`           |
| `v.InferOutput<typeof S>`                                       | `typeof S.static`                                     |

**Additional changes bundled with Phase 10:**

- **`onAfterHandle` for security headers.** Added an `onAfterHandle` hook on `apiApp` in `elysia-app.ts` that injects `API_SECURITY_HEADERS` into all `/api/*` responses. This replaces the per-handler `elysiaJson()` helper — handlers now return plain objects, and Elysia serializes them to JSON with the security headers applied automatically.
- **Plain object returns.** All handlers changed from `return json(data)` / `return json(data, status)` to `return data` (with `set.status` for non-200). Error responses use `return Response.json({ error: ... }, { status: NNN })` where the handler needs to bypass the normal flow.
- **Discord API response parsing in auth.** The auth plugin used `v.parse()` for runtime validation of Discord API responses. These were replaced with `as typeof Schema.static` type assertions, consistent with how the rest of the codebase handles external API data.

**Dependencies removed:**

- `valibot` ^1.4.2 (used in all 19 route files for body/query validation)
- `drizzle-valibot` ^0.4.2 (listed in package.json but not actually used — the DB schema uses plain drizzle-orm)

**Files changed:** All 20 `.elysia.ts` route files + `elysia-app.ts` + `package.json`.

### Phase 9 — Custom Drizzle timestamp type (DB → wire type alignment) ✅

Added a custom Drizzle `isoTimestamp` column type that stores timestamps as SQLite INTEGER (Unix ms) but returns ISO 8601 strings. This eliminates the pervasive `Date → string` conversion that previously required formatting helpers and `instanceof Date` branching in every handler that touched a `createdAt` column.

**Why this matters for the Elysia migration:** With `mode: 'timestamp_ms'`, Drizzle's `$inferSelect` produced `Date` objects — incompatible with JSON serialization and Elysia response schemas (which expect `t.String()`). The custom type fixes this at the schema layer: Drizzle now returns ISO strings directly, handler return types match response schema types, and no runtime conversion is needed.

```ts
// schema.ts — one definition, used by all timestamp columns
const isoTimestamp = customType<{
  data: string; // TypeScript type (both insert and select)
  driverData: number; // SQLite stores integers
}>({
  dataType() {
    return 'integer';
  },
  fromDriver(value: number): string {
    return new Date(value).toISOString();
  },
  toDriver(value: string): number {
    return new Date(value).getTime();
  },
});

// Applied to 8 columns across 5 tables:
//   song.createdAt, playlist.createdAt, tag.createdAt,
//   refreshToken.expiresAt, refreshToken.createdAt,
//   songRequest.createdAt, songRequest.closedAt
```

**Cleanup enabled by this change:**

- `formatSong()` simplified — `instanceof Date` check and `.toISOString()` call removed
- `SerializedSong` and `SerializedPlaylist` types collapsed to `Song` / `Playlist` (no more `Date | string` unions)
- 18 `.toISOString()` calls removed across 6 files
- 8 dead `if (playlist instanceof Response) return playlist` blocks removed from `playlists.elysia.ts` (leftover from Phase 8 — `requirePlaylist` throws `ApiError`, these checks were unreachable)
- 3 unused `existing` variables removed after dead `Response` checks
- `auth.elysia.ts`: 4 `new Date()` insert/comparison values changed to `new Date().toISOString()` (the custom type expects string for inserts; ISO string comparison replaces Date comparison)
- `requests.elysia.ts`: 3 `new Date()` insert values changed to `.toISOString()`
- `playlistAccess.ts`: `PlaylistRow.createdAt` type changed from `Date` to `string`

**On-disk format unchanged.** SQLite still stores integer timestamps — `toDriver` / `fromDriver` handle conversion transparently. No migration needed.

**Stats:** 11 files changed, net -26 lines.

### Phase 7 — Replace `Record<string, unknown>` + `getAuth()` with shared derive function ✅

Every Elysia route plugin now calls `.derive(deriveAuth)` directly on its own instance. This gives handlers properly typed `{ user, isAdmin, cookies }` context instead of `Record<string, unknown>`, eliminating the `getAuth()` pattern (148 occurrences removed).

**New files:**

- `packages/server/src/lib/authDerive.ts` — shared `deriveAuth` function exported for use by all route plugins. The parameter is typed `any` because Elysia's internal derive generic does not accept explicitly-typed destructuring (tsgo reports TS2345). Removing the explicit return type lets tsgo infer derived property types via Elysia's own inference. The `no-unsafe-*` rules for this file are suppressed in `oxlint.config.ts`.

**Plugin pattern (before → after):**

```ts
// Before: Record<string, unknown> + getAuth() cast
function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}
export const tagsPlugin = new Elysia({ prefix: '/tags' }).get(
  '/',
  (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) return authErr;
    return Response.json({ tags: fetchTagList() });
  }
);

// After: .derive(deriveAuth) + typed destructuring
export const tagsPlugin = new Elysia({ prefix: '/tags' })
  .derive(deriveAuth)
  .get('/', ({ user, isAdmin }) => {
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) return authErr;
    return Response.json({ tags: fetchTagList() });
  });
```

**Handler context access patterns:**

- **Auth-only handlers** — destructure `({ user, isAdmin })`
- **Handlers needing body/params/query** — destructure `({ user, isAdmin, ...ctx })` to preserve `ctx.body`, `ctx.params`, etc.
- **Auth plugin handlers** — destructure specific properties (`{ request }`, `{ cookies }`, `{ user }`) as needed

**Key design decisions:**

- **Per-plugin derive (option 3 from the plan).** `.derive()` is called directly on each plugin's Elysia instance, not wrapped in `.use()`. This is necessary because Elysia's derive types do not propagate through `.use()` boundaries — TypeScript resolves plugin handler types at definition time, before the plugin is composed into a parent.
- **`.use(authDerive)` was tried and rejected.** Wrapping deriveAuth in a shared Elysia plugin instance and composing via `.use()` does not propagate derive types to handlers (same `.use()` boundary issue).
- **Guard functions unchanged.** Guards (`requireAuth`, `requireAdmin`, etc.) still take `AuthContext` and return `Response | null`. They're called manually in handler bodies. Moving them to `beforeHandle` hooks is deferred to Phase 7b.
- **`...ctx` rest spread for body/params access.** Handlers that need `ctx.body`, `ctx.params`, or `ctx.query` use `({ user, isAdmin, ...ctx })` so the remaining context properties are accessible. Handlers that only need auth use simple `({ user, isAdmin })`.

**oxlint changes:**

- Added override for `packages/server/src/routes/*.elysia.ts` — suppresses `no-unsafe-type-assertion` and `no-unnecessary-type-assertion` (route handlers use `as` casts for Drizzle query results, Discord API responses, and context narrowing).
- Added `requests.elysia.ts` and `songs.elysia.ts` to existing `no-unnecessary-condition` override (defensive optional chains on Drizzle query results).
- Added `authDerive.ts` override for `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-argument` (all from the `any` parameter).

**Stats:** 148 → 0 `Record<string, unknown>` handler signatures. 11 remaining occurrences are legitimate data types (object builders like `const data: Record<string, unknown> = {}`, function parameters for generic DB helpers, and `ctx.body as Record<string, unknown>` for routes without body schemas).

**Modified files:** All 20 `.elysia.ts` route files, `elysia-app.ts`, `oxlint.config.ts`.

### Phase 7b — Move guards from inline calls to `beforeHandle` hooks ✅

All guard functions converted from inline handler calls to Elysia `onBeforeHandle` hooks. Guards now short-circuit before handlers execute, so handlers no longer return `Response` for auth/permission/voice errors. This unblocks Phase 6b (response schemas).

**Guard pattern (before → after):**

```ts
// Before: guards called inline in every handler, returning Response | null
.get('/', ({ user, isAdmin }) => {
  const authErr = requireAuth({ user, isAdmin });
  if (authErr) return authErr;
  return Response.json({ data });
})
.patch('/', ({ user, isAdmin, body }) => {
  const guardErr = requireAdminOrPermission({ user, isAdmin }, 'audio.manage');
  if (guardErr) return guardErr;
  return body;
})

// After: guards composed declaratively, handlers return only data
.use(authGuard)
.get('/', () => ({ data }))
.guard({}, (app) =>
  app
    .use(createAdminOrPermissionGuard('audio.manage'))
    .patch('/', ({ body }) => body, { body: Schema })
)
```

**New guard exports (in `elysia-guards.ts`):**

| Export                             | Type             | Description                                                 |
| ---------------------------------- | ---------------- | ----------------------------------------------------------- |
| `authGuard`                        | Elysia plugin    | Short-circuits with 401 if not authenticated                |
| `adminGuard`                       | Elysia plugin    | Short-circuits with 403 if not super-admin                  |
| `createPermissionGuard(p)`         | Factory → Elysia | 403 if user lacks granular permission; super-admins bypass  |
| `createAdminOrPermissionGuard(p?)` | Factory → Elysia | Combines auth + admin + optional granular permission        |
| `voiceGuard`                       | Elysia plugin    | 503 if bot not ready, 409 if user not in voice channel      |
| `setupModeGuard`                   | Elysia plugin    | 401/403 for setup-mode-only endpoints, composes `authGuard` |

**Route-level guard composition patterns:**

- **Simple uniform guard** (filter routes, playlists, generalSettings): `.use(authGuard)` or `.use(createAdminOrPermissionGuard('audio.manage'))` at the plugin level — applies to all routes.
- **Mixed auth levels** (tags, permissions, setup): use `.use(authGuard)` at the plugin level, then `.use(adminGuard)` or `.use(createAdminOrPermissionGuard(...))` scoped after public routes.
- **Multiple permission scopes** (player, songs): use `.guard({}, (app) => app.use(createPermissionGuard('x')).route(...))` closures — each closure gets its own permission check. The player plugin uses 5 `.guard()` blocks (3× `queue.manage`, 1× `queue.override`, 1× `queue.quickadd`).
- **Routes without guards** (auth, setup GET): no `.use()` needed — `deriveAuth` still runs but no guard short-circuits.

**Handler cleanup:**

- Removed ~100 inline `requireAuth()` / `requireAdminOrPermission()` / `guardVoice()` call blocks across all 20 route files.
- Removed `{ user, isAdmin }` destructuring from handlers that only used them for guards (keep them where `user` / `isAdmin` is used for business logic).
- `guardVoice()` wrapper in `player.elysia.ts` deleted — voice checks now run via `.use(voiceGuard)`.
- `AuthContext` interface retained in `elysia-guards.ts` — still used by route-internal helpers like `userCanAutoApprove()` in requests and `resolveUrlTempSong()` in player.

**oxlint changes:**

- Added override for `elysia-guards.ts`: `no-unsafe-type-assertion`, `no-unnecessary-type-assertion`, `consistent-return` — all from the `as unknown as` context casts and Elysia's `onBeforeHandle` short-circuit pattern.

**Stats:** ~100 inline guard blocks removed. 20 route files updated. ~150 lines of guard composition added across routes.

**Lessons learned:**

1. **`.guard()` closures are the only way to scope hooks.** Elysia's `.use()` adds hooks permanently to all subsequent routes in the chain — there's no "remove hook" primitive. Different permissions on different routes within the same plugin require `.guard({}, (app) => ...)` closures. This creates indentation nesting, but extracting route groups into standalone `new Elysia()` instances composes cleanly without nesting (the `.use()` boundary issue doesn't affect hooks — only TS derive types).

2. **TS doesn't narrow types after `onBeforeHandle` short-circuits.** Even though `onBeforeHandle` guarantees `user` is non-null at runtime (it short-circuits with 401 before the handler runs), TypeScript still sees `user: UserContext | null` in the handler. Handlers that access `user.properties` for business logic still need `(user as { ... }).property` casts. A future pass could add a lazy `.resolve()` to provide `currentUser: UserContext` (non-null) — the resolve would only execute when the handler actually accesses it, safely after the guard has run.

3. **`Response.json()` in `onBeforeHandle` bypasses `onAfterHandle` security headers.** This matches the pre-7b behavior where inline guards returned bare `Response` objects with only `Content-Type` set. Error responses from guards don't need CSP/X-Content-Type-Options headers.

4. **`deriveAuth` per-plugin is still needed.** The guard plugins do NOT call `.derive(deriveAuth)` — they rely on the route plugin's derive to populate `{ user, isAdmin }` in the context. This works because Elysia merges context across `.use()` boundaries at runtime (only the TS types don't propagate). Guards access `user` and `isAdmin` via `ctx as unknown as { user, isAdmin }` casts.

### Phase 8 — `ApiError` + `onError` hook replaces `Response`-returning helpers ✅

All helper functions that returned `Response` objects on error (`requirePlayer()`, `requirePlaying()`, `resolveOrAutoJoinPlayer()`, `requirePlaylist()`, `validateSourceUrl()`, `validatePlaylistUrl()`, `fetchSourceMetadata()`, `fetchPlaylistMetadata()`, `validateNickname()`, `validateArtworkUrl()`, `validateTags()`, `validateVolumeBoost()`, `validateAndBuildSongFields()`, `validatePlaylistName()`) were refactored to throw `ApiError` instead. This eliminates `Response | data` unions from handler return types, unblocking response schemas (Phase 6b).

**New files:**

- `packages/server/src/lib/errors.ts` — `ApiError` class with `status` (number) and `message` (string).

**Modified files:**

- `packages/server/src/elysia-app.ts` — added `onError` hook on `apiApp` that catches `ApiError` and returns `{ error: message }` with the correct status. Non-`ApiError` errors are logged and returned as 500.
- `packages/server/src/lib/player.ts` — `requirePlayer()` and `requirePlaying()` throw `ApiError` instead of returning `{ ok: false, response: Response }`.
- `packages/server/src/lib/voice.ts` — `requireUserInVoice()` (dead code, replaced by `voiceGuard`) and `resolveOrAutoJoinPlayer()` throw `ApiError` instead of returning `Response` objects.
- `packages/server/src/lib/playlistAccess.ts` — `requirePlaylist()` throws `ApiError` instead of returning `PlaylistRow | Response`.
- `packages/server/src/lib/validation.ts` — all validation helpers (`validateSourceUrl`, `validatePlaylistUrl`, `validatePlaylistName`, `validateNickname`, `validateArtworkUrl`, `validateTags`, `validateVolumeBoost`, `fetchSourceMetadata`, `fetchPlaylistMetadata`) throw `ApiError` instead of returning `ValidationResult<T>` unions. `validateOptionalString`, `clampMaxVideos`, and `youTubeUrl` are unchanged (they never errored).
- `packages/server/src/lib/songFieldValidation.ts` — `validateAndBuildSongFields()` throws `ApiError` (via the validators it calls) instead of returning `SongFieldOutput | Response`.
- `packages/server/src/lib/validation.test.ts` — updated to use `expect(() => ...).toThrow()` instead of checking `.ok` / `.response` / `.value`.
- All 6 remaining route files — all `Response.json()` success returns converted to plain `return { ... }`. All error paths converted from `return Response.json({ error }, { status })` to `throw new ApiError(status, msg)`. DELETE endpoints returning 204 keep `return new Response(null, { status: 204 })` (no body, no schema needed).

**Helper pattern (before → after):**

```ts
// Before: return { ok, value } | { ok: false, response }
export function requirePlayer():
  { ok: true; player: GuildPlayer } | { ok: false; response: Response } {
  const player = getPlayer(getGuildId());
  if (!player) {
    return {
      ok: false,
      response: json({ error: 'The bot is not connected.' }, 409),
    };
  }
  return { ok: true, player };
}

// After: return value or throw
export function requirePlayer(): GuildPlayer {
  const player = getPlayer(getGuildId());
  if (!player) {
    throw new ApiError(409, 'The bot is not connected.');
  }
  return player;
}
```

**Handler call-site pattern (before → after):**

```ts
// Before: check .ok, return .response on error
const playerResult = requirePlayer();
if (!playerResult.ok) return playerResult.response;
playerResult.player.clearQueue();
return Response.json({ message: 'Queue cleared.' });

// After: direct call, plain return
const player = requirePlayer();
player.clearQueue();
return { message: 'Queue cleared.' };
```

**Design decisions:**

- **`onError` hook catches `ApiError` only.** Non-`ApiError` errors are logged and returned as 500 Internal Server Error. This prevents accidental information leakage from unexpected exceptions.
- **Error responses from `onError` bypass `onAfterHandle` security headers.** This matches the pre-existing behavior where `onBeforeHandle` guard short-circuits and inline error returns also skipped header injection. Error responses don't need CSP/X-Content-Type-Options headers.
- **`elysiaJson` removed from helper files.** Helpers previously called `json(data, status)` to construct `Response` objects with security headers. Since `onError` returns plain objects (not `Response`), helpers no longer need the JSON utility.
- **DELETE 204 responses kept as `new Response(null, { status: 204 })`.** These have no body and don't interact with response schemas. They are the only remaining `Response` returns in route handlers.

**Stats:** 10+ helpers refactored. 6 route files updated. ~350 lines net reduction across the codebase.

### Phase 6b — Add response schemas to get full Eden type safety ✅

Eden's proxy path resolution works, but response bodies were typed as `Response` because most server routes didn't have explicit `response` schemas. Response schemas have been added to all endpoints that Elysia 1.4.29 supports.

**Routes that were skipped in the initial pass:**

- **`setup.elysia.ts`** — 6 endpoints (all): GET `/`, GET `/status`, GET `/guilds`, GET `/roles`, GET `/channels`, POST `/complete`
- **`tags.elysia.ts`** — 3 endpoints: GET `/` (existing), GET `/:nameLower`, GET `/:nameLower/songs`. PATCH `/:nameLower` skipped (path params + body)
- **`songs.elysia.ts`** — 4 endpoints: GET `/` (`t.Unknown()` due to complex Song type), POST `/bulk-delete`, POST `/bulk-tag`, POST `/bulk-edit`. PATCH `/:id` skipped (path params + body)
- **`playlists.elysia.ts`** — 3 endpoints: GET `/` (paginated, `t.Unknown()`), POST `/` (create), GET `/:id` (`t.Unknown()`). Mutations with path params skipped
- **`player.elysia.ts`** — 1 endpoint: GET `/queue` (`t.Unknown()`). Mutations skipped
- **`requests.elysia.ts`** — 2 endpoints: POST `/preview` (`t.Unknown()`), GET `/` (paginated). POST `/` and PATCH `/:id` skipped
- **`auth`** — skipped entirely (raw Response objects, redirects, cookie headers)

**Schema design:** Precise schemas (e.g., `TagItem`, `SetupStatus`) are used where available. Some endpoints with complex nested types used `t.Unknown()` as a conservative first pass — these still enable Eden's `{ data, error }` discriminator but don't enforce exact response shapes at the type level. Most of these `t.Unknown()` placeholders were later replaced with precise schemas in Phase 6c and follow-up work.

**The `NoInfer<>` mechanism:** When a route has a `response` schema, Elysia wraps both the schema type and the context (decorator/derive) type in TypeScript's `NoInfer<>`. This is intentional and universal — applied regardless of whether the route has a body schema, params, macros, or `.derive()`. `NoInfer<>` prevents TypeScript from matching the handler's _inferred_ return type against the schema. When the handler constructs its return value through branching logic or helper methods, inference can produce a slightly different structural shape than the schema, and the reconciliation fails with TS2345. Handlers that return values directly from Drizzle's `.returning()` or from flat, single-path code tend to work because inference happens to match the schema exactly.

**The fix:** Add explicit `(): typeof Schema.static` return type annotations to handlers with complex return logic. This gives TypeScript the schema type directly, bypassing the inference-reconciliation step entirely. Any remaining errors are plain structural mismatches between the TypeScript interface and the Elysia schema — fixable by aligning them. See "Remaining work" for the list of routes needing this treatment.

**Prerequisites:** Phase 7b ✅ (guards in `onBeforeHandle`), Phase 8 ✅ (handlers return plain data, no `Response | data` unions), Phase 9 ✅ (DB types match wire types).

### Phase 6c — Expand response schemas to mutation endpoints ✅

Extended response schemas from the original 28 read-heavy endpoints to cover mutation endpoints across `player`, `playlists`, `requests`, and `permissions`. Added 12 new shared schemas to `responseSchemas.ts` (`MessageResponse`, `SuccessResponse`, `PauseToggleResponse`, `LoopModeResponse`, `SongRequest`, `CreateRequestResult`, `BulkRemoveSongsResponse`, `BulkEditResponse`, `BulkTagResponse`, `BulkDeleteResponse`, `PermissionUpdateResponse`, `MyPermissionsResponse`).

**Schemas added per route group:**

- **`player.elysia.ts`** — 11 endpoints: POST `/pause-toggle`, POST `/skip`, POST `/shuffle`, POST `/unshuffle`, POST `/clear`, POST `/leave`, POST `/loop`, PATCH `/queue/reorder`, POST/`/queue/:songId/promote`, POST `/queue/:songId/demote`, DELETE `/queue/:songId`. Routes with both body and response schemas (POST `/play`, `/override`, `/quick-add`, `/quick-add-playlist`, `/add-to-priority`, `/seek`) kept `t.Unknown()` as a conservative first pass — precise schemas (`MessageResponse`, `SongAddedResponse`, `PlaylistQueuedResponse`, `QueueState`) exist in `responseSchemas.ts` and just need explicit `typeof Schema.static` return type annotations on their handlers (see Phase 6b for the `NoInfer<>` fix).
- **`playlists.elysia.ts`** — 6 endpoints: POST `/` (create → `Playlist`), POST `/:id/songs` (→ `t.Unknown()`, follow-up: `PlaylistSongEntry`), POST `/:id/songs/bulk-remove` (→ `BulkRemoveSongsResponse`), PATCH `/:id/visibility` (→ `Playlist`), PATCH `/:id` (rename/tag → `Playlist`), PATCH `/:id/reorder` (→ `MessageResponse`). GET `/` schema upgraded from `t.Array(t.Unknown())` to `t.Array(Playlist)`. GET `/:id` kept `t.Unknown()` (follow-up: `PlaylistDetail`).
- **`requests.elysia.ts`** — 2 endpoints: POST `/` (create) and PATCH `/:id` (approve/deny) got `t.Unknown()` response schemas. POST `/` can use `CreateRequestResult` (already defined). PATCH `/:id` returns genuinely different shapes based on action (approve track, approve playlist, deny) — this is the only route where `t.Unknown()` (or a union type) is justified.
- **`permissions.elysia.ts`** — 1 endpoint: GET `/me` (→ `MyPermissionsResponse`).

**Bug fix:** `player.togglePause()` returns `Promise<boolean>` but the handler wasn't awaiting it — `isPaused` was `Promise<boolean>` instead of `boolean`. Adding the response schema surfaced this type-level bug; fixed by adding `await`.

### Phase 11 — Remove `as any` from Eden client ✅

With oxlint 1.75 / tsgolint 7.0.2001, tsgo (TypeScript 7) fully resolves Elysia's proxy chain types. The claim that "tsgo cannot resolve Eden's deeply-nested proxy types" was stale — it was true in earlier oxlint versions but is no longer the case. The `as any` workaround on `$ = api` was masking 15 real type mismatches, not a tsgo limitation.

**Changes in `routes.ts`:**

- **Removed `const $ = api as any`** → `const $ = api`. Eden proxy types resolve correctly at all nesting levels.
- **Removed 3 `@ts-expect-error` comments** that claimed tsgo couldn't resolve property access on Eden responses. The types now resolve correctly.
- **Changed `unwrap<T>()`** → `unwrap(any)`. Elysia's `TreatyResponse` is a discriminated union per status code (e.g. `{ data: Shape200; error: null } | { data: null; error: { status: 404; value: Shape404 } }`), which is not assignable to a single generic `T` parameter. The call site's explicit return type annotation (e.g. `Promise<QueueState>`) provides the actual type safety.
- **3 targeted `as any` casts** on function arguments for routes where client–server type alignment has minor mismatches (tag patch color union, playlist tag update null-vs-undefined, setup complete payload shape). These are local to specific arguments, not on the entire Eden client. Once the remaining `t.Unknown()` response schemas are converted to precise schemas, some of these may resolve naturally.

**Key insight:** The `as any` was never masking a tooling limitation. It was masking real type gaps: missing server-side response schemas, `null` vs `undefined` mismatches, and body/response schema interaction. Most were addressed individually rather than papered over with a single escape hatch.

## Remaining work

### Replace remaining `t.Unknown()` response schemas with precise types ✅

All 12 `t.Unknown()` response schemas replaced with precise types from `responseSchemas.ts`. The `NoInfer<>` mechanism (Elysia wraps both schema and context types in `NoInfer<>` when a `response` schema is present) required explicit return type annotations on 6 handlers that build return values through helper functions or branching logic. Structural mismatches between Drizzle-inferred types and Elysia schema types (extra optional fields like `isSeekable` on `QueuedSong`, `compressorSettings` on `QueueState`) were resolved with `as` casts at return sites.

**PATCH /requests/:id** kept `t.Unknown()` — it returns 3 genuinely different shapes (track approve, playlist approve, deny).

**Handler annotation + cast patterns used:**

```ts
// Sync handler with two branches: annotation + cast on each return
(): typeof QueueState.static => {
  if (!player) return { ... } as typeof QueueState.static;
  return player.getQueueState() as typeof QueueState.static;
}

// Async handler: annotation + cast on return
async ({ ...ctx }): Promise<typeof SongAddedResponse.static> => {
  return { message: '...', song: queuedSong } as typeof SongAddedResponse.static;
}
```

### Tighten body schemas ✅

- **`songs.elysia.ts`:** `SongPatchSchema` — 6 `t.Unknown()` replaced with `t.Nullable(t.String())`, `t.Array(t.String())`, and `t.Nullable(t.Integer({ minimum: -100, maximum: 200 }))`.
- **`requests.elysia.ts`:** `CreateRequestSchema` — 8 `t.Unknown()` replaced with `t.String()`, `t.Boolean()`, `t.Nullable(t.String())`, `t.Array(t.String())`, and `t.Nullable(t.Integer({ minimum: -100, maximum: 200 }))`.

### Reduce `as` casts in handlers (partial)

- **`ctx.request as Request`** — eliminated from 3 handlers by destructuring `request` directly from Elysia context (`async ({ user, request })`). Elysia types `request` natively as `Request`.
- **`ctx.user as { ... }`** — cannot be eliminated. These are a fundamental TS limitation: `.derive(deriveAuth)` provides `user: UserContext | null`, and `onBeforeHandle` guards guarantee non-null at runtime, but TypeScript cannot narrow across lifecycle hooks. A future `.resolve()` to provide `currentUser: UserContext` (non-null) could eliminate these.
- **`ctx.body as typeof Schema.static`** — cannot be eliminated without also fixing the user narrowing (handlers use `...ctx` rest spread to access body alongside user, losing the typed destructure).

### Web client

`routes.ts` (~570 lines) and `shared/api.ts` (~163 lines) contain typed wrapper functions around the Eden Treaty client. Components could theoretically consume Eden directly, but the centralized wrappers provide genuine value: typed named functions, centralized `{ data, error }` unwrapping, and localized workarounds for the few remaining type mismatches. Direct Eden consumption would spread the unwrapping pattern to ~22 component files. This is a code organization decision, not a technical blocker.
