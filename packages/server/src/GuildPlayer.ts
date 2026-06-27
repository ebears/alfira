import { eq } from 'drizzle-orm';
import { DestroyReasons, type Player, SourceNames, Track, type TrackEndEvent } from 'hoshimi';
import { PlaybackCursor } from './PlaybackCursor';
import type { LoopMode, QueuedSong, QueueState } from './shared';
import { db, tables } from './shared/db';
import { logger } from './shared/logger';
import { broadcastQueueUpdate, getHoshimi } from './startDiscord';

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

  // Auto-leave idle timer.
  private idleLeaveTimer: ReturnType<typeof setTimeout> | null = null;

  private getIdleTimeoutMinutes(): number {
    const raw = process.env.VOICE_IDLE_TIMEOUT_MINUTES;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  }

  private scheduleIdleLeave(): void {
    this.cancelIdleLeave();
    const minutes = this.getIdleTimeoutMinutes();
    this.idleLeaveTimer = setTimeout(() => this.leaveOnIdle(), minutes * 60 * 1000);
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

  private leaveOnIdle(): void {
    logger.info(
      { guildId: this.guildId },
      `Auto-leaving voice channel after idle (${this.getIdleTimeoutMinutes()} minutes).`
    );
    const phrase = this.LEAVE_PHRASES[Math.floor(Math.random() * this.LEAVE_PHRASES.length)];
    logger.info({ guildId: this.guildId }, `${phrase} (Left the voice channel due to inactivity.)`);
    this.destroyPlayer();
  }

  private readonly guildId: string;
  private readonly voiceId: string;

  private unpause(): void {
    const hoshimi = getHoshimi();
    if (!hoshimi) return;
    const player = hoshimi.players.get(this.guildId);
    if (player) {
      player.setPaused(false);
    }
    this.paused = false;
  }

  constructor(guildId: string, voiceId: string, _onDestroyed: () => void) {
    this.guildId = guildId;
    this.voiceId = voiceId;

    // Register event handlers on the Hoshimi manager for this player's events.
    const hoshimi = getHoshimi();
    if (hoshimi) {
      hoshimi.on('trackEnd', (player: Player, track: unknown, payload: TrackEndEvent) => {
        if (player.guildId !== this.guildId) return;
        if (payload.reason === 'replaced') return;
        void track;
        this.onTrackEnd().catch(() => {
          // swallow errors — they are logged in handlePlaybackFailure
        });
      });
      hoshimi.on('trackError', (player: Player, track: unknown, exception: unknown) => {
        if (player.guildId !== this.guildId) return;
        const exc = exception as { exception?: { message?: string } };
        logger.error(
          { guildId: this.guildId, track: this.currentSong?.title ?? 'unknown' },
          `Player error: ${exc.exception?.message ?? 'unknown'}`
        );
        void track;
      });
      hoshimi.on('playerDestroy', (player: Player) => {
        if (player.guildId !== this.guildId) return;
        this.broadcast();
      });
    }
  }

  private hoshimiPlayer() {
    return getHoshimi()?.players.get(this.guildId);
  }

  private destroyPlayer(): void {
    const hoshimi = getHoshimi();
    if (!hoshimi) return;
    const player = hoshimi.players.get(this.guildId);
    if (player) {
      player.destroy(DestroyReasons.Requested);
    }
  }

  async addToQueue(songs: QueuedSong | QueuedSong[]): Promise<void> {
    const arr = Array.isArray(songs) ? songs : [songs];
    this.queue.append(...arr);

    // If paused, clear currentSong so newly added songs start playing
    // instead of the previously-paused song resuming.
    if (this.paused && this.currentSong !== null) {
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
    this.queue.clear();
    this.priorityQueue = [];
    this.currentSong = null;
    this.paused = false;
    this.consecutiveFailures = 0;
    this.queue.replace(songs);
    this.cancelIdleLeave();

    // Note: we intentionally do NOT call player.stop() here. Calling stop(true)
    // destroys the Hoshimi player, which sends a DELETE to NodeLink and clears its
    // stored voice session (endpoint/sessionId/token). When the subsequent
    // play() call then tries to play a new track, NodeLink has no voice state and
    // logs "No voice state, track is enqueued". Instead, let playNext() call
    // playSong() which will call play() on the existing player, replacing the
    // track without destroying the voice session.

    await this.playNext();
    this.broadcast();
  }

  async skip(): Promise<void> {
    if (this.currentSong === null) return;

    // Unpause first — stop() on a paused player might not trigger TrackEnd.
    if (this.paused) {
      this.unpause();
    }

    const player = this.hoshimiPlayer();
    if (player) {
      // stop(false) stops playback without destroying the player or clearing
      // its voice state, so the next track can play without reconnecting.
      player.stop(false);
    }

    // Directly advance to the next track instead of relying on the async
    // trackEnd event chain, which clears queue.current before play() is called.
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
    // Don't call broadcast() here — let playerDestroy event handler do it
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

  setLoopMode(mode: LoopMode): void {
    this.loopMode = mode;
    const player = this.hoshimiPlayer();
    if (player) {
      // Hoshimi uses LoopMode enum (Track=1, Queue=2, Off=3)
      player.setLoop(mode === 'song' ? 1 : mode === 'queue' ? 2 : 3);
    }
    this.broadcast();
  }

  togglePause(): boolean {
    if (!this.currentSong) return false;

    const player = this.hoshimiPlayer();
    if (!player) return false;

    if (this.paused) {
      this.cancelIdleLeave();
      if (this.pausedAt !== null) {
        const pauseDuration = Date.now() - this.pausedAt;
        if (this.trackStartedAt !== null) {
          this.trackStartedAt += pauseDuration;
        }
        this.pausedAt = null;
      }
      player.setPaused(false);
      this.paused = false;
    } else {
      this.pausedAt = Date.now();
      player.setPaused(true);
      this.paused = true;
      this.scheduleIdleLeave();
    }

    this.broadcast();
    return this.paused;
  }

  async seek(positionMs: number): Promise<void> {
    if (!this.currentSong) return;

    const player = this.hoshimiPlayer();
    if (!player) return;

    // Clamp to valid range
    const durationSec = this.currentSong.duration;
    const durationMs = durationSec * 1000;
    const clampedMs = Math.max(0, Math.min(positionMs, durationMs));

    await player.seek(clampedMs);

    // Adjust trackStartedAt so elapsed time is consistent after seek.
    // New trackStartedAt = now - seeked position
    this.trackStartedAt = Date.now() - clampedMs;
    // If we were paused, also update pausedAt so pause offset is preserved
    if (this.paused && this.pausedAt !== null) {
      this.pausedAt = Date.now() - clampedMs;
    }

    this.broadcast();
  }

  getCurrentSong(): QueuedSong | null {
    return this.currentSong;
  }

  /**
   * Update volume of the currently-playing track without restarting it.
   * Does nothing if no track is currently playing.
   */
  public updateVolumeBoost(boost: number): void {
    const hoshimi = getHoshimi();
    if (!hoshimi) return;
    const hoshimiPlayer = hoshimi.players.get(this.guildId);
    if (!hoshimiPlayer || !this.currentSong) return;
    // Use NodeLink REST API directly to bypass Hoshimi's volume filter
    // NodeLink volume: 0-1000 where 100 = 100%. finalVolume = 100 + boost
    const node = hoshimiPlayer.node;
    if (!node) return;
    node.rest.updatePlayer({
      guildId: this.guildId,
      playerOptions: { volume: 100 + boost },
    });
  }

  getQueue(): QueuedSong[] {
    return this.queue.toRemaining();
  }

  getLoopMode(): LoopMode {
    return this.loopMode;
  }

  isPlaying(): boolean {
    // Don't wait for NodeLink's playing flag — it's false during the buffering
    // window after play() is called. We know we're playing if we have a song
    // loaded and we're not paused.
    if (this.currentSong === null || this.paused) return false;
    return true;
  }

  getQueueState(): QueueState {
    const player = this.hoshimiPlayer();
    return {
      isPlaying: this.isPlaying(),
      isPaused: this.paused,
      isConnectedToVoice: player?.connected ?? false,
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
    void broadcastQueueUpdate(this.getQueueState());
  }

  private peekNextTrack(): QueuedSong | null {
    // Priority queue peek
    if (this.priorityQueue.length > 0) {
      return this.priorityQueue[0] ?? null;
    }

    // Song loop: always replay current song (checked before isAtEnd to handle
    // end-of-queue correctly — playNext() replays currentSong even at end)
    if (this.loopMode === 'song' && this.currentSong) {
      return this.currentSong;
    }

    // At end of main queue
    if (this.queue.isAtEnd) {
      if (this.loopMode === 'queue' && !this.queue.isEmpty) {
        return this.queue.current() as QueuedSong | null;
      }
      return null;
    }

    return this.queue.current() as QueuedSong | null;
  }

  private async playNext(): Promise<void> {
    const player = this.hoshimiPlayer();
    if (player && !player.connected) {
      // Re-establish the voice connection so playSong() can use it.
      await player.connect();
    }

    const prioritySong = this.priorityQueue.shift();
    if (prioritySong) {
      this.currentSong = prioritySong;
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
        this.scheduleIdleLeave();
        return;
      }
    }

    // Song loop: replay current song and advance readIndex so that
    // disabling loop mode mid-playthrough doesn't cause a ghost loop
    if (this.loopMode === 'song' && this.currentSong) {
      await this.playSong(this.currentSong);
      this.queue.advance();
      return;
    }

    const next = this.queue.current();
    if (!next) {
      this.currentSong = null;
      this.broadcast();
      return;
    }

    this.currentSong = next;
    // Default isSeekable to true (YouTube tracks are virtually always seekable).
    // NodeLink's actual TrackInfo.isSeekable is not captured from the play response.
    if (this.currentSong) {
      this.currentSong = { ...this.currentSong, isSeekable: true };
    }
    this.queue.advance();

    await this.playSong(next);
  }

  private async playSong(next: QueuedSong): Promise<void> {
    this.cancelIdleLeave();
    this.paused = false;

    const hoshimi = getHoshimi();
    if (!hoshimi) {
      await this.handlePlaybackFailure('Hoshimi not available');
      return;
    }

    let trackData: { track: string; isWebmOpus: boolean };

    try {
      trackData = await this.fetchStreamWithRetry(next.youtubeUrl);
    } catch (error) {
      logger.error(
        { guildId: this.guildId, track: next.title, error },
        `Failed to get stream URL after 3 attempts`
      );
      await this.handlePlaybackFailure('could not load the track from NodeLink');
      return;
    }

    let player = hoshimi.players.get(this.guildId);
    if (!player) {
      if (!this.voiceId) {
        logger.error(
          { guildId: this.guildId },
          'Cannot play: no voiceId set and no existing player'
        );
        await this.handlePlaybackFailure('not connected to a voice channel');
        return;
      }
      player = hoshimi.createPlayer({ guildId: this.guildId, voiceId: this.voiceId });
    } else if (!player.connected) {
      // Player exists but was disconnected (e.g. after stop()). Reconnect first so
      // NodeLink receives the voice server update and can begin streaming.
      await player.connect();
    }

    // Apply volume via NodeLink volume filter.
    const volume = 100 + (next.volumeBoost ?? 0);

    await player.play({
      track: new Track(
        {
          encoded: trackData.track,
          info: {
            title: next.title,
            identifier: next.youtubeId,
            author: '',
            length: next.duration * 1000,
            artworkUrl: '',
            uri: next.youtubeUrl,
            isStream: false,
            isSeekable: true,
            position: 0,
            sourceName: SourceNames.Youtube,
            isrc: null,
          },
          pluginInfo: {},
        },
        {}
      ),
      volume,
    });

    // Apply compressor filter if enabled
    const settings = await db
      .select({
        enabled: tables.guildSettings.compressorEnabled,
        threshold: tables.guildSettings.compressorThreshold,
        ratio: tables.guildSettings.compressorRatio,
        attack: tables.guildSettings.compressorAttack,
        release: tables.guildSettings.compressorRelease,
        gain: tables.guildSettings.compressorGain,
        eqBand0: tables.guildSettings.eqBand0,
        eqBand1: tables.guildSettings.eqBand1,
        eqBand2: tables.guildSettings.eqBand2,
        eqBand3: tables.guildSettings.eqBand3,
        eqBand4: tables.guildSettings.eqBand4,
        eqBand5: tables.guildSettings.eqBand5,
        eqBand6: tables.guildSettings.eqBand6,
        eqBand7: tables.guildSettings.eqBand7,
        eqBand8: tables.guildSettings.eqBand8,
        eqBand9: tables.guildSettings.eqBand9,
        eqBand10: tables.guildSettings.eqBand10,
        eqBand11: tables.guildSettings.eqBand11,
        eqBand12: tables.guildSettings.eqBand12,
        eqBand13: tables.guildSettings.eqBand13,
        eqBand14: tables.guildSettings.eqBand14,
      })
      .from(tables.guildSettings)
      .where(eq(tables.guildSettings.id, 1))
      .get();

    if (settings?.enabled) {
      const node = player.node;
      if (node) {
        try {
          await node.rest.updatePlayer({
            guildId: this.guildId,
            playerOptions: {
              filters: {
                compressor: {
                  threshold: settings.threshold,
                  ratio: settings.ratio,
                  attack: settings.attack,
                  release: settings.release,
                  gain: settings.gain,
                },
              },
            },
          } as Parameters<typeof node.rest.updatePlayer>[0]);
        } catch (err) {
          // Don't fail playback — log and continue
          logger.error(
            { err, guildId: this.guildId },
            'Failed to apply compressor filter on playback start'
          );
        }
      }
    }

    // Apply equalizer filter if any band is non-neutral
    const eqBands = settings
      ? [
          settings.eqBand0,
          settings.eqBand1,
          settings.eqBand2,
          settings.eqBand3,
          settings.eqBand4,
          settings.eqBand5,
          settings.eqBand6,
          settings.eqBand7,
          settings.eqBand8,
          settings.eqBand9,
          settings.eqBand10,
          settings.eqBand11,
          settings.eqBand12,
          settings.eqBand13,
          settings.eqBand14,
        ]
      : Array(15).fill(50);

    const node = player.node;
    if (node && eqBands.some((b) => b !== 50)) {
      try {
        const equalizerFilter = eqBands.map((value, index) => ({
          band: index,
          gain: (value - 50) / 100,
        }));
        await node.rest.updatePlayer({
          guildId: this.guildId,
          playerOptions: {
            filters: {
              equalizer: equalizerFilter,
            },
          },
        } as Parameters<typeof node.rest.updatePlayer>[0]);
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

    // Kick off gapless preload for the next track (fire-and-forget)
    // Delay slightly to ensure current track is fully initialized in NodeLink
    // before we attempt to preload the next track.
    const currentEncoded = trackData.track;
    const nextTrack = this.peekNextTrack();
    if (nextTrack) {
      const player = this.hoshimiPlayer();
      const sessionId = player?.node?.sessionId;
      if (sessionId) {
        const guildId = this.guildId;
        const youtubeUrl = nextTrack.youtubeUrl;
        setTimeout(() => {
          import('./utils/nodelink').then(({ preloadTrack }) => {
            preloadTrack(guildId, sessionId, youtubeUrl, currentEncoded).catch(() => {
              /* intentionally empty */
            });
          });
        }, 500);
      }
    }
  }

  private async fetchStreamWithRetry(
    youtubeUrl: string
  ): Promise<{ track: string; isWebmOpus: boolean }> {
    const RETRY_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1_000;
    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const { getStreamFormat } = await import('./utils/nodelink');
        return await getStreamFormat(youtubeUrl);
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
        `Max consecutive failures reached — stopping playback.`
      );
      this.stop();
      return;
    }
    logger.warn(
      { guildId: this.guildId, song: this.currentSong?.title },
      `Skipping song — ${skipMessage}`
    );
    await this.playNext();
  }

  private async onTrackEnd(): Promise<void> {
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
