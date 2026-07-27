import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';

import { type GuildPlayer } from '../GuildPlayer';
import { deriveAuth } from '../lib/authDerive';
import { getGuildId } from '../lib/config';
import { authGuard, createAdminOrPermissionGuard, voiceGuard } from '../lib/elysia-guards';
import { ApiError } from '../lib/errors';
import { lavalink } from '../lib/lavalink';
import { requirePlayer, requirePlaying } from '../lib/player';
import { canAccessPlaylist } from '../lib/playlistAccess';
import { LoopModeResponse, MessageResponse, PauseToggleResponse } from '../lib/responseSchemas';
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

export const playerPlugin = new Elysia({ prefix: '/player' })
  .derive(deriveAuth)
  .use(authGuard)
  .get(
    '/queue',
    () => {
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
        };
      }

      return player.getQueueState();
    },
    { response: { 200: t.Unknown() } }
  )
  .use(voiceGuard)

  .guard({}, (app) =>
    app
      .use(createAdminOrPermissionGuard('queue.manage'))
      .patch(
        '/queue/reorder',
        ({ ...ctx }) => {
          const { songIds, target } = ctx.body as typeof ReorderSchema.static;

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
        { body: ReorderSchema, response: { 200: MessageResponse } }
      )
      .post(
        '/queue/:songId/promote',
        ({ ...ctx }) => {
          const songId = (ctx.params as Record<string, string>).songId as string;
          const player = requirePlayer();

          const promoted = player.promoteSong(songId);
          if (!promoted) {
            throw new ApiError(404, 'Song not found in queue.');
          }

          return { message: 'Song promoted to Up Next.' };
        },
        { response: { 200: MessageResponse } }
      )
      .post(
        '/queue/:songId/demote',
        ({ ...ctx }) => {
          const songId = (ctx.params as Record<string, string>).songId as string;
          const player = requirePlayer();

          const demoted = player.demoteSong(songId);
          if (!demoted) {
            throw new ApiError(404, 'Song not found in Up Next.');
          }

          return { message: 'Song moved to queue.' };
        },
        { response: { 200: MessageResponse } }
      )
      .delete(
        '/queue/:songId',
        ({ ...ctx }) => {
          const songId = (ctx.params as Record<string, string>).songId as string;
          const player = requirePlayer();

          const removed = player.removeSongById(songId);
          if (!removed) {
            throw new ApiError(404, 'Song not found in queue.');
          }

          return { message: 'Song removed from queue.' };
        },
        { response: { 200: MessageResponse } }
      )
      .post(
        '/add-to-priority',
        async ({ ...ctx }) => {
          const user = ctx.user as { discordId: string; username: string };
          const { songId } = ctx.body as typeof SongIdSchema.static;

          const song = fetchSongById(songId);
          if (!song) {
            throw new ApiError(404, 'Song not found.');
          }

          const player = await resolveOrAutoJoinPlayer(user.discordId);
          const queuedSong = toQueuedSong({ ...song }, user.username);
          queuedSong.id = `queue-${Date.now()}-${song.id}`;

          await player.addToPriorityQueue(queuedSong);

          return {
            message: `Added "${song.nickname ?? song.title}" to Up Next.`,
            song: queuedSong,
          };
        },
        { body: SongIdSchema, response: { 200: t.Unknown() } }
      )
      .post(
        '/clear',
        () => {
          const player = requirePlayer();

          player.clearQueue();
          return { message: 'Queue cleared.' };
        },
        { response: { 200: MessageResponse } }
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
        { response: { 200: MessageResponse } }
      )
      .post(
        '/loop',
        ({ ...ctx }) => {
          const { mode } = ctx.body as typeof LoopSchema.static;
          const player = requirePlayer();

          player.setLoopMode(mode);
          return { loopMode: mode };
        },
        { body: LoopSchema, response: { 200: LoopModeResponse } }
      )
  )

  .guard({}, (app) =>
    app.use(createAdminOrPermissionGuard('queue.override')).post(
      '/override',
      async ({ ...ctx }) => {
        const user = ctx.user as { discordId: string; username: string };
        const body = ctx.body as typeof UrlSchema.static;
        const result = await resolveUrlTempSong(user, body);
        await result.player.replaceQueueAndPlay([result.queuedSong]);
        return {
          message: `Now playing "${result.metadataTitle}".`,
          song: result.queuedSong,
        };
      },
      { body: UrlSchema, response: { 200: t.Unknown() } }
    )
  )

  .guard({}, (app) =>
    app
      .use(createAdminOrPermissionGuard('queue.manage'))
      .post(
        '/pause-toggle',
        async () => {
          const player = requirePlaying();

          const isPaused = await player.togglePause();
          return { isPaused };
        },
        { response: { 200: PauseToggleResponse } }
      )
      .post(
        '/play',
        async ({ ...ctx }) => {
          const user = ctx.user as { discordId: string; username: string };
          const body = ctx.body as typeof PlaySchema.static;
          const { playlistId, mode, loop, startFromSongId } = body;

          const player = await resolveOrAutoJoinPlayer(user.discordId);

          let dbSongs: (typeof songTable.$inferSelect)[];

          if (playlistId) {
            const playlist = await findPlaylistWithSongs(playlistId);

            if (!playlist) {
              throw new ApiError(404, 'Playlist not found.');
            }

            const accessResult = canAccessPlaylist(playlist, user);
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

          const queuedSongs = dbSongs.map((song) => toQueuedSong({ ...song }, user.username));

          if (startFromSongId) {
            await player.replaceQueueAndPlay(queuedSongs);
          } else {
            await player.addToQueue(queuedSongs);
          }

          return { message: `Queued ${queuedSongs.length} song(s).` };
        },
        { body: PlaySchema, response: { 200: t.Unknown() } }
      )
  )

  .guard({}, (app) =>
    app
      .use(createAdminOrPermissionGuard('queue.quickadd'))
      .post(
        '/quick-add',
        async ({ ...ctx }) => {
          const user = ctx.user as { discordId: string; username: string };
          const body = ctx.body as typeof UrlSchema.static;
          const result = await resolveUrlTempSong(user, body);
          await result.player.addToPriorityQueue(result.queuedSong);
          return {
            message: `Added "${result.metadataTitle}" to the queue.`,
            song: result.queuedSong,
          };
        },
        { body: UrlSchema, response: { 200: t.Unknown() } }
      )
      .post(
        '/quick-add-playlist',
        async ({ ...ctx }) => {
          const user = ctx.user as { discordId: string; username: string };
          const body = ctx.body as typeof QuickAddPlaylistSchema.static;
          const maxVideos = clampMaxVideos(body.maxVideos);
          const url = validatePlaylistUrl(body.url);

          const player = await resolveOrAutoJoinPlayer(user.discordId);

          const playlistMetadata = await fetchPlaylistMetadata(url, maxVideos);

          const addedBy = user.discordId;
          const requestedBy = user.username;
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
          };
        },
        { body: QuickAddPlaylistSchema, response: { 200: t.Unknown() } }
      )
  )

  .guard({}, (app) =>
    app
      .use(createAdminOrPermissionGuard('queue.manage'))
      .post(
        '/seek',
        async ({ ...ctx }) => {
          const { position } = ctx.body as typeof SeekSchema.static;

          const player = requirePlaying();

          await player.seek(position);
          return player.getQueueState();
        },
        { body: SeekSchema, response: { 200: t.Unknown() } }
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
        { response: { 200: MessageResponse } }
      )
      .post(
        '/skip',
        async () => {
          const player = requirePlaying();

          await player.skip();
          return { message: 'Skipped.' };
        },
        { response: { 200: MessageResponse } }
      )
      .post(
        '/unshuffle',
        () => {
          const player = requirePlayer();

          player.unshuffle();
          return { message: 'Queue order restored.' };
        },
        { response: { 200: MessageResponse } }
      )
  );
