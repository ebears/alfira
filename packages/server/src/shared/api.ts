// ---------------------------------------------------------------------------
// Shared API types — consumed by the web client.
//
// Runtime functions have moved to packages/web/src/api/routes.ts (backed by
// Eden Treaty). When tsgo supports Elysia's generic types, the web client
// will consume Eden directly and this file will be deleted entirely.
// ---------------------------------------------------------------------------

import {
  type GeneralSettings,
  type LoopMode,
  type PaginatedResult,
  type PaginationMeta,
  type Playlist,
  type PlaylistDetail,
  type QueueState,
  type RequestPreview,
  type SetupChannel,
  type SetupGuild,
  type SetupRole,
  type SetupStatus,
  type Song,
  type SongRequest,
  type User,
} from './types';

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
};

// ---------------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------------

export interface FetchSongsOptions {
  search?: string;
  sort?: string;
  order?: string;
  tags?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface RequestCreateData {
  sourceUrl: string;
  /** Explicitly request a playlist import — skips ?list= stripping. */
  type?: 'playlist';
  notifyDm?: boolean;
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
}

export interface CreateRequestResult {
  request?: SongRequest;
  song?: Song;
  songs?: Song[];
  autoApproved: boolean;
  importedCount?: number;
  skippedCount?: number;
  playlistTitle?: string;
}

export interface FetchRequestsResult {
  items: SongRequest[];
  pagination: PaginationMeta;
}

export interface BulkEditData {
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
  clearFields?: string[];
}

/**
 * Data for updating a song. Only provide fields you want to change.
 */
export interface SongUpdateData {
  nickname?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
  tags?: string[];
  volumeBoost?: number | null;
}

export interface TagItem {
  canonicalName: string;
  nameLower: string;
  color?: string | null;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface CompleteSetupPayload {
  guildId: string;
  adminRoleIds: string;
  voiceIdleTimeoutMinutes: number;
  afkNotificationChannelId?: string | null;
  requestNotificationChannelId?: string | null;
  publicUrl?: string | null;
  enabledSources?: string;
}

// ---------------------------------------------------------------------------
// General Settings
// ---------------------------------------------------------------------------

export type GeneralSettingsUpdate = Partial<
  Pick<
    GeneralSettings,
    | 'adminRoleIds'
    | 'voiceIdleTimeoutMinutes'
    | 'afkNotificationChannelId'
    | 'requestNotificationChannelId'
    | 'notifyOnApproved'
    | 'notifyOnDenied'
    | 'publicUrl'
    | 'enabledSources'
  >
>;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermissionsResponse {
  mapping: Record<string, string[]>;
  roles: { id: string; name: string; color: number }[];
  categories: { label: string; actions: string[] }[];
  labels: Record<string, string>;
}

export interface MyPermissionsResponse {
  permissions: string[];
}
