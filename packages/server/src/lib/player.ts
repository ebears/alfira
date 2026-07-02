import type { GuildPlayer } from '../startDiscord';
import { getPlayer } from '../startDiscord';
import { getGuildId } from './config';
import { json } from './json';

export function requirePlaying():
  | { ok: true; player: GuildPlayer }
  | { ok: false; response: Response } {
  const player = getPlayer(getGuildId());
  if (!player?.getCurrentSong()) {
    return {
      ok: false,
      response: json({ error: 'Nothing is currently playing.' }, 409),
    };
  }
  return { ok: true, player };
}

export function requirePlayer():
  | { ok: true; player: GuildPlayer }
  | { ok: false; response: Response } {
  const player = getPlayer(getGuildId());
  if (!player) {
    return {
      ok: false,
      response: json({ error: 'The bot is not connected.' }, 409),
    };
  }
  return { ok: true, player };
}
