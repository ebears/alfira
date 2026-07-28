import { eq } from 'drizzle-orm';

import { db, tables } from '../shared/db';
import { logger } from '../shared/logger';
import { type SongRequest } from '../shared/types';
const DISCORD_API = 'https://discord.com/api/v10';

function botHeaders(): Record<string, string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN not set');
  }
  return { Authorization: `Bot ${token}` };
}

/**
 * Send a notification to the configured request notification channel.
 */
export async function sendRequestNotification(
  event: 'new' | 'approved' | 'denied',
  req: SongRequest,
  user: { discordId: string; username: string }
): Promise<void> {
  try {
    const row = db
      .select({
        channelId: tables.guildSettings.requestNotificationChannelId,
        notifyOnApproved: tables.guildSettings.notifyOnApproved,
        notifyOnDenied: tables.guildSettings.notifyOnDenied,
      })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get();

    if (!row?.channelId) {
      return;
    }

    // Respect per-event toggles ("new" always sends if channel is set)
    if (event === 'approved' && !row.notifyOnApproved) {
      return;
    }
    if (event === 'denied' && !row.notifyOnDenied) {
      return;
    }

    const messages: Record<string, string> = {
      new: `🎵 **New song request** from **${user.username}**: **${req.title}**`,
      approved: `✅ Request approved: **${req.title}**`,
      denied: `❌ Request denied: **${req.title}**`,
    };

    const content = messages[event] ?? `Request update: **${req.title}**`;

    await fetch(`${DISCORD_API}/channels/${row.channelId}/messages`, {
      method: 'POST',
      headers: {
        ...botHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
  } catch (error) {
    logger.warn({ error }, 'Failed to send request notification');
  }
}

/**
 * Send a DM to a user about their request status.
 */
export async function sendRequestDm(
  discordId: string,
  status: 'approved' | 'denied',
  title: string
): Promise<void> {
  try {
    // Create a DM channel with the user
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: {
        ...botHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: discordId }),
    });

    if (!dmRes.ok) {
      logger.warn({ discordId, status: dmRes.status }, 'Failed to create DM channel');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const dmChannel = (await dmRes.json()) as { id: string };
    const messages: Record<string, string> = {
      approved: `✅ Your song request for **${title}** has been approved and added to the library!`,
      denied: `❌ Your song request for **${title}** has been denied.`,
    };

    await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        ...botHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: messages[status] }),
    });
  } catch (error) {
    logger.warn({ error, discordId }, 'Failed to send request DM');
  }
}
