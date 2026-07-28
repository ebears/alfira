import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { type GuildPlayer } from '../GuildPlayer';
import { getGuildId } from '../lib/config';
import { authPlugin } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { lavalink } from '../lib/lavalink';
import { requirePlayer, requirePlaying } from '../lib/player';
import { canAccessPlaylist } from '../lib/playlistAccess';
import {
  LoopModeResponse,
  MessageResponse,
  PauseToggleResponse,
  PlaylistQueuedResponse,
  QueueState,
  SongAddedResponse,
} from '../lib/responseSchemas';
import {
  clampMaxVideos,
  fetchPlaylistMetadata,
  fetchSourceMetadata,
  validatePlaylistUrl,
  validateSourceUrl,
  youTubeUrl,
} from '../lib/validation';
import { resolveOrAutoJoinPlayer } from '../lib/voice';
import { fisherYatesShuffle, type QueuedSong, toQueuedSong } from '../shared';
import { db, findPlaylistWithSongs, tables } from '../shared/db';
import { getPlayer } from '../startDiscord';

const { song: songTable } = tables;

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function fetchSongById(songId: string) {
  const [song] = db
    .select()
    .from(songTable)
    .where(eq(songTable.id, songId))
    .limit(1) as unknown as [typeof songTable.$inferSelect | undefined];
  return song;
}

// ---------------------------------------------------------------------------
// Plugin helpers
// ---------------------------------------------------------------------------

async function resolveUrlTempSong(
  user: { discordId: string; username: string },
  body: { url?: string }
): Promise<{ player: GuildPlayer; queuedSong: QueuedSong; metadataTitle: string }> {
  const url = validateSourceUrl(body.url);

  const discordId = user.discordId;
  const player = await resolveOrAutoJoinPlayer(discordId);

  const metadata = await fetchSourceMetadata(url);

  const username = user.username;
  const queuedSong: QueuedSong = {
    id: `temp-${Date.now()}`,
    title: metadata.title,
    sourceUrl: url,
    sourceId: metadata.sourceId,
    duration: metadata.duration,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    thumbnailUrl: metadata.thumbnailUrl ?? '',
    addedBy: discordId,
    createdAt: new Date().toISOString(),
    requestedBy: username,
  };

  return { player, queuedSong, metadataTitle: metadata.title };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PlaySchema = t.Object({
  playlistId: t.Optional(t.String()),
  mode: t.Optional(t.Union([t.Literal('sequential'), t.Literal('random')])),
  loop: t.Optional(t.Union([t.Literal('off'), t.Literal('song'), t.Literal('queue')])),
  startFromSongId: t.Optional(t.String()),
});

const LoopSchema = t.Object({
  mode: t.Union([t.Literal('off'), t.Literal('song'), t.Literal('queue')]),
});

const UrlSchema = t.Object({
  url: t.Optional(t.String()),
});

const QuickAddPlaylistSchema = t.Object({
  url: t.Optional(t.String()),
  maxVideos: t.Optional(t.Number()),
});

const SeekSchema = t.Object({
  position: t.Number(),
});

const SongIdSchema = t.Object({
  songId: t.String(),
});

const ReorderSchema = t.Object({
  songIds: t.Array(t.String()),
  target: t.Optional(t.Union([t.Literal('queue'), t.Literal('priority')])),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const playerPlugin = new Elysia({ prefix: '/player', name: 'player' })
  .use(authPlugin)
  .get(
    '/queue',
    (): typeof QueueState.static => {
      const player = getPlayer(getGuildId());

      if (!player) {
        return {
          isPlaying: false,
          isPaused: false,
          isConnectedToVoice: lavalink.isGuildConnected(getGuildId()),
          loopMode: 'off' as const,
          isShuffled: false,
          currentSong: null,
          priorityQueue: [],
          queue: [],
          trackStartedAt: null,
          nextTrack: null,
          timescaleSpeed: 1,
          nodeLinkPosition: null,
          nodeLinkTime: null,
        } as typeof QueueState.static;
      }

      return player.getQueueState() as typeof QueueState.static;
    },
    { isAuth: true, response: { 200: QueueState } }
  )

  .patch(
    '/queue/reorder',
    ({ body }) => {
      const { songIds, target } = body;

      if (songIds.length === 0) {
        throw new ApiError(400, 'songIds must not be empty.');
      }

      try {
        const player = requirePlayer();
        if (target === 'priority') {
          player.reorderPriorityQueue(songIds);
        } else {
          player.reorderQueue(songIds);
        }
      } catch (error) {
        throw new ApiError(422, error instanceof Error ? error.message : 'Invalid reorder.');
      }

      return { message: 'Queue reordered.' };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      body: ReorderSchema,
      response: { 200: MessageResponse },
    }
  )
  .post(
    '/queue/:songId/promote',
    ({ params }) => {
      const songId = params.songId;
      const player = requirePlayer();

      const promoted = player.promoteSong(songId);
      if (!promoted) {
        throw new ApiError(404, 'Song not found in queue.');
      }

      return { message: 'Song promoted to Up Next.' };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      params: t.Object({ songId: t.String() }),
      response: { 200: MessageResponse },
    }
  )
  .post(
    '/queue/:songId/demote',
    ({ params }) => {
      const songId = params.songId;
      const player = requirePlayer();

      const demoted = player.demoteSong(songId);
      if (!demoted) {
        throw new ApiError(404, 'Song not found in Up Next.');
      }

      return { message: 'Song moved to queue.' };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      params: t.Object({ songId: t.String() }),
      response: { 200: MessageResponse },
    }
  )
  .delete(
    '/queue/:songId',
    ({ params }) => {
      const songId = params.songId;
      const player = requirePlayer();

      const removed = player.removeSongById(songId);
      if (!removed) {
        throw new ApiError(404, 'Song not found in queue.');
      }

      return { message: 'Song removed from queue.' };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      params: t.Object({ songId: t.String() }),
      response: { 200: MessageResponse },
    }
  )
  .post(
    '/add-to-priority',
    async ({ user, body }): Promise<typeof SongAddedResponse.static> => {
      const { songId } = body;
      const { discordId, username } = user as { discordId: string; username: string };

      const song = fetchSongById(songId);
      if (!song) {
        throw new ApiError(404, 'Song not found.');
      }

      const player = await resolveOrAutoJoinPlayer(discordId);
      const queuedSong = toQueuedSong({ ...song }, username);
      queuedSong.id = `queue-${Date.now()}-${song.id}`;

      await player.addToPriorityQueue(queuedSong);

      return {
        message: `Added "${song.nickname ?? song.title}" to Up Next.`,
        song: queuedSong,
      } as typeof SongAddedResponse.static;
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      body: SongIdSchema,
      response: { 200: SongAddedResponse },
    }
  )
  .post(
    '/clear',
    () => {
      const player = requirePlayer();

      player.clearQueue();
      return { message: 'Queue cleared.' };
    },
    { isVoiceChannel: true, hasPermission: 'queue.manage', response: { 200: MessageResponse } }
  )
  .post(
    '/leave',
    () => {
      const player = getPlayer(getGuildId());

      if (!player && !lavalink.isGuildConnected(getGuildId())) {
        throw new ApiError(409, 'The bot is not in a voice channel.');
      }

      if (player) {
        player.stop();
      }

      return { message: 'Left the voice channel.' };
    },
    { isVoiceChannel: true, hasPermission: 'queue.manage', response: { 200: MessageResponse } }
  )
  .post(
    '/loop',
    ({ body }) => {
      const { mode } = body;
      const player = requirePlayer();

      player.setLoopMode(mode);
      return { loopMode: mode };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      body: LoopSchema,
      response: { 200: LoopModeResponse },
    }
  )

  .post(
    '/override',
    async ({ user, body }): Promise<typeof SongAddedResponse.static> => {
      const result = await resolveUrlTempSong(
        user as { discordId: string; username: string },
        body
      );
      await result.player.replaceQueueAndPlay([result.queuedSong]);
      return {
        message: `Now playing "${result.metadataTitle}".`,
        song: result.queuedSong,
      } as typeof SongAddedResponse.static;
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.override',
      body: UrlSchema,
      response: { 200: SongAddedResponse },
    }
  )

  .post(
    '/pause-toggle',
    async () => {
      const player = requirePlaying();

      const isPaused = await player.togglePause();
      return { isPaused };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      response: { 200: PauseToggleResponse },
    }
  )
  .post(
    '/play',
    async ({ user, body }) => {
      const { playlistId, mode, loop, startFromSongId } = body;
      const { discordId, username } = user as { discordId: string; username: string };

      const player = await resolveOrAutoJoinPlayer(discordId);

      let dbSongs: (typeof songTable.$inferSelect)[];

      if (playlistId) {
        const playlist = await findPlaylistWithSongs(playlistId);

        if (!playlist) {
          throw new ApiError(404, 'Playlist not found.');
        }

        const accessResult = canAccessPlaylist(playlist, {
          discordId,
          isAdmin: (user as { isAdmin: boolean }).isAdmin,
        });
        if (!accessResult.ok) {
          throw new ApiError(403, accessResult.error);
        }

        dbSongs = playlist.songs.map((ps) => ps.song);
      } else {
        dbSongs = await db.select().from(songTable).orderBy(songTable.createdAt);
      }

      if (dbSongs.length === 0) {
        throw new ApiError(422, 'No songs found to play.');
      }

      if (startFromSongId) {
        const startIndex = dbSongs.findIndex((s) => s.id === startFromSongId);

        if (startIndex === -1) {
          throw new ApiError(404, 'Start song not found in playlist.');
        }

        dbSongs = [...dbSongs.slice(startIndex), ...dbSongs.slice(0, startIndex)];
      }

      if (mode === 'random') {
        fisherYatesShuffle(dbSongs);
      }

      const targetLoopMode = loop ?? player.getLoopMode();
      player.setLoopMode(targetLoopMode);

      const queuedSongs = dbSongs.map((song) => toQueuedSong({ ...song }, username));

      if (startFromSongId) {
        await player.replaceQueueAndPlay(queuedSongs);
      } else {
        await player.addToQueue(queuedSongs);
      }

      return { message: `Queued ${queuedSongs.length} song(s).` };
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      body: PlaySchema,
      response: { 200: MessageResponse },
    }
  )

  .post(
    '/quick-add',
    async ({ user, body }): Promise<typeof SongAddedResponse.static> => {
      const result = await resolveUrlTempSong(
        user as { discordId: string; username: string },
        body
      );
      await result.player.addToPriorityQueue(result.queuedSong);
      return {
        message: `Added "${result.metadataTitle}" to the queue.`,
        song: result.queuedSong,
      } as typeof SongAddedResponse.static;
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.quickadd',
      body: UrlSchema,
      response: { 200: SongAddedResponse },
    }
  )
  .post(
    '/quick-add-playlist',
    async ({ user, body }): Promise<typeof PlaylistQueuedResponse.static> => {
      const maxVideos = clampMaxVideos(body.maxVideos);
      const url = validatePlaylistUrl(body.url);
      const { discordId, username } = user as { discordId: string; username: string };

      const player = await resolveOrAutoJoinPlayer(discordId);

      const playlistMetadata = await fetchPlaylistMetadata(url, maxVideos);

      const addedBy = discordId;
      const requestedBy = username;
      const queuedSongs = playlistMetadata.videos.map((video) => ({
        id: `temp-${Date.now()}-${video.id}`,
        title: video.title,
        sourceUrl: youTubeUrl(video.id),
        sourceId: video.id,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        addedBy,
        createdAt: new Date().toISOString(),
        requestedBy,
      }));

      await player.addToQueue(queuedSongs);

      return {
        message: `Added ${queuedSongs.length} song(s) from "${playlistMetadata.title}" to the queue.`,
        playlistTitle: playlistMetadata.title,
        totalVideos: playlistMetadata.videoCount,
        queuedCount: queuedSongs.length,
        songs: queuedSongs,
      } as typeof PlaylistQueuedResponse.static;
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.quickadd',
      body: QuickAddPlaylistSchema,
      response: { 200: PlaylistQueuedResponse },
    }
  )

  .post(
    '/seek',
    async ({ body }): Promise<typeof QueueState.static> => {
      const { position } = body;

      const player = requirePlaying();

      await player.seek(position);
      return player.getQueueState() as typeof QueueState.static;
    },
    {
      isVoiceChannel: true,
      hasPermission: 'queue.manage',
      body: SeekSchema,
      response: { 200: QueueState },
    }
  )
  .post(
    '/shuffle',
    () => {
      const player = getPlayer(getGuildId());

      if (!player || player.getQueue().length === 0) {
        throw new ApiError(409, 'No songs in the queue to shuffle.');
      }

      player.shuffle();
      return { message: 'Queue shuffled.' };
    },
    { isVoiceChannel: true, hasPermission: 'queue.manage', response: { 200: MessageResponse } }
  )
  .post(
    '/skip',
    async () => {
      const player = requirePlaying();

      await player.skip();
      return { message: 'Skipped.' };
    },
    { isVoiceChannel: true, hasPermission: 'queue.manage', response: { 200: MessageResponse } }
  )
  .post(
    '/unshuffle',
    () => {
      const player = requirePlayer();

      player.unshuffle();
      return { message: 'Queue order restored.' };
    },
    { isVoiceChannel: true, hasPermission: 'queue.manage', response: { 200: MessageResponse } }
  );
