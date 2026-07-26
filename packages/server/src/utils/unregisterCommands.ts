/**
 * unregisterCommands.ts
 *
 * Standalone script to clean up Discord slash commands from the pre-web-UI era.
 * No longer runs automatically on startup — Alfira is web-first now.
 *
 * Run manually if needed:
 *   bun run packages/server/src/utils/unregisterCommands.ts
 *
 * Requires: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, GUILD_ID in .env
 */

import { logger } from '../shared/logger';

/** Delay helper for rate limit pacing. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Delete a command with retry on rate limit (429). */
async function deleteCommand(
  url: string,
  token: string,
  cmdName: string,
  type: 'guild' | 'global'
): Promise<boolean> {
  const headers = { Authorization: `Bot ${token}` };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'DELETE', headers });

    if (res.ok) {
      logger.info({ name: cmdName, type }, 'Removed command');
      return true;
    }

    if (res.status === 429) {
      const errText = await res.text();
      let retryAfter = 1000; // default 1s
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const err = JSON.parse(errText) as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        retryAfter = Math.ceil(((err.retry_after as number | undefined) ?? 1) * 1000) + 100; // add buffer
      } catch {
        // ignore parse errors
      }
      logger.warn({ name: cmdName, type, attempt, retryAfter }, 'Rate limited, retrying...');
      await delay(retryAfter);
      continue;
    }

    // Other error (404, 403, etc.) - don't retry
    const err = await res.text();
    logger.error({ name: cmdName, type, status: res.status, err }, 'Failed to remove command');
    return false;
  }

  logger.error({ name: cmdName, type }, 'Max retries exceeded for command removal');
  return false;
}

/** Unregister all guild and global commands for this application. */
export async function unregisterStaleCommands(): Promise<void> {
  const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, GUILD_ID } = process.env;

  if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !GUILD_ID) {
    logger.warn(
      'Missing env vars for command unregistration (DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, GUILD_ID)'
    );
    return;
  }

  // Delete all guild commands
  const res = await fetch(
    `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${GUILD_ID}/commands`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, err }, 'Failed to fetch guild commands');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const commands = (await res.json()) as { id: string; name: string }[];

  if (commands.length === 0) {
    logger.info('No guild commands to remove');
  } else {
    for (const cmd of commands) {
      await deleteCommand(
        `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${GUILD_ID}/commands/${cmd.id}`,
        DISCORD_BOT_TOKEN,
        cmd.name,
        'guild'
      );
      await delay(200); // pace requests to avoid rate limits
    }
  }

  // Also clean up any global commands (if any were ever registered)
  const globalRes = await fetch(
    `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
  );

  if (globalRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const globalCommands = (await globalRes.json()) as { id: string; name: string }[];
    for (const cmd of globalCommands) {
      await deleteCommand(
        `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/commands/${cmd.id}`,
        DISCORD_BOT_TOKEN,
        cmd.name,
        'global'
      );
      await delay(200);
    }
  }

  logger.info('Stale command cleanup complete');
}

// Allow running as standalone script: `bun run unregisterCommands.ts`
if (import.meta.main) {
  // Bun auto-loads .env — env vars are already available
  await unregisterStaleCommands();
  process.exit(0);
}
