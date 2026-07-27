import { eq } from 'drizzle-orm';
import { type Elysia } from 'elysia';
import * as v from 'valibot';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { requireAdminOrPermission } from '../lib/elysia-guards';
import { syncAllFilters } from '../lib/syncAllFilters';
import { db, tables } from '../shared/db';
import { DEFAULT_ROTATION } from '../shared/filterDefaults';

const RotationSchema = v.object({
  enabled: v.boolean(),
  rotationHz: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchRotationSettings(): { enabled: boolean; rotationHz: number } {
  const row = db.select().from(tables.guildSettings).where(eq(tables.guildSettings.id, 1)).get();

  return {
    enabled: row?.rotationEnabled ?? DEFAULT_ROTATION.enabled,
    rotationHz: row?.rotationHz ?? DEFAULT_ROTATION.rotationHz,
  };
}

function upsertRotationSettings(data: { enabled: boolean; rotationHz: number }): void {
  db.insert(tables.guildSettings)
    .values({ id: 1, rotationEnabled: data.enabled, rotationHz: data.rotationHz })
    .onConflictDoUpdate({
      target: tables.guildSettings.id,
      set: { rotationEnabled: data.enabled, rotationHz: data.rotationHz },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleGet(ctx: Record<string, unknown>): Response {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  return json(fetchRotationSettings());
}

async function handlePatch(ctx: Record<string, unknown>): Promise<Response> {
  const guardErr = requireAdminOrPermission(
    { user: ctx.user as never, isAdmin: ctx.isAdmin as boolean },
    'audio.manage'
  );
  if (guardErr) {
    return guardErr;
  }

  const body = ctx.body as v.InferOutput<typeof RotationSchema>;
  upsertRotationSettings(body);
  await syncAllFilters();

  return json(body);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function rotationPlugin(app: Elysia): Elysia {
  return app
    .get('/settings/rotation', handleGet as never)
    .patch('/settings/rotation', handlePatch as never, {
      body: RotationSchema,
    }) as unknown as Elysia;
}
