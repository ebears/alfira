import { getClient } from '../startDiscord';
import { GUILD_ID } from './config';

export async function getUserDisplayName(discordId: string): Promise<string> {
  const client = getClient();
  if (!client) return discordId;

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.resolve(discordId);
    if (!member) return discordId;
    // GuildMemberStructure has 'nick' (server nickname) and the user object
    const user = member.user;
    return member.displayName || user.username || discordId;
  } catch {
    return discordId;
  }
}

/**
 * Resolve Discord display names for a batch of items that have an `addedBy`
 * field (Discord user ID). Returns a Map of userId → displayName.
 */
export async function resolveDisplayNames(
  items: { addedBy: string }[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(items.map((s) => s.addedBy))];
  const nameMap = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (id) => {
      nameMap.set(id, await getUserDisplayName(id));
    })
  );
  return nameMap;
}
