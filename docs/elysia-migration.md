# Elysia Migration

## Goal

Replace the homegrown HTTP framework (`routeTable`, `matchPath`, `RouteContext`, manual JSON serialization, `Bun.serve({ routes })` wiring) with [Elysia](https://elysiajs.com) — a Bun-native web framework that provides:

- **Declarative routing** — paths, params, and HTTP verbs defined in one place instead of spread across handler functions, `routeTable` entries, and `index.ts` wiring
- **Automatic request validation** — Valibot schemas in route definitions (`{ body: Schema }`); invalid requests never reach the handler
- **End-to-end type safety via Eden** — the server's route types auto-generate the client API surface, eliminating the manually-maintained `shared/api.ts` + `web/api/client.ts` (~680 lines of glue code)
- **Smaller, standard API surface** — Elysia is widely documented and has a large community, reducing onboarding friction

## Design decisions

- **Valibot stays.** Elysia natively supports Valibot schemas via the Standard Schema spec. Schemas move from inside handler functions to route definition hooks — same library, less boilerplate.
- **Sub-apps for route groups.** Each route group (tags, songs, player, etc.) becomes an Elysia plugin that registers on the main app. This keeps route files self-contained.
- **Auth via `.derive()`.** The cookie → JWT → user pipeline runs once per request in Elysia's `derive`, replacing `createContext()`. Guards (`requireAuth`, `requireAdminOrPermission`) are called explicitly in handlers — a future pass could move them into Elysia guard plugins.
- **Static files and SPA fallback stay on the main app.** The `/*` catch-all serves `packages/web/dist/` with SPA fallback.
- **Security headers are per-layer, not lifecycle hooks.** Lifecycle hooks (`onAfterHandle`, `mapResponse`) interfere with pre-constructed `Response` objects. Instead: API routes use `elysiaJson()` from `lib/apiResponse.ts` (includes `API_SECURITY_HEADERS`), and static files get no security headers. No lifecycle hooks needed.

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

## Remaining work

### Phase 5b — Eden treaty on the web client

- Create `web/src/api/eden.ts` — Eden treaty client with auth refresh logic in the `fetcher` option and token refresh in `onResponse`
- Replace `web/src/api/client.ts` (~200 lines) + `web/src/api/api.ts` (~80 lines) with the Eden-based client
- Replace `packages/server/src/shared/api.ts` (~400 lines) — the typed API functions become thin wrappers calling Eden under the hood, or get replaced entirely once components use Eden directly
- Update web components to use Eden's typed proxy instead of shared API functions
- Delete `shared/api.ts` once no longer referenced

### Phase 5c — Auth plugin conversion (optional)

Convert `authPlugin` from the function pattern to a proper Elysia instance:

```ts
// Before
export function authPlugin(app: Elysia): Elysia { ... }
authPlugin(authApp as unknown as Elysia)

// After
export const authPlugin = new Elysia({ prefix: '/auth' }).get(...).post(...);
authApp.use(authPlugin);
```

This is low priority — the auth plugin works correctly as-is and has a single consumer.

### Future — Remove tsgo workarounds

Once tsgo (the Go-based TypeScript compiler in oxlint) improves its handling of Elysia's deeply-nested generic types:

- Remove `as never` casts from handler registrations
- Remove `as unknown as Elysia` from plugin exports
- Restore proper Elysia context destructuring (`{ user, isAdmin, params }`) in handlers
- Enable full `treaty<App>()` type inference for Eden

## Known issues

- **tsgo + Elysia type propagation.** tsgo does not resolve Elysia's deeply-nested generic types, including `.derive()` propagation through `.use()`. Workaround: `as never` casts on handler registrations, `as unknown as Elysia` on plugin exports, `getAuth(ctx)` helper that casts to `AuthContext`, and the inline `deriveAuth` on the main app (which tsgo can handle for the WebSocket context). A future tsgo/Elysia update may fix this. Note: Bun's native transpiler handles these types correctly — the issue is only at typecheck time.
- **tsgo + drizzle + `Record<string, unknown>` incompatibility.** When a handler parameter is `Record<string, unknown>`, tsgo fails to resolve `.where()` overloads on drizzle query builders. Workaround: extract queries into helper functions with clean parameter types. A future tsgo update may fix this.
- **Bun namespace errors.** Installing Elysia changes the TypeScript import graph in a way that surfaces pre-existing `Bun.spawn` / `Bun.CryptoHasher` type errors in `index.ts` and `jwt.ts`. Workaround: `@ts-expect-error` + eslint-disable blocks.
- **Concurrent refresh token race condition.** `generateRefreshToken()` used `sign()` with second-granularity `iat`, causing identical tokens (and thus identical DB hashes) when two refreshes fired in the same second. Fixed by adding `jti: crypto.randomUUID()` to the token payload.
