import { eq } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */

import { type GuildPlayer } from '../GuildPlayer';
import { getGuildId } from '../lib/config';
import {
  requireAdminOrPermission,
  requireAuth,
  requireUserInVoice,
  type AuthContext,
} from '../lib/elysia-guards';
import { lavalink } from '../lib/lavalink';
import { requirePlayer, requirePlaying } from '../lib/player';
import { canAccessPlaylist } from '../lib/playlistAccess';
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

function getAuth(ctx: Record<string, unknown>): AuthContext {
  return ctx as unknown as AuthContext;
}

function guardVoice(ctx: Record<string, unknown>): Response | null {
  const { user, isAdmin } = getAuth(ctx);
  return requireUserInVoice({ user, isAdmin });
}

interface UrlTempSongOk {
  ok: true;
  player: GuildPlayer;
  queuedSong: QueuedSong;
  metadataTitle: string;
}

interface UrlTempSongErr {
  ok: false;
  response: Response;
}

async function resolveUrlTempSong(
  ctx: Record<string, unknown>,
  body: { url?: string }
): Promise<UrlTempSongOk | UrlTempSongErr> {
  const urlResult = validateSourceUrl(body.url);
  if (!urlResult.ok) {
    return { ok: false, response: urlResult.response };
  }
  const url = urlResult.value;

  const authCtx = getAuth(ctx);
  const discordId = (authCtx.user as { discordId: string }).discordId;
  const playerResult = await resolveOrAutoJoinPlayer(discordId);
  if (!playerResult.ok) {
    return { ok: false, response: playerResult.response };
  }
  const player = playerResult.player;

  const metadataResult = await fetchSourceMetadata(url);
  if (!metadataResult.ok) {
    return { ok: false, response: metadataResult.response };
  }
  const metadata = metadataResult.value;

  const username = (authCtx.user as { username: string }).username;
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

  return { ok: true, player, queuedSong, metadataTitle: metadata.title };
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
  .get('/queue', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const player = getPlayer(getGuildId());

    if (!player) {
      return Response.json({
        isPlaying: false,
        isPaused: false,
        isConnectedToVoice: lavalink.isGuildConnected(getGuildId()),
        loopMode: 'off',
        isShuffled: false,
        currentSong: null,
        priorityQueue: [],
        queue: [],
        trackStartedAt: null,
        nextTrack: null,
        timescaleSpeed: 1,
        nodeLinkPosition: null,
        nodeLinkTime: null,
      });
    }

    return Response.json(player.getQueueState());
  })
  .patch(
    '/queue/reorder',
    (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
      if (adminErr) {
        return adminErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const { songIds, target } = ctx.body as typeof ReorderSchema.static;

      if (songIds.length === 0) {
        return Response.json({ error: 'songIds must not be empty.' }, { status: 400 });
      }

      const playerResult = requirePlayer();
      if (!playerResult.ok) {
        return playerResult.response;
      }

      try {
        if (target === 'priority') {
          playerResult.player.reorderPriorityQueue(songIds);
        } else {
          playerResult.player.reorderQueue(songIds);
        }
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'Invalid reorder.' },
          { status: 422 }
        );
      }

      return Response.json({ message: 'Queue reordered.' });
    },
    { body: ReorderSchema }
  )
  .post('/queue/:songId/promote', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
    if (adminErr) {
      return adminErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const songId = (ctx.params as Record<string, string>).songId as string;
    const playerResult = requirePlayer();
    if (!playerResult.ok) {
      return playerResult.response;
    }

    const promoted = playerResult.player.promoteSong(songId);
    if (!promoted) {
      return Response.json({ error: 'Song not found in queue.' }, { status: 404 });
    }

    return Response.json({ message: 'Song promoted to Up Next.' });
  })
  .post('/queue/:songId/demote', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
    if (adminErr) {
      return adminErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const songId = (ctx.params as Record<string, string>).songId as string;
    const playerResult = requirePlayer();
    if (!playerResult.ok) {
      return playerResult.response;
    }

    const demoted = playerResult.player.demoteSong(songId);
    if (!demoted) {
      return Response.json({ error: 'Song not found in Up Next.' }, { status: 404 });
    }

    return Response.json({ message: 'Song moved to queue.' });
  })
  .delete('/queue/:songId', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
    if (adminErr) {
      return adminErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const songId = (ctx.params as Record<string, string>).songId as string;
    const playerResult = requirePlayer();
    if (!playerResult.ok) {
      return playerResult.response;
    }

    const removed = playerResult.player.removeSongById(songId);
    if (!removed) {
      return Response.json({ error: 'Song not found in queue.' }, { status: 404 });
    }

    return Response.json({ message: 'Song removed from queue.' });
  })
  .post(
    '/add-to-priority',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
      if (adminErr) {
        return adminErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const { songId } = ctx.body as typeof SongIdSchema.static;

      const song = fetchSongById(songId);
      if (!song) {
        return Response.json({ error: 'Song not found.' }, { status: 404 });
      }

      const discordId = (user as { discordId: string }).discordId;
      const playerResult = await resolveOrAutoJoinPlayer(discordId);
      if (!playerResult.ok) {
        return playerResult.response;
      }
      const player = playerResult.player;

      const requestedBy = (user as { username: string }).username;
      const queuedSong = toQueuedSong(
        { ...song, createdAt: song.createdAt.toISOString() },
        requestedBy
      );
      queuedSong.id = `queue-${Date.now()}-${song.id}`;

      await player.addToPriorityQueue(queuedSong);

      return Response.json({
        message: `Added "${song.nickname ?? song.title}" to Up Next.`,
        song: queuedSong,
      });
    },
    { body: SongIdSchema }
  )
  .post('/clear', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
    if (adminErr) {
      return adminErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const playerResult = requirePlayer();
    if (!playerResult.ok) {
      return playerResult.response;
    }

    playerResult.player.clearQueue();
    return Response.json({ message: 'Queue cleared.' });
  })
  .post('/leave', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const player = getPlayer(getGuildId());

    if (!player && !lavalink.isGuildConnected(getGuildId())) {
      return Response.json({ error: 'The bot is not in a voice channel.' }, { status: 409 });
    }

    if (player) {
      player.stop();
    }

    return Response.json({ message: 'Left the voice channel.' });
  })
  .post(
    '/loop',
    (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const { mode } = ctx.body as typeof LoopSchema.static;
      const playerResult = requirePlayer();
      if (!playerResult.ok) {
        return playerResult.response;
      }

      playerResult.player.setLoopMode(mode);
      return Response.json({ loopMode: mode });
    },
    { body: LoopSchema }
  )
  .post(
    '/override',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.override');
      if (adminErr) {
        return adminErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const body = ctx.body as typeof UrlSchema.static;
      const result = await resolveUrlTempSong(ctx, body);
      if (!result.ok) {
        return result.response;
      }
      await result.player.replaceQueueAndPlay([result.queuedSong]);
      return Response.json({
        message: `Now playing "${result.metadataTitle}".`,
        song: result.queuedSong,
      });
    },
    { body: UrlSchema }
  )
  .post('/pause-toggle', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const playingResult = requirePlaying();
    if (!playingResult.ok) {
      return playingResult.response;
    }

    const isPaused = playingResult.player.togglePause();
    return Response.json({ isPaused });
  })
  .post(
    '/play',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const body = ctx.body as typeof PlaySchema.static;
      const { playlistId, mode, loop, startFromSongId } = body;

      const discordId = (user as { discordId: string }).discordId;
      const playerResult = await resolveOrAutoJoinPlayer(discordId);
      if (!playerResult.ok) {
        return playerResult.response;
      }
      const player = playerResult.player;

      let dbSongs: (typeof songTable.$inferSelect)[];

      if (playlistId) {
        const playlist = await findPlaylistWithSongs(playlistId);

        if (!playlist) {
          return Response.json({ error: 'Playlist not found.' }, { status: 404 });
        }

        const accessResult = canAccessPlaylist(playlist, user ?? undefined);
        if (!accessResult.ok) {
          return Response.json({ error: accessResult.error }, { status: 403 });
        }

        dbSongs = playlist.songs.map((ps) => ps.song);
      } else {
        dbSongs = await db.select().from(songTable).orderBy(songTable.createdAt);
      }

      if (dbSongs.length === 0) {
        return Response.json({ error: 'No songs found to play.' }, { status: 422 });
      }

      if (startFromSongId) {
        const startIndex = dbSongs.findIndex((s) => s.id === startFromSongId);

        if (startIndex === -1) {
          return Response.json({ error: 'Start song not found in playlist.' }, { status: 404 });
        }

        dbSongs = [...dbSongs.slice(startIndex), ...dbSongs.slice(0, startIndex)];
      }

      if (mode === 'random') {
        fisherYatesShuffle(dbSongs);
      }

      const targetLoopMode = loop ?? player.getLoopMode();
      player.setLoopMode(targetLoopMode);

      const requestedBy = (user as { username: string }).username;
      const queuedSongs = dbSongs.map((song) =>
        toQueuedSong({ ...song, createdAt: song.createdAt.toISOString() }, requestedBy)
      );

      if (startFromSongId) {
        await player.replaceQueueAndPlay(queuedSongs);
      } else {
        await player.addToQueue(queuedSongs);
      }

      return Response.json({ message: `Queued ${queuedSongs.length} song(s).` });
    },
    { body: PlaySchema }
  )
  .post(
    '/quick-add',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.quickadd');
      if (adminErr) {
        return adminErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const body = ctx.body as typeof UrlSchema.static;
      const result = await resolveUrlTempSong(ctx, body);
      if (!result.ok) {
        return result.response;
      }
      await result.player.addToPriorityQueue(result.queuedSong);
      return Response.json({
        message: `Added "${result.metadataTitle}" to the queue.`,
        song: result.queuedSong,
      });
    },
    { body: UrlSchema }
  )
  .post(
    '/quick-add-playlist',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.quickadd');
      if (adminErr) {
        return adminErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const body = ctx.body as typeof QuickAddPlaylistSchema.static;
      const maxVideos = clampMaxVideos(body.maxVideos);
      const urlResult = validatePlaylistUrl(body.url);
      if (!urlResult.ok) {
        return urlResult.response;
      }
      const url = urlResult.value;

      const discordId = (user as { discordId: string }).discordId;
      const playerResult = await resolveOrAutoJoinPlayer(discordId);
      if (!playerResult.ok) {
        return playerResult.response;
      }
      const player = playerResult.player;

      const playlistResult = await fetchPlaylistMetadata(url, maxVideos);
      if (!playlistResult.ok) {
        return playlistResult.response;
      }
      const playlistMetadata = playlistResult.value;

      const requestedBy = (user as { username: string }).username;
      const addedBy = (user as { discordId: string }).discordId;
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

      return Response.json({
        message: `Added ${queuedSongs.length} song(s) from "${playlistMetadata.title}" to the queue.`,
        playlistTitle: playlistMetadata.title,
        totalVideos: playlistMetadata.videoCount,
        queuedCount: queuedSongs.length,
        songs: queuedSongs,
      });
    },
    { body: QuickAddPlaylistSchema }
  )
  .post(
    '/seek',
    async (ctx: Record<string, unknown>) => {
      const { user, isAdmin } = getAuth(ctx);
      const authErr = requireAuth({ user, isAdmin });
      if (authErr) {
        return authErr;
      }

      const voiceErr = guardVoice(ctx);
      if (voiceErr) {
        return voiceErr;
      }

      const { position } = ctx.body as typeof SeekSchema.static;

      const playingResult = requirePlaying();
      if (!playingResult.ok) {
        return playingResult.response;
      }

      await playingResult.player.seek(position);
      return Response.json(playingResult.player.getQueueState());
    },
    { body: SeekSchema }
  )
  .post('/shuffle', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
    if (adminErr) {
      return adminErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const player = getPlayer(getGuildId());

    if (!player || player.getQueue().length === 0) {
      return Response.json({ error: 'No songs in the queue to shuffle.' }, { status: 409 });
    }

    player.shuffle();
    return Response.json({ message: 'Queue shuffled.' });
  })
  .post('/skip', async (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const authErr = requireAuth({ user, isAdmin });
    if (authErr) {
      return authErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const playingResult = requirePlaying();
    if (!playingResult.ok) {
      return playingResult.response;
    }

    await playingResult.player.skip();
    return Response.json({ message: 'Skipped.' });
  })
  .post('/unshuffle', (ctx: Record<string, unknown>) => {
    const { user, isAdmin } = getAuth(ctx);
    const adminErr = requireAdminOrPermission({ user, isAdmin }, 'queue.manage');
    if (adminErr) {
      return adminErr;
    }

    const voiceErr = guardVoice(ctx);
    if (voiceErr) {
      return voiceErr;
    }

    const playerResult = requirePlayer();
    if (!playerResult.ok) {
      return playerResult.response;
    }

    playerResult.player.unshuffle();
    return Response.json({ message: 'Queue order restored.' });
  });
