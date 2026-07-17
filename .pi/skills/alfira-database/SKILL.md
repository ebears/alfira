---
name: alfira-database
description: SQLite + Drizzle ORM schema, homegrown migration runner, query patterns, tag system, and guild settings. Use when working on shared/db/schema.ts, migrations, lib/ensureTagsMigrated.ts, lib/tagCanonicalization.ts, or any database query.
---

# Alfira Database

## Tech

- **Database:** SQLite via `bun:sqlite` (libsql)
- **ORM:** Drizzle ORM (`drizzle-orm/sqlite-core`)
- **Migration runner:** Homegrown (not Drizzle Kit), reads `.sql` files from `packages/server/src/shared/db/migrations/`

## Two database clients

There are **two** database handles — know which to use:

| Client    | Import      | Type                      | Use case                                                            |
| --------- | ----------- | ------------------------- | ------------------------------------------------------------------- |
| `$client` | `shared/db` | Raw `bun:sqlite` Database | Migration runner (`$client.run()`, `$client.query()`), synchronous  |
| `db`      | `shared/db` | Drizzle instance          | All application queries (`db.select()`, `db.insert()`, etc.), async |

Never mix them — use `db` for application code, `$client` only for migrations and schema introspection.

## Schema (`packages/server/src/shared/db/schema.ts`)

### `Song` table

Primary music entity. Key columns:

- `id` — UUID primary key (auto-generated via `$defaultFn`)
- `sourceUrl` + `sourceId` — both unique, identify the source track
- `tags` — JSON array of tag name strings (being migrated to `Tag` table)
- `volumeBoost` — optional per-song volume boost (dB)
- `createdAt` — timestamp_ms, auto-set to `new Date()`

### `Playlist` table

- `name`, `createdBy`, `isPrivate` (boolean, default false)
- `tagNameLower` — links to `Tag.nameLower` for auto-generated playlists
- `createdAt` — timestamp_ms, auto-set to `new Date()`

### `PlaylistSong` join table

- Links songs to playlists at a specific `position`
- Compound unique constraint on `(playlistId, songId)`
- Index on `(playlistId, position)` for ordered retrieval

### `Tag` table

Normalized tag storage (migrated from `Song.tags` JSON). Key columns:

- `nameLower` — unique, lowercase tag name (used for lookups)
- `canonicalName` — display name with original casing
- `color` — optional hex color

### `guildSettings` table

Single-row table (always `id = 1`). Holds:

- **Compressor:** 5 columns (enabled, threshold, ratio, attack, release, gain)
- **Equalizer:** 15 columns (`eqBand0` through `eqBand14`, range 0-100)
- **Admin:** `guildId`, `adminRoleIds` (comma-separated string), `setupCompleted`, `voiceIdleTimeoutMinutes`
- **Sources:** `enabledSources` (comma-separated string, default `"youtube,soundcloud"`)
- **Misc:** `afkNotificationChannelId`, `requestNotificationChannelId`, `notifyOnApproved`, `notifyOnDenied`, `publicUrl`

### `songRequest` table

Tracks pending/approved/denied song requests. Key columns:

- `sourceUrl` + `sourceId` — identifies the source track
- `title`, `thumbnailUrl`, `artist`, `artworkUrl`, `sourceName` — track metadata
- `type` — `'track'` or `'playlist'`
- `playlistData` — JSON blob with playlist metadata and embedded track list
- `status` — `'pending'`, `'approved'`, or `'denied'`
- `notifyDm` — whether to DM the requester on review
- `requestedBy` / `reviewedBy` — Discord IDs
- `createdAt` / `closedAt` — timestamps

### `RefreshToken` table

OAuth2 refresh tokens: `tokenHash` (unique), `discordId`, `expiresAt`. Index on `discordId`.

### `rolePermission` table

Composite primary key `(action, roleId)`.

## Migration Runner (`index.ts::runMigrations()`)

Custom, not Drizzle Kit:

1. Ensures `__drizzle_migrations` tracking table exists
2. Reads `.sql` files from `migrations/` directory, sorted by filename
3. For each file: compute SHA-256 hash, check if already applied, split on `-->\s*statement-breakpoint`, run each statement
4. Skips "already exists" errors (idempotent)
5. Records applied hash + timestamp

### Creating new migrations

```bash
bun run db:generate    # Generate .sql migration files
bun run db:migrate     # Run them (standalone, not via the server)
```

## Tag Migration (`lib/ensureTagsMigrated.ts`)

Migrates from the old `Song.tags` JSON array pattern to the normalized `Tag` table:

1. Reads all songs with non-empty `tags`
2. For each unique tag name: creates a `Tag` row if it doesn't exist
3. Does NOT remove `Song.tags` column (backward compatible)

## Tag Canonicalization (`lib/tagCanonicalization.ts`)

Ensures consistent tag casing: the first encounter of a tag name (case-insensitive) becomes the canonical casing. Subsequent different casings are normalized to the canonical form.

## Query Patterns

**Drizzle queries (use `db`):**

```typescript
import { db } from './shared/db';
import { song, eq } from './shared/db/schema'; // hypothetical

const songs = await db.select().from(song).where(eq(song.id, id));
```

**Raw queries (only for migrations, use `$client`):**

```typescript
$client.run('CREATE TABLE IF NOT EXISTS ...');
$client.query('SELECT hash FROM "__drizzle_migrations" WHERE hash = ?').get(hash);
```

**Singleton guild settings pattern:**

```typescript
// Always id = 1
const settings = await db.select().from(guildSettings).where(eq(guildSettings.id, 1)).get();
if (!settings) {
  await db.insert(guildSettings).values({ id: 1 });
}
```

## Rate Limiting

`lib/rateLimit.ts` provides in-memory rate limiting with periodic pruning (every 5 minutes via `setInterval` in `index.ts`).
