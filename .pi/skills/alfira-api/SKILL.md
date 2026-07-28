---
name: alfira-api
description: API route structure, authentication flow, Elysia macros, security headers, WebSocket auth, and error handling. Use when working on routes/*.elysia.ts, elysia-app.ts, lib/elysia-guards.ts, or adding new API endpoints.
---

# Alfira API

## Server

Elysia HTTP server on port 3001. Serves three concerns:

1. **REST API** — All `/api/*` routes (registered as Elysia plugins)
2. **WebSocket** — `/ws` endpoint for real-time player state
3. **Static assets** — Built web UI from `packages/web/dist/` with SPA fallback

The HTTP layer is defined in `packages/server/src/elysia-app.ts`, composing three Elysia instances (root, apiApp, authApp).

## Route Map (defined in `elysia-app.ts`)

All route files use the `.elysia.ts` extension and export an Elysia plugin instance:

| Prefix                     | Plugin file                        | Purpose                                                   |
| -------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `/api/tags`                | `routes/tags.elysia.ts`            | CRUD for tags                                             |
| `/api/songs`               | `routes/songs.elysia.ts`           | Song library, search, edit, delete                        |
| `/api/requests`            | `routes/requests.elysia.ts`        | Song request CRUD, preview, approve/deny                  |
| `/api/playlists`           | `routes/playlists.elysia.ts`       | Playlist CRUD, reorder, import                            |
| `/api/player`              | `routes/player.elysia.ts`          | Playback control (play, pause, skip, seek, volume, queue) |
| `/api/settings/compressor` | `routes/compressor.elysia.ts`      | Compressor settings                                       |
| `/api/settings/equalizer`  | `routes/equalizer.elysia.ts`       | Equalizer settings                                        |
| `/api/settings/channelmix` | `routes/channelMix.elysia.ts`      | Channel mix settings                                      |
| `/api/settings/distortion` | `routes/distortion.elysia.ts`      | Distortion settings                                       |
| `/api/settings/karaoke`    | `routes/karaoke.elysia.ts`         | Karaoke filter settings                                   |
| `/api/settings/lowpass`    | `routes/lowPass.elysia.ts`         | Low pass filter settings                                  |
| `/api/settings/rotation`   | `routes/rotation.elysia.ts`        | Rotation filter settings                                  |
| `/api/settings/timescale`  | `routes/timescale.elysia.ts`       | Timescale settings                                        |
| `/api/settings/tremolo`    | `routes/tremolo.elysia.ts`         | Tremolo settings                                          |
| `/api/settings/vibrato`    | `routes/vibrato.elysia.ts`         | Vibrato settings                                          |
| `/api/settings/filters`    | `routes/filters.elysia.ts`         | NodeLink filter application                               |
| `/api/settings/general`    | `routes/generalSettings.elysia.ts` | General guild settings                                    |
| `/api/permissions`         | `routes/permissions.elysia.ts`     | Role-based permission management                          |
| `/api/setup`               | `routes/setup.elysia.ts`           | Initial setup wizard                                      |
| `/auth`                    | `routes/auth.elysia.ts`            | OAuth2 Discord login flow                                 |

Special routes (no `/api` prefix):

- `/health` — Returns service health with component status (database, nodelink, discord)
- `/api/version` — Returns version, public (no auth)
- `/ws` — WebSocket upgrade (defined in root app)

## Auth & Guards (`lib/elysia-guards.ts`)

Authentication is handled by the `authPlugin` using Elysia's [macro system](https://elysiajs.com/patterns/macro.html). Guards are opt-in annotations on routes:

```typescript
import { authPlugin } from '../lib/elysia-guards';

new Elysia()
  .use(authPlugin)
  .get('/public', handler) // public
  .get('/profile', handler, { isAuth: true }) // authenticated
  .get('/admin', handler, { isAdmin: true }) // admin
  .patch('/manage', handler, { hasPermission: 'queue.manage' }) // granular permission
  .post('/control', handler, { isVoiceChannel: true }) // auth + in voice
  .get('/setup', handler, { isSetupAdmin: true }); // auth + setup admin
```

Each guard macro resolves the session cookie, verifies the JWT, and either populates `{ user }` into context or short-circuits with the appropriate 4xx response. Macros compose — for example, `isVoiceChannel` extends `isAuth`, so you only declare the most specific guard.

Super-admins automatically bypass the `hasPermission` check.

### requireAuth (scoped)

For plugins where every route requires auth, use `requireAuth` (an Elysia `resolve` scoped plugin):

```typescript
import { authPlugin, requireAuth } from '../lib/elysia-guards';

new Elysia()
  .use(authPlugin)
  .use(requireAuth)
  .get('/songs', handler) // auth required (scoped)
  .get('/playlists', handler); // auth required (scoped)
```

For plugins with mixed auth/public routes, use the `isAuth` macro per-route instead.

## Authentication Flow

### Discord OAuth2 (`routes/auth.elysia.ts`)

1. User clicks "Login with Discord" → redirects to Discord OAuth2 authorize URL
2. Discord redirects back to `DISCORD_REDIRECT_URI` with auth code
3. Server exchanges code for access token, fetches user info + guild member
4. Issues JWT session token, sets `session` cookie (httpOnly, secure, sameSite=lax)
5. User info (discordId, username, avatar, isAdmin) encoded in JWT

### Session validation (`lib/elysia-guards.ts` → `resolveUser()`)

- `verifySessionToken(token)` — verifies JWT, returns `{ discordId, username, avatar, isAdmin } | null`
- Cookie-based: reads `session` cookie from request
- Admin status is cached in JWT — user must re-login after role changes

### JWT secret

Must be set in `.env` as `JWT_SECRET`. Used for signing and verifying session tokens.

## Security Headers

Applied to all `/api/*` routes via `onAfterHandle` in the `apiApp` Elysia instance:

```
Content-Security-Policy: default-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

The header values are defined in `lib/securityHeaders.ts` and the API subset (without `Set-Cookie`) lives in `lib/apiResponse.ts` as `API_SECURITY_HEADERS`.

## WebSocket (`/ws` endpoint)

Defined on the root Elysia app via `.ws()`:

- **Auth happens in `open` handler** — validates session cookie, closes connection if unauthenticated
- On success: `registerClient(ws, user)` assigns a UUID socket ID
- **Receive-only** — clients never send messages (logged and ignored if they do)
- Cleanup: `unregisterClient(ws)` via `close` handler and `closeAllClients()` on shutdown

## Error Handling

### ApiError (`lib/errors.ts`)

A lightweight error class for API errors. Throw from route handlers or helper functions instead of returning `Response` objects:

```typescript
import { ApiError } from '../lib/errors';

if (!song) {
  throw new ApiError(404, 'Song not found.');
}
```

The `onError` hook on `apiApp` catches `ApiError` and converts it to a JSON response:

```json
{ "error": "Song not found." }
```

This keeps handler return types clean (plain data, never `Response | data` unions) so Elysia response schemas work without type assertions.

### Unexpected errors

Non-`ApiError` exceptions are caught by `onError`, logged, and returned as `{ error: 'Internal server error.' }` with status 500.

## Response Schemas (`lib/responseSchemas.ts`)

Shared Elysia `t` object schemas for Eden type inference. Adding a response schema as the third argument to `.get()`/`.post()`/etc. enables Eden to infer full response types on the frontend:

```typescript
import { SongListResponse } from '../lib/responseSchemas';

app.get('/api/songs', handler, {
  response: SongListResponse,
});
```

Response schemas cover songs, playlists, requests, tags, settings, permissions, setup, and pagination metadata.

## Adding a New Route

1. Create or extend an Elysia plugin in `packages/server/src/routes/yourRoute.elysia.ts`
2. Export a plugin instance using `authPlugin`, Elysia guards, and response schemas:

```typescript
import { Elysia, t } from 'elysia';
import { authPlugin } from '../lib/elysia-guards';
import { YourResponse } from '../lib/responseSchemas';

export const yourPlugin = new Elysia({ name: 'your-route' }).use(authPlugin).get(
  '/api/your-endpoint',
  ({ user, db }) => {
    return { data: '...' };
  },
  {
    isAuth: true,
    response: YourResponse,
  }
);
```

3. Register the plugin in `elysia-app.ts` — add `.use(yourPlugin)` to `apiApp` (for `/api` routes) or the root app.

## Rate Limiting

`lib/rateLimit.ts` — in-memory store, pruned every 5 minutes via `setInterval` in `index.ts`. Applied via `checkRateLimit()` in route handlers.

## Enabled Sources

Cached from `guildSettings.enabledSources` (comma-separated string). Initialized at startup via `initEnabledSources()` from `startDiscord.ts`. Used by player routes to validate source URLs.
