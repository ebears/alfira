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
- **Security headers are per-layer, not lifecycle hooks.** Lifecycle hooks (`onAfterHandle`, `mapResponse`) interfere with legacy handlers that return pre-constructed `Response` objects. Instead: legacy handlers use `lib/json.ts` (already includes `SECURITY_HEADERS`), native Elysia plugins use `elysiaJson()` from `lib/elysia-adapter.ts` (includes `API_SECURITY_HEADERS`), and static files get no security headers. No lifecycle hooks needed.

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

**Files NOT deleted yet** (still used by `/auth` via `wrapLegacy`):

- `packages/server/src/lib/context.ts` — `RouteContext` type used by `wrapLegacy()`
- `packages/server/src/lib/routeTable.ts` — `routeTable()` used by `handleAuth`
- `packages/server/src/lib/routeGuards.ts` — `checkGuards()` used by `handleAuth`
- `packages/server/src/lib/guards.ts` — `requireAuth`, `requireAdmin` used by `checkGuards`
- `packages/server/src/lib/json.ts` — `json()` used by `handleAuth`
- `packages/server/src/routes/auth.ts` — legacy auth handler (wrapped via `wrapLegacy` in `elysia-app.ts`)

### Phase 4a — Migrate `/auth` (1 file, deferred)

The `/auth` route group (login, callback, refresh, me, logout) has been migrated to a native Elysia plugin. All 5 endpoints are now Elysia-native handlers. The manual `Response` construction for cookie setting is preserved (it's well-tested and robust). The auth plugin uses `elysiaJson()` for JSON responses and reads cookies via the Elysia `deriveAuth` context.

**New files:**

- `packages/server/src/routes/auth.elysia.ts` — 5 endpoints (GET login, GET callback, POST refresh, GET me, POST logout). All helper functions, rate limiting, OAuth2 flow, cookie management, and JWT logic preserved from `routes/auth.ts`.

**Modified files:**

- `packages/server/src/elysia-app.ts` — Replaced `wrapLegacy(handleAuth)` with native `authPlugin(authApp)`. Removed unused `wrapLegacy` import.

**Files now eligible for deletion** (no longer used by any active code):

- `packages/server/src/lib/context.ts` — `RouteContext` type only used by legacy infrastructure
- `packages/server/src/lib/routeTable.ts` — `routeTable()` only used by legacy route files
- `packages/server/src/lib/routeGuards.ts` — `checkGuards()` only used by legacy route files
- `packages/server/src/lib/guards.ts` — `requireAuth`, `requireAdmin` only used by legacy route files
- `packages/server/src/lib/json.ts` — `json()` still used by `elysia-app.ts` (`/api/version` and `/health`)
- `packages/server/src/routes/auth.ts` — Legacy auth handler, replaced by `auth.elysia.ts`
- All legacy `.ts` route files that have `.elysia.ts` equivalents (tags, songs, player, playlists, requests, setup, permissions, compressor, equalizer, karaoke, lowPass, distortion, rotation, timescale, tremolo, vibrato, channelMix, filters, generalSettings)

### Pattern established

1. **Extract drizzle queries into helper functions** with clean parameter types — `Record<string, unknown>` handler parameters cause tsgo inference failures on `.where()` calls. Helper functions with `string`/`number` parameters avoid this.
2. **Handlers do: auth check → extract params → call query helpers → return `Response` objects.** Native plugins use the shared `elysiaJson()` helper from `lib/elysia-adapter.ts`, which includes `API_SECURITY_HEADERS` (CSP, X-Content-Type-Options, etc.). Legacy handlers continue using `lib/json.ts` which does the same.
3. **`as never`** for handler type compatibility with Elysia's complex generics. File-level `/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */` suppresses the unavoidable type assertion warnings. Additional file-level disables for `no-unnecessary-condition` and `no-unnecessary-type-assertion` may be needed depending on tsgo's strictness with drizzle return types.
4. **Route registration:** the plugin function takes an `Elysia` instance, calls `.get()` / `.patch()` / `.delete()`, returns `as unknown as Elysia`. Plugins are chained on `apiApp` with explicit `as unknown as Elysia` casts.
5. **Guards:** `requireAdminOrPermission(ctx, permission?)` — no permission arg means super-admin only; with permission arg means super-admin OR has the granular permission. Voice check via `requireUserInVoice(ctx)`. Setup mode via `requireSetupMode(ctx)`.

## Remaining work

### Phase 5 — Eden treaty on the web client

- Replace `web/src/api/client.ts` (~200 lines) + `web/src/api/api.ts` (~80 lines) with `treaty<App>()`
- Delete `packages/server/src/shared/api.ts` (~400 lines)
- Update all web components to use Eden's typed proxy instead of shared API functions
- Keep `client.ts` auth refresh logic wired into Eden's `fetcher` option

### Cleanup (after Phase 4a)

Now that `/auth` is migrated to a native Elysia plugin, the legacy infrastructure can be cleaned up:

- Delete `lib/routeTable.ts`, `lib/context.ts`, `lib/guards.ts`, `lib/routeGuards.ts` (no longer used)
- Delete `routes/auth.ts` and all legacy `.ts` route files that have `.elysia.ts` equivalents
- Remove `RouteContext` re-export from `index.ts`
- `lib/json.ts` — still used by `elysia-app.ts` for `/api/version` and `/health`. Can be replaced with `elysiaJson` from `lib/elysia-adapter.ts`.
- `lib/elysia-adapter.ts` — `wrapLegacy` can be removed; `elysiaJson` and `API_SECURITY_HEADERS` should be extracted to a standalone helper (e.g., `lib/apiResponse.ts`)

## Known issues

- **tsgo + drizzle + `Record<string, unknown>` incompatibility.** When a handler parameter is `Record<string, unknown>`, tsgo fails to resolve `.where()` overloads on drizzle query builders. Workaround: extract queries into helper functions with clean parameter types. A future tsgo update may fix this.
- **Elysia sub-app type propagation.** `.derive()` on the parent app doesn't propagate types to sub-apps merged via `.use()`. Workaround: `as never` casts on handler registrations and `as unknown as Elysia` on plugin calls.
- **Bun namespace errors.** Installing Elysia changes the TypeScript import graph in a way that surfaces pre-existing `Bun.spawn` / `Bun.CryptoHasher` type errors in `index.ts` and `jwt.ts`. Workaround: `@ts-expect-error` + eslint-disable blocks.
- **Lifecycle hooks + legacy `Response` objects don't mix.** `onAfterHandle` and `mapResponse` hooks interfere with legacy handlers that return pre-constructed `Response` objects. The hooks either corrupt the body (JSON parse errors) or fail to merge headers. Do not use lifecycle hooks for header injection; embed headers in the response helper functions instead.
- **`all()` vs explicit methods for legacy routes.** `all()` on Elysia sub-apps may behave differently than explicit `get()`/`post()`. Prefer explicit method registration for catch-all legacy route adapters.
- **Concurrent refresh token race condition.** `generateRefreshToken()` used `sign()` with second-granularity `iat`, causing identical tokens (and thus identical DB hashes) when two refreshes fired in the same second. Fixed by adding `jti: crypto.randomUUID()` to the token payload.
