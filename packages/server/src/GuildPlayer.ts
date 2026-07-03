import { eq } from 'drizzle-orm';
import { buildCompressorFilter } from './lib/applyNodeLinkFilter';
import { buildEqualizerFilter, EQ_BAND_COLUMNS, eqBandsFromRow } from './lib/eqBands';
import { lavalink, type TrackEndReason } from './lib/lavalink';
import { emitPlayerUpdate } from './lib/socket';
import { PlaybackCursor } from './PlaybackCursor';
import type { LoopMode, QueuedSong, QueueState } from './shared';
import { db, tables } from './shared/db';
import { logger } from './shared/logger';
import { connectToVoice, getClient } from './startDiscord';
import { destroyNodeLinkPlayer, preloadTrack, updateNodeLinkPlayer } from './utils/nodelink';

export class GuildPlayer {
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;

  private queue: PlaybackCursor<QueuedSong> = new PlaybackCursor();
  private priorityQueue: QueuedSong[] = [];
  private currentSong: QueuedSong | null = null;
  private loopMode: LoopMode = 'off';
  private paused = false;
  private stopping = false;
  private trackStartedAt: number | null = null;
  private pausedAt: number | null = null;
  private consecutiveFailures = 0;

  // Prevents concurrent playNext() invocations from different callers
  // (skip, trackEnd, addToQueue, etc.). Reentrant calls from
  // handlePlaybackFailure bypass this via playNextUnlocked().
  private playNextLock = false;

  // Set when TrackEndEvent reason is 'gapless' — NodeLink already
  // auto-started the next track. Cleared after playSong consumes it.
  private gaplessTransition = false;

  // Gapless preloading via NodeLink's nextTrack.
  // When enabled, the next track is preloaded into NodeLink so that a
  // gapless TrackEndEvent can transition without a cold-start load.
  // NodeLink v3.7.0 had a bug (~3s silence) in its gapless pipeline;
  // if the encoder issue recurs, set this to false and fall back to
  // cold-start loading for each track.
  // See: https://github.com/PerformanC/NodeLink/issues (TBD)
  private static readonly ENABLE_GAPLESS_PRELOAD = true;

  // Called when the voice session is torn down so the manager Map can
  // remove this GuildPlayer (see manager.ts).
  private readonly onDestroyed: () => void;

  // Lavalink event unsubscribe functions for teardown.
  private readonly _unsubTrackEnd: () => void;
  private readonly _unsubTrackError: () => void;
  private readonly _unsubSocketClosed: () => void;

  // Auto-leave idle timer.
  private idleLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  private async getIdleTimeoutMinutes(): Promise<number> {
    // Read from DB first (set via setup wizard or admin settings).
    try {
      const row = await db
        .select({ timeout: tables.guildSettings.voiceIdleTimeoutMinutes })
        .from(tables.guildSettings)
        .where(eq(tables.guildSettings.id, 1))
        .get();
      if (row && Number.isFinite(row.timeout) && row.timeout > 0) {
        return row.timeout;
      }
    } catch {
      // DB not available — fall through to env / default.
    }

    // Fall back to env var, then default.
    const raw = process.env.VOICE_IDLE_TIMEOUT_MINUTES;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  }

  private async scheduleIdleLeave(): Promise<void> {
    this.cancelIdleLeave();
    const minutes = await this.getIdleTimeoutMinutes();
    this.idleLeaveTimer = setTimeout(
      () => {
        this.leaveOnIdle().catch(() => {
          // noop — errors are already logged inside leaveOnIdle
        });
      },
      minutes * 60 * 1000
    );
  }

  private cancelIdleLeave(): void {
    if (this.idleLeaveTimer !== null) {
      clearTimeout(this.idleLeaveTimer);
      this.idleLeaveTimer = null;
    }
  }

  private readonly LEAVE_PHRASES = [
    '👋 "Fine, I\'ll leave."',
    '🚪 "I found something."',
    '💥 "Careful, I\'ve spotted a trap."',
    '✉️ Alfira has left the party.',
    '😵 Alfira was killed.',
    '💀 Alfira failed the last death saving throw.',
  ];

  private async leaveOnIdle(): Promise<void> {
    const timeoutMinutes = await this.getIdleTimeoutMinutes();
    logger.info(
      { guildId: this.guildId },
      `Auto-leaving voice channel after idle (${timeoutMinutes} minutes).`
    );
    const phrase = this.LEAVE_PHRASES[Math.floor(Math.random() * this.LEAVE_PHRASES.length)];
    logger.info({ guildId: this.guildId }, `${phrase} (Left the voice channel due to inactivity.)`);

    // Send notification to the configured channel, if any.
    try {
      const row = await db
        .select({ channelId: tables.guildSettings.afkNotificationChannelId })
        .from(tables.guildSettings)
        .where(eq(tables.guildSettings.id, 1))
        .get();

      if (row?.channelId) {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (token) {
          await fetch(`https://discord.com/api/v10/channels/${row.channelId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bot ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: phrase }),
          });
        }
      }
    } catch (err) {
      logger.warn({ err, guildId: this.guildId }, 'Failed to send idle-leave notification');
    }

    this.stop();
  }

  private readonly guildId: string;
  private readonly voiceId: string;

  /** The voice channel the bot is connected to, or empty string if not set. */
  public getVoiceId(): string {
    return this.voiceId;
  }

  /** Convenience: get the NodeLink session ID for REST calls. */
  private getSessionId(): string | null {
    return lavalink.getSessionId();
  }

  constructor(guildId: string, voiceId: string, onDestroyed: () => void) {
    this.guildId = guildId;
    this.voiceId = voiceId;
    this.onDestroyed = onDestroyed;

    // Subscribe to NodeLink events for this guild.
    // NodeLink emits TrackEndEvent for ALL track ends — no more
    // queueEnd vs trackEnd confusion.
    this._unsubTrackEnd = lavalink.onTrackEnd(this.guildId, (reason: TrackEndReason) => {
      // 'replaced' fires when a new track replaces the current one (normal).
      // 'stopped' fires when we explicitly stop/clear.
      if (reason === 'replaced' || reason === 'stopped') return;

      // NodeLink auto-started the next track via gapless preload — flag
      // this so playSong skips the expensive load-and-play path.
      if (reason === 'gapless') {
        this.gaplessTransition = true;
      }

      this.onTrackEnd().catch(() => {
        // errors logged in handlePlaybackFailure
      });
    });

    this._unsubTrackError = lavalink.onTrackError(
      this.guildId,
      (exception: { message?: string }) => {
        logger.error(
          { guildId: this.guildId, track: this.currentSong?.title ?? 'unknown' },
          `Player error: ${exception.message ?? 'unknown'}`
        );
      }
    );

    this._unsubSocketClosed = lavalink.onSocketClosed(
      this.guildId,
      (_code: number, _reason: string, _byRemote: boolean) => {
        this.onDestroyed();
        this.broadcast();
        // Clean up all event subscriptions.
        this._unsubTrackEnd();
        this._unsubTrackError();
        this._unsubSocketClosed();
      }
    );
  }

  private destroyPlayer(): void {
    const sessionId = this.getSessionId();
    if (sessionId) {
      destroyNodeLinkPlayer(this.guildId, sessionId);
    }

    // Force-reset playing state so a subsequent play sends a new track
    // instead of hitting the gapless-preload volume-only path.
    lavalink.markPlaying(this.guildId, false);
    lavalink.markConnected(this.guildId, false);

    // Tell Discord to leave the voice channel.
    const client = getClient();
    if (client) {
      const shardId = client.gateway.calculateShardId(this.guildId);
      client.gateway.send(shardId, {
        op: 4,
        d: {
          guild_id: this.guildId,
          channel_id: null,
          self_mute: false,
          self_deaf: false,
        },
      });
    }

    // Remove event handlers immediately so they don't fire for events
    // on the destroyed player. Keep socketClosed registered — it fires
    // when NodeLink confirms the destroy so the final broadcast can
    // include isConnectedToVoice=false.
    this._unsubTrackEnd();
    this._unsubTrackError();

    this.onDestroyed();
  }

  async addToQueue(songs: QueuedSong | QueuedSong[]): Promise<void> {
    const arr = Array.isArray(songs) ? songs : [songs];
    this.queue.append(...arr);

    // If paused, clear current song and stop the playing track via REST
    // so newly added songs start instead of the paused one resuming.
    if (this.paused && this.currentSong !== null) {
      const sessionId = this.getSessionId();
      if (sessionId) {
        await updateNodeLinkPlayer(this.guildId, sessionId, {
          track: { encoded: null },
          paused: false,
        });
      }
      this.currentSong = null;
    }

    await this.ensurePlaying();
    this.cancelIdleLeave();
  }

  async addToPriorityQueue(song: QueuedSong): Promise<void> {
    this.priorityQueue.push(song);
    await this.ensurePlaying();
  }

  async replaceQueueAndPlay(songs: QueuedSong[]): Promise<void> {
    // Stop the currently-playing track cleanly before replacing the queue.
    const sessionId = this.getSessionId();
    if (sessionId) {
      await updateNodeLinkPlayer(this.guildId, sessionId, {
        track: { encoded: null },
        paused: false,
      });
    }

    this.queue.clear();
    this.priorityQueue = [];
    this.currentSong = null;
    this.paused = false;
    this.consecutiveFailures = 0;
    this.queue.replace(songs);
    this.cancelIdleLeave();

    await this.playNext();
    this.broadcast();
  }

  async skip(): Promise<void> {
    if (this.currentSong === null) return;

    // Stop the current track via REST.
    const sessionId = this.getSessionId();
    if (sessionId) {
      await updateNodeLinkPlayer(this.guildId, sessionId, {
        track: { encoded: null },
        paused: false,
      });
    }

    this.paused = false;
    await this.playNext();
  }

  stop(): void {
    this.stopping = true;
    this.cancelIdleLeave();
    this.currentSong = null;
    this.queue.clear();
    this.priorityQueue = [];
    this.paused = false;
    this.trackStartedAt = null;

    this.destroyPlayer();
    this.broadcast();
  }

  clearQueue(): void {
    this.queue.clear();
    this.broadcast();
  }

  shuffle(): void {
    this.queue.shuffle();
    this.broadcast();
  }

  unshuffle(): void {
    this.queue.unshuffle();
    this.broadcast();
  }

  /**
   * Remove a song from either the priority queue or the regular queue
   * by its unique queue-entry id. Returns true if a song was found and removed.
   */
  removeSongById(songId: string): boolean {
    // Check priority queue first
    const prioIdx = this.priorityQueue.findIndex((s) => s.id === songId);
    if (prioIdx !== -1) {
      this.priorityQueue.splice(prioIdx, 1);
      this.broadcast();
      return true;
    }

    // Check regular queue
    const removed = this.queue.removeWhere((s) => s.id === songId);
    if (removed.length > 0) {
      this.broadcast();
      return true;
    }

    return false;
  }

  /**
   * Promote a song from the regular queue to the priority queue
   * ("Promote to Up Next"). Songs are appended in promotion order so the
   * first-promoted song plays first. Returns true if found and promoted.
   */
  promoteSong(songId: string): boolean {
    const removed = this.queue.removeWhere((s) => s.id === songId);
    if (removed.length === 0) return false;

    // Push to the end of priority — earlier promotions play first
    this.priorityQueue.push(...removed);

    this.broadcast();
    return true;
  }

  /**
   * Demote a song from the priority queue back to the front of the regular
   * queue. Returns true if the song was found and demoted.
   */
  demoteSong(songId: string): boolean {
    const prioIdx = this.priorityQueue.findIndex((s) => s.id === songId);
    if (prioIdx === -1) return false;

    // Remove from priority and insert at the front of the regular queue
    // so it plays first among unplayed regular songs.
    const [song] = this.priorityQueue.splice(prioIdx, 1);
    if (song) {
      this.queue.insertAtFront(song);
    }

    this.broadcast();
    return true;
  }

  /**
   * Reorder the remaining regular-queue items to match the given songId order.
   * The array must contain exactly the IDs of all currently-remaining queue
   * items (no more, no less). Unshuffles the queue.
   */
  reorderQueue(songIds: string[]): void {
    const remaining = this.queue.toRemaining();

    // Build reordered array by looking up each songId in remaining
    const remainingById = new Map(remaining.map((s) => [s.id, s]));
    const reordered: QueuedSong[] = [];

    for (const id of songIds) {
      const song = remainingById.get(id);
      if (!song) {
        throw new Error(`Reorder references unknown song id: ${id}`);
      }
      reordered.push(song);
    }

    if (reordered.length !== remaining.length) {
      throw new Error('Reorder must include all queue items');
    }

    this.queue.reorderRemaining(reordered, (a, b) => a.id === b.id);
    this.broadcast();
  }

  /**
   * Reorder the priority queue to match the given songId order.
   * The array must contain exactly the IDs of all current priority queue
   * items (no more, no less).
   */
  reorderPriorityQueue(songIds: string[]): void {
    const byId = new Map(this.priorityQueue.map((s) => [s.id, s]));
    const reordered: QueuedSong[] = [];

    for (const id of songIds) {
      const song = byId.get(id);
      if (!song) {
        throw new Error(`Reorder references unknown song id: ${id}`);
      }
      reordered.push(song);
    }

    if (reordered.length !== this.priorityQueue.length) {
      throw new Error('Reorder must include all Up Next items');
    }

    this.priorityQueue = reordered;
    this.broadcast();
  }

  setLoopMode(mode: LoopMode): void {
    this.loopMode = mode;
    // Loop is tracked client-side — NodeLink has no loop opcode.
    this.broadcast();
  }

  async togglePause(): Promise<boolean> {
    if (!this.currentSong) return false;

    const sessionId = this.getSessionId();
    if (!sessionId) return false;

    if (this.paused) {
      this.cancelIdleLeave();
      if (this.pausedAt !== null) {
        const pauseDuration = Date.now() - this.pausedAt;
        if (this.trackStartedAt !== null) {
          this.trackStartedAt += pauseDuration;
        }
        this.pausedAt = null;
      }
      await updateNodeLinkPlayer(this.guildId, sessionId, { paused: false });
      this.paused = false;
    } else {
      this.pausedAt = Date.now();
      await updateNodeLinkPlayer(this.guildId, sessionId, { paused: true });
      this.paused = true;
      await this.scheduleIdleLeave();
    }

    this.broadcast();
    return this.paused;
  }

  async seek(positionMs: number): Promise<void> {
    if (!this.currentSong) return;

    const sessionId = this.getSessionId();
    if (!sessionId) return;

    const durationMs = this.currentSong.duration * 1000;
    const clampedMs = Math.max(0, Math.min(positionMs, durationMs));

    await updateNodeLinkPlayer(this.guildId, sessionId, { position: clampedMs });

    this.trackStartedAt = Date.now() - clampedMs;
    if (this.paused && this.pausedAt !== null) {
      this.pausedAt = Date.now() - clampedMs;
    }

    this.broadcast();
  }

  getCurrentSong(): QueuedSong | null {
    return this.currentSong;
  }

  public updateVolumeBoost(boost: number): void {
    if (!this.currentSong) return;

    const sessionId = this.getSessionId();
    if (!sessionId) return;

    updateNodeLinkPlayer(this.guildId, sessionId, {
      volume: 100 + boost,
    });
  }

  getQueue(): QueuedSong[] {
    return this.queue.toRemaining();
  }

  getLoopMode(): LoopMode {
    return this.loopMode;
  }

  isPlaying(): boolean {
    if (this.currentSong === null || this.paused) return false;
    return true;
  }

  getQueueState(): QueueState {
    return {
      isPlaying: this.isPlaying(),
      isPaused: this.paused,
      isConnectedToVoice: lavalink.isGuildConnected(this.guildId),
      loopMode: this.loopMode,
      isShuffled: this.queue.isShuffled,
      currentSong: this.currentSong,
      priorityQueue: this.priorityQueue,
      queue: this.queue.toRemaining(),
      trackStartedAt: this.trackStartedAt,
      nextTrack: this.peekNextTrack(),
    };
  }

  private async ensurePlaying(): Promise<void> {
    if (this.currentSong === null) {
      await this.playNext();
    } else {
      this.broadcast();
    }
  }

  private broadcast(): void {
    void emitPlayerUpdate(this.getQueueState());
  }

  private peekNextTrack(): QueuedSong | null {
    if (this.priorityQueue.length > 0) {
      return this.priorityQueue[0] ?? null;
    }

    if (this.loopMode === 'song' && this.currentSong) {
      return this.currentSong;
    }

    if (this.queue.isAtEnd) {
      if (this.loopMode === 'queue' && !this.queue.isEmpty) {
        return this.queue.current() as QueuedSong | null;
      }
      return null;
    }

    return this.queue.current() as QueuedSong | null;
  }

  private async playNext(): Promise<void> {
    if (this.playNextLock) return;
    this.playNextLock = true;
    try {
      await this.playNextUnlocked();
    } finally {
      this.playNextLock = false;
    }
  }

  private async playNextUnlocked(): Promise<void> {
    // Re-establish voice connection if needed.
    if (!lavalink.isGuildConnected(this.guildId) && this.voiceId) {
      await connectToVoice(this.guildId, this.voiceId);
    }

    const prioritySong = this.priorityQueue.shift();
    if (prioritySong) {
      this.currentSong = prioritySong;
      if (this.currentSong) {
        this.currentSong = { ...this.currentSong, isSeekable: true };
      }
      this.paused = false;
      await this.playSong(prioritySong);
      return;
    }

    if (this.queue.isAtEnd) {
      if (this.loopMode === 'queue' && !this.queue.isEmpty) {
        this.queue.reset();
      } else if (this.loopMode === 'song' && this.currentSong) {
        await this.playSong(this.currentSong);
        return;
      } else {
        this.currentSong = null;
        this.queue.clear();
        this.broadcast();
        await this.scheduleIdleLeave();
        return;
      }
    }

    if (this.loopMode === 'song' && this.currentSong) {
      await this.playSong(this.currentSong);
      return;
    }

    const next = this.queue.current();
    if (!next) {
      this.currentSong = null;
      this.broadcast();
      return;
    }

    this.currentSong = next;
    if (this.currentSong) {
      this.currentSong = { ...this.currentSong, isSeekable: true };
    }
    this.queue.advance();

    await this.playSong(next);
  }

  private async playSong(next: QueuedSong): Promise<void> {
    this.cancelIdleLeave();
    this.paused = false;

    const sessionId = this.getSessionId();
    if (!sessionId) {
      await this.handlePlaybackFailure('NodeLink session not available');
      return;
    }

    // Load guild settings once for both code paths.
    const settings = await db
      .select({
        enabled: tables.guildSettings.compressorEnabled,
        threshold: tables.guildSettings.compressorThreshold,
        ratio: tables.guildSettings.compressorRatio,
        attack: tables.guildSettings.compressorAttack,
        release: tables.guildSettings.compressorRelease,
        gain: tables.guildSettings.compressorGain,
        ...EQ_BAND_COLUMNS,
      })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get();

    // If the TrackEndEvent had reason 'gapless', NodeLink already
    // auto-started the next track.  Skip the expensive load-and-play
    // path; just update volume and re-apply filters.
    if (this.gaplessTransition) {
      this.gaplessTransition = false;
      const t0 = Date.now();
      logger.info(
        { guildId: this.guildId, track: next.title },
        'playSong: already playing (gapless preload) — applying settings via REST'
      );

      // Build a single PATCH payload combining volume and any active
      // filters so NodeLink processes everything in one round-trip.
      const patch: Record<string, unknown> = {
        volume: 100 + (next.volumeBoost ?? 0),
      };

      if (settings?.enabled) {
        try {
          const compressorFilter = buildCompressorFilter(settings);
          patch.filters = { ...(patch.filters as Record<string, unknown>), ...compressorFilter };
        } catch (err) {
          logger.error({ err, guildId: this.guildId }, 'Failed to build compressor filter');
        }
      }

      const eqBands = eqBandsFromRow(settings);
      if (eqBands.some((b) => b !== 50)) {
        try {
          const equalizerFilter = buildEqualizerFilter(eqBands);
          patch.filters = {
            ...(patch.filters as Record<string, unknown>),
            equalizer: equalizerFilter,
          };
        } catch (err) {
          logger.error({ err, guildId: this.guildId }, 'Failed to build equalizer filter');
        }
      }

      const t1 = Date.now();
      await updateNodeLinkPlayer(
        this.guildId,
        sessionId,
        patch as Parameters<typeof updateNodeLinkPlayer>[2]
      );
      const t2 = Date.now();

      this.consecutiveFailures = 0;
      this.trackStartedAt = Date.now();
      this.pausedAt = null;
      this.broadcast();
      const t3 = Date.now();

      logger.info(
        {
          guildId: this.guildId,
          track: next.title,
          buildMs: t1 - t0,
          patchMs: t2 - t1,
          broadcastMs: t3 - t2,
          totalMs: t3 - t0,
        },
        'playSong: gapless timings'
      );

      // Gapless preload for the next track.
      if (GuildPlayer.ENABLE_GAPLESS_PRELOAD) {
        this.preloadNextTrack(sessionId);
      }
      return;
    }

    // Gapless preload did not work — full load-and-play path.
    const tCold0 = Date.now();
    logger.info({ guildId: this.guildId, track: next.title }, 'playSong: starting playback');

    let trackData: { track: string; isWebmOpus: boolean };

    try {
      trackData = await this.fetchStreamWithRetry(next.sourceUrl);
    } catch (error) {
      logger.error(
        { guildId: this.guildId, track: next.title, error },
        'Failed to get stream URL after 3 attempts'
      );
      await this.handlePlaybackFailure('could not load the track from NodeLink');
      return;
    }
    const tCold1 = Date.now();

    // Ensure voice connection is established.
    if (!lavalink.isGuildConnected(this.guildId)) {
      if (!this.voiceId) {
        logger.error({ guildId: this.guildId }, 'Cannot play: no voiceId set');
        await this.handlePlaybackFailure('not connected to a voice channel');
        return;
      }
      await connectToVoice(this.guildId, this.voiceId);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const tCold2 = Date.now();

    const volume = 100 + (next.volumeBoost ?? 0);

    await updateNodeLinkPlayer(this.guildId, sessionId, {
      track: { encoded: trackData.track },
      volume,
    });
    const tCold3 = Date.now();

    // Apply compressor filter if enabled (shared path).
    if (settings?.enabled) {
      try {
        await updateNodeLinkPlayer(this.guildId, sessionId, {
          filters: buildCompressorFilter(settings),
        });
      } catch (err) {
        logger.error(
          { err, guildId: this.guildId },
          'Failed to apply compressor filter on playback start'
        );
      }
    }

    // Apply equalizer filter if any band is non-neutral (shared path).
    const eqBands = eqBandsFromRow(settings);
    if (eqBands.some((b) => b !== 50)) {
      try {
        const equalizerFilter = buildEqualizerFilter(eqBands);
        await updateNodeLinkPlayer(this.guildId, sessionId, {
          filters: {
            equalizer: equalizerFilter,
          },
        });
      } catch (err) {
        logger.error(
          { err, guildId: this.guildId },
          'Failed to apply equalizer filter on playback start'
        );
      }
    }

    this.consecutiveFailures = 0;
    this.trackStartedAt = Date.now();
    this.pausedAt = null;
    this.broadcast();

    // Gapless preload for the next track.
    if (GuildPlayer.ENABLE_GAPLESS_PRELOAD) {
      this.preloadNextTrack(sessionId);
    }

    logger.info(
      {
        guildId: this.guildId,
        track: next.title,
        loadMs: tCold1 - tCold0,
        voiceMs: tCold2 - tCold1,
        playPatchMs: tCold3 - tCold2,
        totalMs: Date.now() - tCold0,
      },
      'playSong: cold-start timings'
    );
  }

  private preloadNextTrack(sessionId: string): void {
    const nextTrack = this.peekNextTrack();
    if (!nextTrack) return;

    preloadTrack(this.guildId, sessionId, nextTrack.sourceUrl).catch((err) => {
      logger.warn({ guildId: this.guildId, track: nextTrack.title, err }, 'Gapless preload failed');
    });
  }

  private async fetchStreamWithRetry(
    sourceUrl: string
  ): Promise<{ track: string; isWebmOpus: boolean }> {
    const RETRY_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1_000;
    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const { getStreamFormat } = await import('./utils/nodelink');
        return await getStreamFormat(sourceUrl);
      } catch (error) {
        lastError = error;
        if (attempt < RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    throw lastError;
  }

  private async handlePlaybackFailure(skipMessage: string): Promise<void> {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= GuildPlayer.MAX_CONSECUTIVE_FAILURES) {
      logger.error(
        { guildId: this.guildId, song: this.currentSong?.title },
        'Max consecutive failures reached — stopping playback.'
      );
      this.stop();
      return;
    }
    logger.warn(
      { guildId: this.guildId, song: this.currentSong?.title },
      `Skipping song — ${skipMessage}`
    );
    await this.playNextUnlocked();
  }

  private async onTrackEnd(): Promise<void> {
    if (this.playNextLock) return;

    this.trackStartedAt = null;
    this.pausedAt = null;

    if (this.stopping) {
      this.stopping = false;
      return;
    }

    if (!this.currentSong) return;

    await this.playNext();
  }
}
