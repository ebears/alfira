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
- **Auth via `.derive()`.** The cookie → JWT → user pipeline runs once per request in Elysia's `derive`, replacing `createContext()`. Guards (`requireAuth`, `requireAdminOrPermission`) are called explicitly in handlers — a future pass could move them into Elysia guard plugins.
- **Static files and SPA fallback stay on the main app.** The `/*` catch-all serves `packages/web/dist/` with SPA fallback.
- **Security headers via `onAfterHandle` on `apiApp`.** An `onAfterHandle` hook on the `apiApp` sub-app injects `API_SECURITY_HEADERS` (CSP, X-Content-Type-Options, etc.) into all `/api/*` responses. This replaced the per-handler `elysiaJson()` helper from earlier phases. Since `apiApp` is scoped to API routes, static files on the root app are unaffected. Guard functions return pre-constructed `Response` objects as early returns — these bypass `onAfterHandle` header injection, but the guards include their own `Content-Type: application/json` header.

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
const guardErr = requireAuth({ user: ctx.user as never, isAdmin: ctx.isAdmin as boolean });

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

**Still needed:**

- `as never` on handler registrations — Elysia's own type definitions don't propagate `.derive()` through `.use()` at the type level (not a tsgo issue). This is a fundamental Elysia type limitation.
- `Record<string, unknown>` + `getAuth()` pattern — same reason.
- `deriveAuth` cast in `elysia-app.ts` — Elysia's `Cookie<unknown>` type doesn't match the project's `{ value?: string }` cookie format.
- `return app as unknown as Elysia` — the function's explicit `Elysia` return type annotation can't match the deeply-nested inferred type of the chained instance.

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

With oxlint v1.75.0 + tsgolint v7.0.2001, tsgo now resolves Elysia handler types correctly — the `as never` workaround is no longer needed. Removed all 82 `as never` casts from 20 route files. Handlers use `Record<string, unknown>` + `getAuth()` pattern (still needed — see below) without the `as never` cast on the handler registration.

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

## Remaining work

### Phase 6b — Add response schemas to get full Eden type safety

Eden's proxy path resolution works, but response bodies are still typed as `Response` because the server routes don't have explicit `response` schemas. `routes.ts` still needs `$ = api as any` until response schemas are added.

**What's needed:** Add `response` schemas to each route handler using Elysia `t`. For example:

```ts
.get('/tags', (ctx) => { ... }, {
  response: {
    200: t.Object({ tags: t.Array(TagItemSchema) }),
    401: t.Object({ error: t.String() }),
  },
})
```

**Blocked by Phase 7.** Response schemas cause `TS2345` type errors because handlers are typed as `Record<string, unknown>` (the return type includes `Response` from guard early-returns, which conflicts with Elysia's expectation that the handler returns only the schema type). Once Phase 7 resolves the handler type issue, response schemas can be added mechanically.

After response schemas: `routes.ts` and `shared/api.ts` can be deleted — components would consume Eden directly with full type inference.

### Phase 7 — Remove `Record<string, unknown>` + `getAuth()` pattern

**Not a bug — a TypeScript fundamental.** TypeScript resolves handler types at definition time. When we write `new Elysia({ prefix: '/tags' }).get('/', (ctx) => ...)`, the type of `ctx` is resolved against the bare Elysia instance — which has no knowledge of the parent app's `.derive()`. TypeScript cannot retroactively update these types when the plugin is later `.use()`d into a derived parent.

This is also the root cause of Phase 6b being blocked — handlers returning `Response` from guards mixed with plain data returns create a union type that doesn't satisfy Elysia's response schema contracts.

**Verified options that would work** (but change the architecture):

1. **Guard-based auth** — use Elysia's `.guard()` with `beforeHandle` instead of `.derive()`. Auth would run as a guard at the parent level before any sub-app handler. Guards would return error responses that short-circuit, and the handler types would be clean (no `Response` in the return type). This is the most promising approach — it would resolve both Phase 7 AND unblock Phase 6b.
2. **Function-based plugins** — instead of `const plugin = new Elysia()`, define plugins as functions that receive the parent: `function plugin(app: Elysia) { return app.group(...) }`. Handlers would see the parent's derive, but we'd lose the clean `.use()` composition.
3. **Per-plugin derive** — have each plugin call `.derive()` itself to extract user/auth from cookies. Redundant but type-safe.

**Current approach:** The `Record<string, unknown>` + `getAuth()` pattern is the pragmatic choice. It keeps plugins as standalone `new Elysia()` instances and preserves clean `.use()` composition. Option 1 (guard-based auth) is the recommended next step — it's the only approach that solves both problems at once.

## Known issues

- **Eden response types untyped** — Server routes lack `response` schemas, so Eden sees all responses as `Response`. `routes.ts` uses `$ = api as any` as a workaround. Blocked by Phase 7 (guard-based auth would let handlers return clean types).
- **`Record<string, unknown>` + `getAuth()` pattern** — Not a bug. TypeScript resolves plugin handler types at definition time, before the plugin is `.use()`d into a parent with `.derive()`. Guard-based auth (Phase 7 option 1) would eliminate this.
- **tsgo + drizzle + `Record<string, unknown>` incompatibility** — When a handler parameter is `Record<string, unknown>`, tsgo fails to resolve `.where()` overloads on drizzle query builders. Workaround: extract queries into helper functions with clean parameter types. A future tsgo update may fix this.
- **Bun namespace errors** — Installing Elysia changes the TypeScript import graph in a way that surfaces pre-existing `Bun.spawn` / `Bun.CryptoHasher` type errors in `index.ts` and `jwt.ts`. Workaround: `@ts-expect-error` + eslint-disable blocks.
- **Concurrent refresh token race condition** — `generateRefreshToken()` used `sign()` with second-granularity `iat`, causing identical tokens (and thus identical DB hashes) when two refreshes fired in the same second. Fixed by adding `jti: crypto.randomUUID()` to the token payload.
