import { logger } from '../shared/logger';
import {
  getEnabledSourceDisplayNames,
  getMetadata,
  getPlaylistMetadataWithVideos,
  isPlaylistUrl,
  isValidSourceUrl,
} from '../startDiscord';
import { ApiError } from './errors';

const MAX_URL_LENGTH = 2000;

/**
 * Validates and trims a URL input. Throws ApiError if validation fails.
 * Used by URL validators to avoid duplication.
 */
function validateUrlInput(sourceUrl: unknown): string {
  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
    throw new ApiError(400, 'url is required.');
  }

  const url = sourceUrl.trim();

  if (url.length > MAX_URL_LENGTH) {
    throw new ApiError(400, `URL must be ${MAX_URL_LENGTH} characters or less.`);
  }

  return url;
}

/** Validates a source URL for single video endpoints. Throws ApiError on failure. */
export function validateSourceUrl(sourceUrl: unknown): string {
  const url = validateUrlInput(sourceUrl);

  if (!isValidSourceUrl(url)) {
    const names = getEnabledSourceDisplayNames();
    const list = names.length > 0 ? names.join(' and ') : 'no sources';
    throw new ApiError(400, `Supported sources: ${list}. That URL doesn't look right.`);
  }

  return url;
}

/** Validates a playlist URL. Throws ApiError on failure. */
export function validatePlaylistUrl(playlistUrl: unknown): string {
  const url = validateUrlInput(playlistUrl);

  if (!isPlaylistUrl(url)) {
    const names = getEnabledSourceDisplayNames();
    const list = names.length > 0 ? names.join(' and ') : 'no sources';
    throw new ApiError(
      400,
      `That does not look like a valid playlist URL. Supported sources: ${list}.`
    );
  }

  return url;
}

async function wrapBotCall<T>(fn: () => Promise<T>, errorMsg: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : String(error) }, 'NodeLink call failed');

    // If it's a fetch error with response status, propagate the actual status
    if (error instanceof Error && error.message.startsWith('NodeLink REST')) {
      const match = /NodeLink REST (\d+):/.exec(error.message);
      if (match?.[1]) {
        const status = Math.trunc(Number(match[1]));
        throw new ApiError(status, error.message);
      }
      // If regex didn't match but it's a NodeLink REST error, use 502
      throw new ApiError(502, error.message);
    }

    // Return more specific error with the actual error message
    const message = error instanceof Error ? error.message : errorMsg;
    throw new ApiError(422, message);
  }
}

/**
 * Fetches metadata for a single source URL.
 * Throws ApiError if fetch fails.
 */
export function fetchSourceMetadata(url: string): Promise<Awaited<ReturnType<typeof getMetadata>>> {
  return wrapBotCall(
    () => getMetadata(url),
    'Could not fetch track info. The track may be private, age-restricted, or unavailable.'
  );
}

/**
 * Fetches playlist metadata with tracks.
 * Throws ApiError if fetch fails.
 */
export function fetchPlaylistMetadata(
  url: string,
  maxVideos?: number
): Promise<Awaited<ReturnType<typeof getPlaylistMetadataWithVideos>>> {
  return wrapBotCall(
    () => getPlaylistMetadataWithVideos(url, maxVideos),
    'Could not fetch playlist info. The playlist may be private or unavailable.'
  );
}

/** Clamps maxVideos to the [1, 100] range, or returns undefined if not set. */
export function clampMaxVideos(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.min(Math.max(1, value), 100);
}

/** Returns a canonical YouTube watch URL for a given video ID. */
export function youTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Validates and trims a playlist name. Throws ApiError on failure. */
export function validatePlaylistName(name: unknown): string {
  const MAX_NAME_LENGTH = 200;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ApiError(400, 'name is required.');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ApiError(400, `name must be ${MAX_NAME_LENGTH} characters or less.`);
  }
  return name.trim();
}

/**
 * Validates and trims a nickname.
 * Returns null for empty/missing, throws ApiError for invalid type/length.
 */
export function validateNickname(nickname: unknown): string | null {
  const MAX_NICKNAME_LENGTH = 50;
  if (nickname !== undefined && nickname !== null && typeof nickname !== 'string') {
    throw new ApiError(400, 'nickname must be a string.');
  }
  const trimmed = nickname ? nickname.trim() || null : null;
  if (trimmed && trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new ApiError(400, `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

/** Validates an optional string field. Trims and returns null if empty. */
export function validateOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Validates an artwork URL. Trims and checks it's a valid URL if non-empty. Throws ApiError on failure. */
export function validateArtworkUrl(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ApiError(400, 'artwork must be a string.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new ApiError(400, 'artwork URL is too long.');
  }
  try {
    new URL(trimmed);
  } catch {
    throw new ApiError(400, 'artwork must be a valid URL.');
  }
  return trimmed;
}

/** Validates tags: ensure string[], trim each, deduplicate. Throws ApiError on failure. */
export function validateTags(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'tags must be an array.');
  }
  const trimmed = value
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.replace(/\s+/g, '-').trim());
  return [...new Set(trimmed)];
}

/**
 * Validates an optional volume boost (-100 to +200).
 * Returns `undefined` when absent (PATCH skips it),
 * `null` when explicitly cleared (maps to 0 at playback),
 * the integer when valid (-100 to +200).
 * Throws ApiError when invalid.
 */
export function validateVolumeBoost(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ApiError(400, 'volumeBoost must be an integer.');
  }
  if (value < -100 || value > 200) {
    throw new ApiError(400, 'volumeBoost must be between -100 and 200.');
  }
  return value;
}
