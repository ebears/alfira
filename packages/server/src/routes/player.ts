import type { GuildPlayer } from '../GuildPlayer';
import type { RouteContext } from '../index';
import { getGuildId } from '../lib/config';
import { json } from '../lib/json';
import { lavalink } from '../lib/lavalink';
import { requirePlayer, requirePlaying } from '../lib/player';
import { canAccessPlaylist } from '../lib/playlistAccess';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../lib/rateLimit';
import { checkGuards } from '../lib/routeGuards';
import {
  clampMaxVideos,
  fetchPlaylistMetadata,
  fetchYouTubeMetadata,
  validateYouTubePlaylistUrl,
  validateYouTubeUrl,
  youTubeUrl,
} from '../lib/validation';
import { resolveOrAutoJoinPlayer } from '../lib/voice';
import {
  fisherYatesShuffle as fisherYatesShuffleImpl,
  type LoopMode,
  type QueuedSong,
  toQueuedSong,
} from '../shared';
import { db, eq, findPlaylistWithSongs, tables } from '../shared/db';
import { getPlayer } from '../startDiscord';

const { song: songTable } = tables;

// ---------------------------------------------------------------------------
// GET /api/player/queue — returns current queue state
// ---------------------------------------------------------------------------
function handleGetQueue(ctx: RouteContext): Response {
  const guards = checkGuards(ctx);
  if (guards instanceof Response) return guards;

  const player = getPlayer(getGuildId());

  if (!player) {
    return json({
      isPlaying: false,
      isPaused: false,
      isConnectedToVoice: lavalink.isGuildConnected(getGuildId()),
      loopMode: 'off',
      isShuffled: false,
      currentSong: null,
      priorityQueue: [],
      queue: [],
      trackStartedAt: null,
    });
  }

  return json(player.getQueueState());
}

// ---------------------------------------------------------------------------
// POST /api/player/play — load songs and start playback
// ---------------------------------------------------------------------------
async function handlePlay(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { voice: true });
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: {
    playlistId?: string;
    mode?: 'sequential' | 'random';
    loop?: LoopMode;
    startFromSongId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { playlistId, mode, loop, startFromSongId } = body;

  const playerResult = await resolveOrAutoJoinPlayer(user.discordId);
  if (!playerResult.ok) return playerResult.response;
  const player = playerResult.player;

  let dbSongs: (typeof songTable.$inferSelect)[];

  if (playlistId) {
    const playlist = await findPlaylistWithSongs(playlistId);

    if (!playlist) {
      return json({ error: 'Playlist not found.' }, 404);
    }

    const accessResult = canAccessPlaylist(playlist, user, undefined);
    if (!accessResult.ok) {
      return json({ error: accessResult.error }, 403);
    }

    dbSongs = playlist.songs.map((ps) => ps.song);
  } else {
    dbSongs = await db.select().from(songTable).orderBy(songTable.createdAt);
  }

  if (dbSongs.length === 0) {
    return json({ error: 'No songs found to play.' }, 422);
  }

  if (startFromSongId) {
    const startIndex = dbSongs.findIndex((s) => s.id === startFromSongId);

    if (startIndex === -1) {
      return json({ error: 'Start song not found in playlist.' }, 404);
    }

    dbSongs = [...dbSongs.slice(startIndex), ...dbSongs.slice(0, startIndex)];
  }

  if (mode === 'random') {
    fisherYatesShuffleImpl(dbSongs);
  }

  const targetLoopMode = loop ?? player.getLoopMode();
  player.setLoopMode(targetLoopMode);

  const requestedBy = user.username;
  const queuedSongs = dbSongs.map((song) =>
    toQueuedSong({ ...song, createdAt: song.createdAt.toISOString() }, requestedBy)
  );

  if (startFromSongId) {
    await player.replaceQueueAndPlay(queuedSongs);
  } else {
    await player.addToQueue(queuedSongs);
  }

  return json({ message: `Queued ${queuedSongs.length} song(s).` });
}

// ---------------------------------------------------------------------------
// POST /api/player/skip — skip current song
// ---------------------------------------------------------------------------
async function handleSkip(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { voice: true });
  if (guards instanceof Response) return guards;

  const playingResult = requirePlaying();
  if (!playingResult.ok) return playingResult.response;

  await playingResult.player.skip();
  return json({ message: 'Skipped.' });
}

// ---------------------------------------------------------------------------
// POST /api/player/leave — stop and disconnect
// ---------------------------------------------------------------------------
async function handleLeave(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { voice: true });
  if (guards instanceof Response) return guards;

  const player = getPlayer(getGuildId());

  if (!player && !lavalink.isGuildConnected(getGuildId())) {
    return json({ error: 'The bot is not in a voice channel.' }, 409);
  }

  if (player) player.stop();

  return json({ message: 'Left the voice channel.' });
}

// ---------------------------------------------------------------------------
// POST /api/player/loop — set loop mode
// ---------------------------------------------------------------------------
async function handleLoop(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { voice: true });
  if (guards instanceof Response) return guards;

  let body: { mode?: LoopMode };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { mode } = body;

  if (!mode || !['off', 'song', 'queue'].includes(mode)) {
    return json({ error: 'mode must be "off", "song", or "queue".' }, 400);
  }

  const playerResult = requirePlayer();
  if (!playerResult.ok) return playerResult.response;

  playerResult.player.setLoopMode(mode);
  return json({ loopMode: mode });
}

// ---------------------------------------------------------------------------
// POST /api/player/shuffle — shuffle queue (admin only)
// ---------------------------------------------------------------------------
async function handleShuffle(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, voice: true });
  if (guards instanceof Response) return guards;

  const player = getPlayer(getGuildId());

  if (!player || player.getQueue().length === 0) {
    return json({ error: 'No songs in the queue to shuffle.' }, 409);
  }

  player.shuffle();
  return json({ message: 'Queue shuffled.' });
}

// ---------------------------------------------------------------------------
// POST /api/player/unshuffle — restore original queue order (admin only)
// ---------------------------------------------------------------------------
async function handleUnshuffle(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, voice: true });
  if (guards instanceof Response) return guards;

  const playerResult = requirePlayer();
  if (!playerResult.ok) return playerResult.response;

  playerResult.player.unshuffle();
  return json({ message: 'Queue order restored.' });
}

// ---------------------------------------------------------------------------
// Shared: resolve a YouTube URL into a temp QueuedSong with player ready
// ---------------------------------------------------------------------------

type YoutubeTempSongResult =
  | { ok: true; player: GuildPlayer; queuedSong: QueuedSong; metadataTitle: string }
  | { ok: false; response: Response };

async function resolveYoutubeTempSong(
  ctx: RouteContext,
  request: Request
): Promise<YoutubeTempSongResult> {
  const guards = await checkGuards(ctx, { admin: true, voice: true });
  if (guards instanceof Response) return { ok: false, response: guards };
  const { user } = guards;

  let body: { youtubeUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { ok: false, response: json({ error: 'Invalid JSON body.' }, 400) };
  }

  const urlResult = validateYouTubeUrl(body.youtubeUrl);
  if (!urlResult.ok) return { ok: false, response: urlResult.response };
  const url = urlResult.value;

  const playerResult = await resolveOrAutoJoinPlayer(user.discordId);
  if (!playerResult.ok) return { ok: false, response: playerResult.response };
  const player = playerResult.player;

  const metadataResult = await fetchYouTubeMetadata(url);
  if (!metadataResult.ok) return { ok: false, response: metadataResult.response };
  const metadata = metadataResult.value;

  const queuedSong: QueuedSong = {
    id: `temp-${Date.now()}`,
    title: metadata.title,
    youtubeUrl: url,
    youtubeId: metadata.youtubeId,
    duration: metadata.duration,
    thumbnailUrl: metadata.thumbnailUrl ?? '',
    addedBy: user.discordId,
    createdAt: new Date().toISOString(),
    requestedBy: user.username,
  };

  return { ok: true, player, queuedSong, metadataTitle: metadata.title };
}

// ---------------------------------------------------------------------------
// POST /api/player/quick-add — add YouTube URL to priority queue (admin only)
// ---------------------------------------------------------------------------
async function handleQuickAdd(ctx: RouteContext, request: Request): Promise<Response> {
  const result = await resolveYoutubeTempSong(ctx, request);
  if (!result.ok) return result.response;
  await result.player.addToPriorityQueue(result.queuedSong);
  return json({
    message: `Added "${result.metadataTitle}" to the queue.`,
    song: result.queuedSong,
  });
}

// ---------------------------------------------------------------------------
// POST /api/player/quick-add-playlist — add playlist to queue (admin only)
// ---------------------------------------------------------------------------
async function handleQuickAddPlaylist(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, voice: true });
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { youtubeUrl?: unknown; maxVideos?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const maxVideos = clampMaxVideos(body.maxVideos);
  const urlResult = validateYouTubePlaylistUrl(body.youtubeUrl);
  if (!urlResult.ok) return urlResult.response;
  const url = urlResult.value;

  const playerResult = await resolveOrAutoJoinPlayer(user.discordId);
  if (!playerResult.ok) return playerResult.response;
  const player = playerResult.player;

  const playlistResult = await fetchPlaylistMetadata(url, maxVideos);
  if (!playlistResult.ok) return playlistResult.response;
  const playlistMetadata = playlistResult.value;

  const requestedBy = user.username;
  const addedBy = user.discordId;
  const queuedSongs = playlistMetadata.videos.map((video) => ({
    id: `temp-${Date.now()}-${video.id}`,
    title: video.title,
    youtubeUrl: youTubeUrl(video.id),
    youtubeId: video.id,
    duration: video.duration,
    thumbnailUrl: video.thumbnailUrl,
    addedBy,
    createdAt: new Date().toISOString(),
    requestedBy,
  }));

  await player.addToQueue(queuedSongs);

  return json({
    message: `Added ${queuedSongs.length} song(s) from "${playlistMetadata.title}" to the queue.`,
    playlistTitle: playlistMetadata.title,
    totalVideos: playlistMetadata.videoCount,
    queuedCount: queuedSongs.length,
    songs: queuedSongs,
  });
}

// ---------------------------------------------------------------------------
// POST /api/player/pause-toggle — pause/resume
// ---------------------------------------------------------------------------
async function handlePauseToggle(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { voice: true });
  if (guards instanceof Response) return guards;

  const playingResult = requirePlaying();
  if (!playingResult.ok) return playingResult.response;

  const isPaused = playingResult.player.togglePause();
  return json({ isPaused });
}

// ---------------------------------------------------------------------------
// POST /api/player/seek — seek to position in current track
// ---------------------------------------------------------------------------
async function handleSeek(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { voice: true });
  if (guards instanceof Response) return guards;

  let body: { position?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { position } = body;

  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0) {
    return json({ error: 'position must be a non-negative number (milliseconds).' }, 400);
  }

  const playingResult = requirePlaying();
  if (!playingResult.ok) return playingResult.response;

  await playingResult.player.seek(position);
  return json(playingResult.player.getQueueState());
}

// ---------------------------------------------------------------------------
// POST /api/player/clear — clear queue (admin only)
// ---------------------------------------------------------------------------
async function handleClear(ctx: RouteContext): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, voice: true });
  if (guards instanceof Response) return guards;

  const playerResult = requirePlayer();
  if (!playerResult.ok) return playerResult.response;

  playerResult.player.clearQueue();
  return json({ message: 'Queue cleared.' });
}

// ---------------------------------------------------------------------------
// POST /api/player/add-to-priority — add library song to Up Next (admin only)
// ---------------------------------------------------------------------------
async function handleAddToPriority(ctx: RouteContext, request: Request): Promise<Response> {
  const guards = await checkGuards(ctx, { admin: true, voice: true });
  if (guards instanceof Response) return guards;
  const { user } = guards;

  let body: { songId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { songId } = body;

  if (!songId || typeof songId !== 'string') {
    return json({ error: 'songId is required.' }, 400);
  }

  const [song] = await db.select().from(songTable).where(eq(songTable.id, songId)).limit(1);

  if (!song) {
    return json({ error: 'Song not found.' }, 404);
  }

  const playerResult = await resolveOrAutoJoinPlayer(user.discordId);
  if (!playerResult.ok) return playerResult.response;
  const player = playerResult.player;

  const requestedBy = user.username;
  const queuedSong = toQueuedSong(
    { ...song, createdAt: song.createdAt.toISOString() },
    requestedBy
  );
  // Generate a unique queue-entry id so duplicate adds of the same
  // library song produce distinguishable entries (the frontend skip
  // busy-state detection relies on currentSong.id changing on skip).
  queuedSong.id = `queue-${Date.now()}-${song.id}`;

  await player.addToPriorityQueue(queuedSong);

  return json({
    message: `Added "${song.nickname || song.title}" to Up Next.`,
    song: queuedSong,
  });
}

// ---------------------------------------------------------------------------
// POST /api/player/override — immediately play YouTube URL (admin only)
// ---------------------------------------------------------------------------
async function handleOverride(ctx: RouteContext, request: Request): Promise<Response> {
  const result = await resolveYoutubeTempSong(ctx, request);
  if (!result.ok) return result.response;
  await result.player.replaceQueueAndPlay([result.queuedSong]);
  return json({
    message: `Now playing "${result.metadataTitle}".`,
    song: result.queuedSong,
  });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handlePlayer(ctx: RouteContext, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Strip /api/player prefix
  const path = pathname.slice('/api/player'.length);

  // Rate-limit mutation endpoints — 30 requests per 60s per IP.
  // GET /queue is exempt to allow the UI to poll freely.
  if (request.method !== 'GET') {
    const ip = getClientIp(request);
    if (!checkRateLimit('player-mutations', ip, { windowMs: 60_000, maxRequests: 30 })) {
      return rateLimitResponse(60);
    }
  }

  if (path === '/queue' && request.method === 'GET') return await handleGetQueue(ctx);
  if (path === '/play' && request.method === 'POST') return await handlePlay(ctx, request);
  if (path === '/skip' && request.method === 'POST') return await handleSkip(ctx);
  if (path === '/leave' && request.method === 'POST') return await handleLeave(ctx);
  if (path === '/loop' && request.method === 'POST') return await handleLoop(ctx, request);
  if (path === '/shuffle' && request.method === 'POST') return await handleShuffle(ctx);
  if (path === '/unshuffle' && request.method === 'POST') return await handleUnshuffle(ctx);
  if (path === '/quick-add' && request.method === 'POST') return await handleQuickAdd(ctx, request);
  if (path === '/quick-add-playlist' && request.method === 'POST')
    return await handleQuickAddPlaylist(ctx, request);
  if (path === '/pause-toggle' && request.method === 'POST') return await handlePauseToggle(ctx);
  if (path === '/seek' && request.method === 'POST') return await handleSeek(ctx, request);
  if (path === '/clear' && request.method === 'POST') return await handleClear(ctx);
  if (path === '/add-to-priority' && request.method === 'POST')
    return await handleAddToPriority(ctx, request);
  if (path === '/override' && request.method === 'POST') return await handleOverride(ctx, request);

  return json({ error: 'Not Found' }, 404);
}
