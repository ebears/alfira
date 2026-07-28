import { canonicalizeTags } from './tagCanonicalization';
import {
  validateArtworkUrl,
  validateNickname,
  validateOptionalString,
  validateTags,
  validateVolumeBoost,
} from './validation';

// ---------------------------------------------------------------------------
// Shared song field validation
//
// Used by POST /api/songs/bulk-edit and PATCH /api/songs/:id to avoid
// duplicating ~50 lines of per-field validation logic.  Accepts a body
// with optional song metadata fields and an optional clearFields array
// (for bulk-edit null-outs).  Tags go through canonicalizeTags to ensure
// consistent casing.
//
// Validation helpers throw ApiError on failure, which is caught by the
// onError hook on apiApp.
// ---------------------------------------------------------------------------

export interface SongFieldInput {
  nickname?: unknown;
  artist?: unknown;
  album?: unknown;
  artwork?: unknown;
  tags?: unknown;
  volumeBoost?: unknown;
}

export interface SongFieldOutput {
  data: Record<string, unknown>;
  processedTags?: string[];
  processedVolumeBoost?: number | null | undefined;
}

export async function validateAndBuildSongFields(
  body: SongFieldInput,
  clearFields: string[] = []
): Promise<SongFieldOutput> {
  const data: Record<string, unknown> = {};
  let processedTags: string[] | undefined;
  let processedVolumeBoost: number | null | undefined;

  // Nickname
  if (body.nickname !== undefined) {
    data.nickname = validateNickname(body.nickname);
  } else if (clearFields.includes('nickname')) {
    data.nickname = null;
  }

  // Artist
  if (body.artist !== undefined) {
    data.artist = validateOptionalString(body.artist);
  } else if (clearFields.includes('artist')) {
    data.artist = null;
  }

  // Album
  if (body.album !== undefined) {
    data.album = validateOptionalString(body.album);
  } else if (clearFields.includes('album')) {
    data.album = null;
  }

  // Artwork
  if (body.artwork !== undefined) {
    data.artwork = validateArtworkUrl(body.artwork);
  } else if (clearFields.includes('artwork')) {
    data.artwork = null;
  }

  // Tags
  if (body.tags !== undefined) {
    processedTags = await canonicalizeTags(validateTags(body.tags));
    data.tags = processedTags;
  } else if (clearFields.includes('tags')) {
    data.tags = [];
    processedTags = [];
  }

  // Volume boost
  if (body.volumeBoost !== undefined) {
    processedVolumeBoost = validateVolumeBoost(body.volumeBoost);
    data.volumeBoost = processedVolumeBoost;
  } else if (clearFields.includes('volumeBoost')) {
    data.volumeBoost = null;
    processedVolumeBoost = null;
  }

  return { data, processedTags, processedVolumeBoost };
}
