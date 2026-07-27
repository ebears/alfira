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

### Pattern established

1. **Extract drizzle queries into helper functions** with clean parameter types — `Record<string, unknown>` handler parameters cause tsgo inference failures on `.where()` calls. Helper functions with `string`/`number` parameters avoid this.
2. **Handlers do: auth check → extract params → call query helpers → return `Response` objects.** Native plugins use the shared `elysiaJson()` helper from `lib/elysia-adapter.ts`, which includes `API_SECURITY_HEADERS` (CSP, X-Content-Type-Options, etc.). Legacy handlers continue using `lib/json.ts` which does the same.
3. **`as never`** for handler type compatibility with Elysia's complex generics. Single `/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */` at file level suppresses the unavoidable type assertion warnings.
4. **Route registration:** the plugin function takes an `Elysia` instance, calls `.get()` / `.patch()` / `.delete()`, returns `as unknown as Elysia`. Plugins are chained on `apiApp` with explicit `as unknown as Elysia` casts.
5. **Guards:** `requireAdminOrPermission(ctx, permission?)` — no permission arg means super-admin only; with permission arg means super-admin OR has the granular permission.

## Remaining work

### Phase 4 — Migrate remaining legacy route groups (6 files)

Routes to migrate, roughly in order of complexity:

| Route group        | Files | Complexity                                   |
| ------------------ | ----- | -------------------------------------------- |
| `/api/player`      | 1     | Medium — many endpoints, playback control    |
| `/api/songs`       | 1     | Medium — search, pagination, bulk operations |
| `/api/playlists`   | 1     | Medium — CRUD, reorder, import               |
| `/api/requests`    | 1     | Medium — CRUD, preview, approve/deny         |
| `/api/permissions` | 1     | Medium — role-based permission management    |
| `/api/setup`       | 1     | Low — wizard endpoints                       |
| `/auth`            | 1     | Medium — OAuth2 Discord login flow           |

After each group is migrated, remove it from `API_LEGACY_ROUTES` in `elysia-app.ts`.

### Phase 5 — Eden treaty on the web client

- Replace `web/src/api/client.ts` (~200 lines) + `web/src/api/api.ts` (~80 lines) with `treaty<App>()`
- Delete `packages/server/src/shared/api.ts` (~400 lines)
- Update all web components to use Eden's typed proxy instead of shared API functions
- Keep `client.ts` auth refresh logic wired into Eden's `fetcher` option

### Cleanup after all routes migrated

- Delete `lib/routeTable.ts`, `lib/context.ts`, `lib/json.ts`, `lib/guards.ts`, `lib/routeGuards.ts`
- Delete `lib/elysia-adapter.ts` (no more legacy handlers to wrap)
- Remove `API_LEGACY_ROUTES` and `registerLegacyRoutes` from `elysia-app.ts`
- Remove the legacy route handler imports from `elysia-app.ts`
- Delete all old `routes/*.ts` files (replaced by `routes/*.elysia.ts`)

### Known issues

- **tsgo + drizzle + `Record<string, unknown>` incompatibility.** When a handler parameter is `Record<string, unknown>`, tsgo fails to resolve `.where()` overloads on drizzle query builders. Workaround: extract queries into helper functions with clean parameter types. A future tsgo update may fix this.
- **Elysia sub-app type propagation.** `.derive()` on the parent app doesn't propagate types to sub-apps merged via `.use()`. Workaround: `as never` casts on handler registrations and `as unknown as Elysia` on plugin calls.
- **Bun namespace errors.** Installing Elysia changes the TypeScript import graph in a way that surfaces pre-existing `Bun.spawn` / `Bun.CryptoHasher` type errors in `index.ts` and `jwt.ts`. Workaround: `@ts-expect-error` + eslint-disable blocks.
- **Lifecycle hooks + legacy `Response` objects don't mix.** `onAfterHandle` and `mapResponse` hooks interfere with legacy handlers that return pre-constructed `Response` objects. The hooks either corrupt the body (JSON parse errors) or fail to merge headers. Do not use lifecycle hooks for header injection; embed headers in the response helper functions instead.
- **`all()` vs explicit methods for legacy routes.** `all()` on Elysia sub-apps may behave differently than explicit `get()`/`post()`. Prefer explicit method registration for catch-all legacy route adapters.
- **Concurrent refresh token race condition.** `generateRefreshToken()` used `sign()` with second-granularity `iat`, causing identical tokens (and thus identical DB hashes) when two refreshes fired in the same second. Fixed by adding `jti: crypto.randomUUID()` to the token payload.
