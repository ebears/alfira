---
name: alfira-api
description: API route structure, authentication flow, middleware, security headers, WebSocket auth, and response helpers. Use when working on routes/*.ts, middleware/requireAuth.ts, index.ts route wiring, or adding new API endpoints.
---

# Alfira API

## Server

Bun native HTTP server on port 3001. Serves three concerns:

1. **REST API** — All `/api/*` routes
2. **WebSocket** — `/ws` endpoint for real-time player state
3. **Static assets** — Built web UI from `packages/web/dist/` with SPA fallback

## Route Map (defined in `index.ts` fetch handler)

| Prefix | Handler file | Purpose |
|--------|-------------|---------|
| `/api/tags` | `routes/tags.ts` | CRUD for tags |
| `/api/songs` | `routes/songs.ts` | Song library, search, edit, delete |
| `/api/requests` | `routes/requests.ts` | Song request CRUD, preview, approve/deny |
| `/api/playlists` | `routes/playlists.ts` | Playlist CRUD, reorder, import |
| `/api/player` | `routes/player.ts` | Playback control (play, pause, skip, seek, volume, queue) |
| `/api/settings/compressor` | `routes/compressor.ts` | Compressor settings |
| `/api/settings/equalizer` | `routes/equalizer.ts` | Equalizer settings |
| `/api/permissions` | `routes/permissions.ts` | Role-based permission management |
| `/api/settings/general` | `routes/generalSettings.ts` | General guild settings |
| `/api/setup` | `routes/setup.ts` | Initial setup wizard |
| `/auth` | `routes/auth.ts` | OAuth2 Discord login flow |

Special routes (no `/api` prefix):
- `/health` — Returns service health with component status (database, nodelink, discord)
- `/api/version` — Returns version, public (no auth)
- `/ws` — WebSocket upgrade

## Route Context

Every route handler receives `RouteContext`:

```typescript
type RouteContext = {
  user: ReturnType<typeof verifySessionToken>; // null if unauthenticated
  isAdmin: boolean;
  cookies: Record<string, string>;
};
```

Created by `createContext(request)` which parses cookies and validates session token. Routes are responsible for their own auth checks — check `ctx.user` and `ctx.isAdmin`.

## Authentication Flow

### Discord OAuth2 (`routes/auth.ts`)

1. User clicks "Login with Discord" → redirects to Discord OAuth2 authorize URL
2. Discord redirects back to `DISCORD_REDIRECT_URI` with auth code
3. Server exchanges code for access token, fetches user info + guild member
4. Issues JWT session token, sets `session` cookie (httpOnly, secure, sameSite=lax)
5. User info (discordId, username, avatar, isAdmin) encoded in JWT

### Session validation (`middleware/requireAuth.ts`)

- `verifySessionToken(token)` — verifies JWT, returns `{ discordId, username, avatar, isAdmin } | null`
- Cookie-based: reads `session` cookie from request
- Admin status is cached in JWT — user must re-login after role changes

### JWT secret

Must be set in `.env` as `JWT_SECRET`. Used for signing and verifying session tokens.

## Security Headers

All API responses get security headers applied by `setSecurityHeaders()`:

```
Content-Security-Policy: default-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

`Set-Cookie` headers are preserved (not overwritten).

## WebSocket (`/ws` endpoint)

- Auth happens **before** upgrade — `getSessionUser()` validates session cookie
- On 401: returns 401 response, no upgrade
- On success: `server.upgrade(request, { data: { user } })`
- Client data: never sends messages (receive-only)
- Registration: `registerClient(ws, user)` assigns a UUID socket ID
- Cleanup: `unregisterClient(ws)` on close

## Response Helpers

### `json(data, status)` — `lib/json.ts`
```typescript
import { json } from './lib/json';
return json({ error: 'Not found' }, 404);
```

### Player guards — `lib/player.ts`
```typescript
import { requirePlayer, requirePlaying } from './lib/player';

const result = requirePlaying();
if (!result.ok) return result.response; // 409 with error message
// result.player is typed GuildPlayer
```

## Adding a new route

1. Create handler in `packages/server/src/routes/yourRoute.ts`
2. Export a `handleYourRoute(ctx: RouteContext, request: Request): Promise<Response>` function
3. Add route matching in `index.ts` fetch handler:
```typescript
if (url.pathname.startsWith('/api/yourRoute')) {
  return setSecurityHeaders(await handleYourRoute(ctx, request));
}
```

## Rate Limiting

`lib/rateLimit.ts` — in-memory store, pruned every 5 minutes. Apply via middleware pattern in route handlers as needed.

## Enabled Sources

Cached from `guildSettings.enabledSources` (comma-separated string). Initialized at startup via `initEnabledSources()` from `startDiscord.ts`. Used by player routes to validate source URLs.
