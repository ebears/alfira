import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { deriveAuth } from '../lib/authDerive';
import { createAdminOrPermissionGuard } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_COMPRESSOR } from '../shared/filterDefaults';

const CompressorSchema = t.Object({
  enabled: t.Boolean(),
  threshold: t.Integer({ minimum: -60, maximum: 0 }),
  ratio: t.Number({ minimum: 1, maximum: 20 }),
  attack: t.Integer({ minimum: 0, maximum: 100 }),
  release: t.Integer({ minimum: 10, maximum: 1000 }),
  gain: t.Integer({ minimum: 0, maximum: 24 }),
});

type CompressorSettings = typeof CompressorSchema.static;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchCompressorSettings(): CompressorSettings {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.compressorEnabled ?? DEFAULT_COMPRESSOR.enabled,
    threshold: row?.compressorThreshold ?? DEFAULT_COMPRESSOR.threshold,
    ratio: row?.compressorRatio ?? DEFAULT_COMPRESSOR.ratio,
    attack: row?.compressorAttack ?? DEFAULT_COMPRESSOR.attack,
    release: row?.compressorRelease ?? DEFAULT_COMPRESSOR.release,
    gain: row?.compressorGain ?? DEFAULT_COMPRESSOR.gain,
  };
}

function upsertCompressorSettings(data: CompressorSettings): void {
  db.insert(tables.guildSettings)
    .values({
      id: 1,
      compressorEnabled: data.enabled,
      compressorThreshold: data.threshold,
      compressorRatio: data.ratio,
      compressorAttack: data.attack,
      compressorRelease: data.release,
      compressorGain: data.gain,
    })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: {
        compressorEnabled: data.enabled,
        compressorThreshold: data.threshold,
        compressorRatio: data.ratio,
        compressorAttack: data.attack,
        compressorRelease: data.release,
        compressorGain: data.gain,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const compressorPlugin = new Elysia({ prefix: '/settings/compressor' })
  .derive(deriveAuth)
  .use(createAdminOrPermissionGuard('audio.manage'))
  .get('/', () => fetchCompressorSettings())
  .patch(
    '/',
    async ({ body }) => {
      upsertCompressorSettings(body);
      await syncAllFilters();

      return body;
    },
    { body: CompressorSchema }
  );
