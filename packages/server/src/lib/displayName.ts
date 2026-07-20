import { getGuildId } from './config';
import { fetchGuildMember } from './discordRest';

export async function getUserDisplayName(discordId: string): Promise<string> {
  const guildId = getGuildId();
  if (!guildId) {
    return discordId;
  }

  try {
    const member = await fetchGuildMember(guildId, discordId);
    if (!member) {
      return discordId;
    }
    // Prefer server nickname, fall back to global username, then ID.
    return member.nick || member.user.username || discordId;
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
