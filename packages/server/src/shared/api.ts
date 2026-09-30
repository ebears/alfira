// ---------------------------------------------------------------------------
// Shared API payload types — consumed by the web client.
//
// Every type here is derived from the Elysia schemas in ./apiSchemas, which
// are the single source of truth for the wire contract. Never hand-write a
// wire type — add or change the schema instead.
//
// Runtime functions live in packages/web/src/api/routes.ts (backed by Eden
// Treaty). When the web client consumes Eden directly, wrapper-specific
// types (FetchSongsOptions, BulkEditData, …) move to the wrappers and this
// file shrinks to pure re-exports.
// ---------------------------------------------------------------------------

import {
  type BulkEditSchema,
  type CreateRequestSchema,
  type CreateRequestResult as CreateRequestResultSchema,
  type GeneralSettingsPatchSchema,
  type MyPermissionsResponse as MyPermissionsResponseSchema,
  type PermissionsResponse as PermissionsResponseSchema,
  type SetupCompleteSchema,
  type SongPatchSchema,
  type SongsQuerySchema,
  type TAG_COLOR_UNION,
  type TagItem as TagItemSchema,
  type TagPatchSchema,
} from './apiSchemas';
import { type PaginatedResult, type SongRequest } from './types';

// Re-export domain types (used by components that import from @alfira/server/shared)
export type {
  GeneralSettings,
  LoopMode,
  PaginatedResult,
  PaginationMeta,
  Playlist,
  PlaylistDetail,
  QueueState,
  RequestPreview,
  SetupChannel,
  SetupGuild,
  SetupRole,
  SetupStatus,
  Song,
  SongRequest,
  User,
} from './types';

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

/** Query options for GET /api/songs (page/limit are wrapper parameters). */
export type FetchSongsOptions = Omit<typeof SongsQuerySchema.static, 'page' | 'limit'>;

/** PATCH /api/songs/:id body. */
export type SongUpdateData = typeof SongPatchSchema.static;

/** POST /api/songs/bulk-edit body (without ids, which is a wrapper parameter). */
export type BulkEditData = Omit<typeof BulkEditSchema.static, 'ids'>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** POST /api/requests body. */
export type RequestCreateData = typeof CreateRequestSchema.static;

export type CreateRequestResult = typeof CreateRequestResultSchema.static;

export type FetchRequestsResult = PaginatedResult<SongRequest>;

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export type TagItem = typeof TagItemSchema.static;

/** Allowed tag color names. */
export type TagColor = typeof TAG_COLOR_UNION.static;

/** PATCH /api/tags/:nameLower body. */
export type TagUpdateData = typeof TagPatchSchema.static;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** POST /api/setup/complete body. */
export type CompleteSetupPayload = typeof SetupCompleteSchema.static;

// ---------------------------------------------------------------------------
// General Settings
// ---------------------------------------------------------------------------

/** PATCH /api/settings/general body. */
export type GeneralSettingsUpdate = typeof GeneralSettingsPatchSchema.static;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type PermissionsResponse = typeof PermissionsResponseSchema.static;
export type MyPermissionsResponse = typeof MyPermissionsResponseSchema.static;
