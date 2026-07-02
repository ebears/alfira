import { logger } from '../shared/logger';
import {
  getMetadata,
  getPlaylistMetadataWithVideos,
  isPlaylistUrl,
  isValidSourceUrl,
} from '../startDiscord';
import { json } from './json';

const MAX_URL_LENGTH = 2000;

type ValidationSuccess<T> = { ok: true; value: T };
type ValidationError = { ok: false; response: Response };
type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

/**
 * Validates and trims a URL input. Returns null if validation fails.
 * Used by URL validators to avoid duplication.
 */
function validateUrlInput(sourceUrl: unknown): ValidationResult<string> {
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return { ok: false, response: json({ error: 'url is required.' }, 400) };
  }

  const url = sourceUrl.trim();

  if (url.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      response: json({ error: `URL must be ${MAX_URL_LENGTH} characters or less.` }, 400),
    };
  }

  return { ok: true, value: url };
}

/** Validates a source URL for single video endpoints. */
export function validateSourceUrl(sourceUrl: unknown): ValidationResult<string> {
  const result = validateUrlInput(sourceUrl);
  if (!result.ok) return result;

  if (!isValidSourceUrl(result.value)) {
    return {
      ok: false,
      response: json(
        {
          error: "Supported sources are YouTube and SoundCloud. That URL doesn't look right.",
        },
        400
      ),
    };
  }

  return result;
}

/** Validates a playlist URL. */
export function validatePlaylistUrl(playlistUrl: unknown): ValidationResult<string> {
  const result = validateUrlInput(playlistUrl);
  if (!result.ok) return result;

  if (!isPlaylistUrl(result.value)) {
    return {
      ok: false,
      response: json(
        {
          error:
            'That does not look like a valid playlist URL. Supported sources are YouTube and SoundCloud.',
        },
        400
      ),
    };
  }

  return result;
}

async function wrapBotCall<T>(
  fn: () => Promise<T>,
  errorMsg: string
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    logger.error({ err: error as Error }, 'NodeLink call failed');

    // If it's a fetch error with response status, propagate the actual status
    if (error instanceof Error && error.message.startsWith('NodeLink REST')) {
      const match = error.message.match(/NodeLink REST (\d+):/);
      if (match?.[1]) {
        const status = parseInt(match[1], 10);
        return { ok: false, response: json({ error: error.message }, status) };
      }
      // If regex didn't match but it's a NodeLink REST error, use 502
      return { ok: false, response: json({ error: error.message }, 502) };
    }

    // Return more specific error with the actual error message
    const message = error instanceof Error ? error.message : errorMsg;
    return { ok: false, response: json({ error: message }, 422) };
  }
}

/**
 * Fetches metadata for a single source URL.
 * Returns error Response if fetch fails.
 */
export function fetchSourceMetadata(
  url: string
): Promise<
  { ok: true; value: Awaited<ReturnType<typeof getMetadata>> } | { ok: false; response: Response }
> {
  return wrapBotCall(
    () => getMetadata(url),
    'Could not fetch track info. The track may be private, age-restricted, or unavailable.'
  );
}

/**
 * Fetches playlist metadata with tracks.
 * Returns error Response if fetch fails.
 */
export function fetchPlaylistMetadata(
  url: string,
  maxVideos?: number
): Promise<
  | { ok: true; value: Awaited<ReturnType<typeof getPlaylistMetadataWithVideos>> }
  | { ok: false; response: Response }
> {
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

/** Validates and trims a playlist name. */
export function validatePlaylistName(name: unknown): ValidationResult<string> {
  const MAX_NAME_LENGTH = 200;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, response: json({ error: 'name is required.' }, 400) };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      response: json({ error: `name must be ${MAX_NAME_LENGTH} characters or less.` }, 400),
    };
  }
  return { ok: true, value: name.trim() };
}

/** Validates and trims a nickname. Returns null for empty/missing, error Response for invalid type/length. */
export function validateNickname(nickname: unknown): ValidationResult<string | null> {
  const MAX_NICKNAME_LENGTH = 50;
  if (nickname !== undefined && nickname !== null && typeof nickname !== 'string') {
    return { ok: false, response: json({ error: 'nickname must be a string.' }, 400) };
  }
  const trimmed = nickname ? String(nickname).trim() || null : null;
  if (trimmed && trimmed.length > MAX_NICKNAME_LENGTH) {
    return {
      ok: false,
      response: json(
        { error: `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.` },
        400
      ),
    };
  }
  return { ok: true, value: trimmed };
}

/** Validates an optional string field. Trims and returns null if empty. */
export function validateOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Validates an artwork URL. Trims and checks it's a valid URL if non-empty. */
export function validateArtworkUrl(value: unknown): ValidationResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string')
    return { ok: false, response: json({ error: 'artwork must be a string.' }, 400) };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_URL_LENGTH)
    return { ok: false, response: json({ error: 'artwork URL is too long.' }, 400) };
  try {
    new URL(trimmed);
  } catch {
    return { ok: false, response: json({ error: 'artwork must be a valid URL.' }, 400) };
  }
  return { ok: true, value: trimmed };
}

/** Validates tags: ensure string[], trim each, deduplicate */
export function validateTags(value: unknown): ValidationResult<string[]> {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value))
    return { ok: false, response: json({ error: 'tags must be an array.' }, 400) };
  const trimmed = value
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.replace(/\s+/g, '-').trim());
  return { ok: true, value: [...new Set(trimmed)] };
}

/**
 * Validates an optional volume boost (-100 to +200).
 * Returns `undefined` when absent (PATCH skips it),
 * `null` when explicitly cleared (maps to 0 at playback),
 * the integer when valid (-100 to +200),
 * error Response when invalid.
 */
export function validateVolumeBoost(
  value: unknown
): { ok: true; value: number | null | undefined } | { ok: false; response: Response } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return {
      ok: false,
      response: json({ error: 'volumeBoost must be an integer.' }, 400),
    };
  }
  if (value < -100 || value > 200) {
    return {
      ok: false,
      response: json({ error: 'volumeBoost must be between -100 and 200.' }, 400),
    };
  }
  return { ok: true, value };
}
