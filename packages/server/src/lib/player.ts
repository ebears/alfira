import { type GuildPlayer } from '../startDiscord';
import { getPlayer } from '../startDiscord';
import { getGuildId } from './config';
import { ApiError } from './errors';

export function requirePlaying(): GuildPlayer {
  const player = getPlayer(getGuildId());
  if (!player?.getCurrentSong()) {
    throw new ApiError(409, 'Nothing is currently playing.');
  }
  return player;
}

export function requirePlayer(): GuildPlayer {
  const player = getPlayer(getGuildId());
  if (!player) {
    throw new ApiError(409, 'The bot is not connected.');
  }
  return player;
}
