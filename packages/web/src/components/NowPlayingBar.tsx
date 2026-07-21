import { type QueuedSong } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
import {
  CircleNotchIcon,
  DoorOpenIcon,
  GuitarIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOnceIcon,
  ShuffleIcon,
  SkipForwardIcon,
} from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { usePlayer } from '../context/PlayerContext';
import { useQueuePanel } from '../context/QueuePanelContext';
import { useCooldownGuard, type CooldownState } from '../hooks/useCooldownGuard';
import { useMutationHandler } from '../hooks/useMutationHandler';
import { metadataTransition, metadataVariants, slideUp, slideUpTransition } from '../lib/motion';
import { getSourceKey } from '../utils/source';
import { BarButton } from './BarButton';
import QueuePanel from './QueuePanel';
import { SourceIcon } from './SourceIcons';
import TagTicker from './TagTicker';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { cooldownButtonProps } from './ui/cooldownButtonProps';
import { VolumeBoostBadge } from './ui/VolumeBoostBadge';

/* ---------------------------------------------------------------------------
 * Module-level constants — stable references for memoized components
 * --------------------------------------------------------------------------- */

const NOOP = () => {};

const MOBILE_PROGRESS_BOX_STYLE = { boxShadow: 'var(--clay-shadow-flat)' } as const;
const ZERO_WIDTH_STYLE = { width: '0%' } as const;

const ALBUM_ART_INITIAL = { opacity: 0, scale: 0.92 };
const ALBUM_ART_ANIMATE = { opacity: 1, scale: 1 };
const ALBUM_ART_EXIT = { opacity: 0, scale: 0.92 };
const ALBUM_ART_TRANSITION = { duration: 0.2, ease: 'easeOut' } as const;

/* ---------------------------------------------------------------------------
 * Memoized sub-components — these bail out of re-rendering when their props
 * haven't changed, which is most of the time during elapsed-ticking.
 * --------------------------------------------------------------------------- */

interface PlaybackControlsProps {
  currentSong: QueuedSong | null;
  isPaused: boolean;
  isStopped: boolean;
  isPlaying: boolean;
  isConnectedToVoice: boolean;
  pauseBusy: boolean;
  skipBusy: boolean;
  cooldown: CooldownState;
  onPauseResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

const PlaybackControls = memo(function PlaybackControls({
  currentSong,
  isPaused,
  isStopped,
  isPlaying,
  isConnectedToVoice,
  pauseBusy,
  skipBusy,
  cooldown,
  onPauseResume,
  onSkip,
  onStop,
}: PlaybackControlsProps) {
  const realDisabled = !currentSong || pauseBusy || skipBusy;

  return (
    <div className='flex shrink-0 items-center gap-1 md:gap-1.5'>
      <BarButton
        {...cooldownButtonProps(cooldown, {
          onClick: onPauseResume,
          disabled: realDisabled,
          title: isPaused || isStopped ? 'Play' : 'Pause',
        })}
        busy={pauseBusy}
        hoverColor='hover:text-fg'
        pulse={isPlaying && !isPaused}
      >
        {isPaused || isStopped ? (
          <PlayIcon size={24} weight='duotone' className='md:h-5 md:w-5' />
        ) : (
          <PauseIcon size={24} weight='duotone' className='md:h-5 md:w-5' />
        )}
      </BarButton>
      <BarButton
        {...cooldownButtonProps(cooldown, {
          onClick: onSkip,
          disabled: realDisabled,
          title: 'Skip',
        })}
        busy={skipBusy}
        hoverColor='hover:text-fg'
        className='hidden md:flex'
      >
        <SkipForwardIcon size={24} weight='duotone' className='md:h-5 md:w-5' />
      </BarButton>

      <Button
        variant='inherit'
        surface='base'
        size='icon'
        {...cooldownButtonProps(cooldown, {
          onClick: onStop,
          disabled: !isConnectedToVoice,
          title: 'Stop playback',
        })}
        className='hover:text-danger text-black md:h-12 md:w-12 dark:text-white'
      >
        <DoorOpenIcon size={24} weight='duotone' className='md:h-5 md:w-5' />
      </Button>
    </div>
  );
});

interface LoopShuffleControlsProps {
  currentSong: QueuedSong | null;
  loopMode: 'off' | 'queue' | 'song';
  isShuffled: boolean;
  loopBusy: boolean;
  shuffleBusy: boolean;
  cooldown: CooldownState;
  onCycleLoop: () => void;
  onShuffleToggle: () => void;
}

const LoopShuffleControls = memo(function LoopShuffleControls({
  currentSong,
  loopMode,
  isShuffled,
  loopBusy,
  shuffleBusy,
  cooldown,
  onCycleLoop,
  onShuffleToggle,
}: LoopShuffleControlsProps) {
  const isLoopActive = loopMode !== 'off';
  const loopIcon = isLoopActive ? (
    loopMode === 'song' ? (
      <RepeatOnceIcon size={22} weight='fill' className='md:h-5 md:w-5' />
    ) : (
      <RepeatIcon size={22} weight='fill' className='md:h-5 md:w-5' />
    )
  ) : (
    <RepeatIcon size={22} weight='duotone' className='md:h-5 md:w-5' />
  );

  return (
    <div className='hidden shrink-0 items-center gap-1 md:flex md:gap-1.5'>
      <Button
        variant='inherit'
        surface='base'
        size='icon'
        {...cooldownButtonProps(cooldown, {
          onClick: onCycleLoop,
          disabled: !currentSong || loopBusy,
          title: `Loop: ${loopMode}`,
        })}
        className={`shrink-0 md:h-12 md:w-12 ${
          isLoopActive
            ? 'pressed text-accent hover:text-accent-muted'
            : 'hover:text-fg text-black dark:text-white'
        }`}
      >
        {loopBusy ? (
          <CircleNotchIcon size={22} weight='bold' className='animate-spin md:h-5 md:w-5' />
        ) : (
          loopIcon
        )}
      </Button>
      <Button
        variant='inherit'
        surface='base'
        size='icon'
        {...cooldownButtonProps(cooldown, {
          onClick: onShuffleToggle,
          disabled: !currentSong || shuffleBusy,
          title: isShuffled ? 'Unshuffle queue' : 'Shuffle queue',
        })}
        className={`shrink-0 md:h-12 md:w-12 ${
          isShuffled
            ? 'pressed text-accent hover:text-accent-muted'
            : 'hover:text-fg text-black dark:text-white'
        }`}
      >
        {shuffleBusy ? (
          <CircleNotchIcon size={22} weight='bold' className='animate-spin md:h-5 md:w-5' />
        ) : (
          <ShuffleIcon
            size={24}
            weight={isShuffled ? 'fill' : 'duotone'}
            className='md:h-5 md:w-5'
          />
        )}
      </Button>
    </div>
  );
});

// Seek-on-release: update visual immediately during drag, but only commit the
// seek API call when the user releases the thumb. This prevents flooding the
// server with seek requests on every pixel of movement and eliminates audio glitches.
interface ScrubberProps {
  isSeekable: boolean;
  duration: number; // seconds
  registerProgress: (ref: HTMLDivElement | null) => void;
  registerThumb: (ref: HTMLDivElement | null) => void;
  onSeek: (seconds: number) => void;
  setOverrideElapsed: (seconds: number) => void;
}

const Scrubber = memo(function Scrubber({
  isSeekable,
  duration,
  registerProgress,
  registerThumb,
  onSeek,
  setOverrideElapsed,
}: ScrubberProps) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  // True while the user is dragging the thumb
  const isDraggingRef = useRef(false);
  // Last known slider value during drag (used to commit seek on pointer up)
  const lastDragValueRef = useRef<number>(0);

  // Stable ref callbacks — prevents memo bail-out breakage
  const fillRefCallback = useCallback(
    (ref: HTMLDivElement | null) => {
      fillRef.current = ref;
      registerProgress(ref);
    },
    [registerProgress]
  );

  const thumbRefCallback = useCallback(
    (ref: HTMLDivElement | null) => {
      thumbRef.current = ref;
      if (ref) {
        registerThumb(ref);
      }
    },
    [registerThumb]
  );

  // Position both fill bar and thumb directly in the DOM during drag.
  // Bypasses React + rAF entirely — immediate, jank-free visual feedback.
  const seekElements = useCallback((trackPct: number) => {
    const pctStr = `${trackPct * 100}%`;
    if (fillRef.current) {
      fillRef.current.style.width = pctStr;
    }
    if (thumbRef.current) {
      thumbRef.current.style.left = pctStr;
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current || !trackRef.current) {
        return;
      }
      const rect = trackRef.current.getBoundingClientRect();
      const trackPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekSec = Math.round(trackPct * duration);
      lastDragValueRef.current = seekSec;
      setOverrideElapsed(seekSec);
      seekElements(trackPct);
    },
    [duration, setOverrideElapsed, seekElements]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) {
      return;
    }
    isDraggingRef.current = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    if (lastDragValueRef.current > 0 || duration > 0) {
      onSeek(lastDragValueRef.current);
    }
  }, [duration, handlePointerMove, onSeek]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isSeekable) {
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      if (trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        const trackPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const seekSec = Math.round(trackPct * duration);
        lastDragValueRef.current = seekSec;
        setOverrideElapsed(seekSec);
        seekElements(trackPct);
      }
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [isSeekable, duration, handlePointerMove, handlePointerUp, setOverrideElapsed, seekElements]
  );

  if (!isSeekable) {
    return (
      <div className='clay-inset relative h-2 w-full cursor-not-allowed overflow-hidden rounded-full opacity-50'>
        <div ref={fillRefCallback} className='bg-accent absolute inset-y-0 left-0 rounded-full' />
      </div>
    );
  }

  return (
    <div
      ref={trackRef}
      className='clay-inset group relative h-2 w-full cursor-pointer rounded-full'
      onPointerDown={handlePointerDown}
    >
      <div ref={fillRefCallback} className='bg-accent absolute inset-y-0 left-0 rounded-full' />
      {/* Fill & thumb — positioned entirely by useProgressBar (rAF + effect).
           No React style props. */}
      <div
        ref={thumbRefCallback}
        className='scrubber-thumb bg-surface border-accent pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 opacity-0 transition-opacity group-hover:opacity-100'
      />
      {/* Invisible hit area for hovering */}
      <div className='absolute inset-0' />
    </div>
  );
});

interface ProgressBarProps {
  currentSong: QueuedSong | null;
  elapsed: number;
  registerProgress: (ref: HTMLDivElement | null) => void;
  registerThumb: (ref: HTMLDivElement | null) => void;
  onSeek?: (seconds: number) => void;
  setOverrideElapsed: (seconds: number) => void;
  variant: 'mobile' | 'desktop';
}

const ProgressBar = memo(function ProgressBar({
  currentSong,
  registerProgress,
  registerThumb,
  onSeek,
  setOverrideElapsed,
  variant,
}: ProgressBarProps) {
  // rAF-driven progress bar — width set directly by DOM, no React state
  if (variant === 'mobile') {
    return (
      <div
        className='clay-inset relative h-1 w-full overflow-hidden md:hidden'
        style={MOBILE_PROGRESS_BOX_STYLE}
      >
        <div
          ref={currentSong != null ? registerProgress : null}
          className='bg-accent absolute inset-y-0 left-0'
          style={ZERO_WIDTH_STYLE}
        />
      </div>
    );
  }

  return (
    <div className='hidden min-h-0 flex-1 items-center md:flex'>
      <Scrubber
        isSeekable={currentSong?.isSeekable ?? false}
        duration={currentSong?.duration ?? 0}
        registerProgress={registerProgress}
        registerThumb={registerThumb}
        onSeek={onSeek ?? NOOP}
        setOverrideElapsed={setOverrideElapsed}
      />
    </div>
  );
});

interface AlbumArtProps {
  currentSong: QueuedSong | null;
}

const AlbumArt = memo(function AlbumArt({ currentSong }: AlbumArtProps) {
  const songKey = currentSong?.id ?? 'empty';

  return (
    <AnimatePresence mode='wait'>
      <m.div
        key={songKey}
        className='border-border bg-elevated relative h-12 w-12 shrink-0 overflow-hidden rounded border md:h-14 md:w-14'
        initial={ALBUM_ART_INITIAL}
        animate={ALBUM_ART_ANIMATE}
        exit={ALBUM_ART_EXIT}
        transition={ALBUM_ART_TRANSITION}
      >
        {currentSong ? (
          <ArtworkImage
            src={currentSong.artwork ?? currentSong.thumbnailUrl}
            alt={currentSong.title}
            className='h-full w-full'
            imageClassName='scale-[1.33]'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <GuitarIcon size={18} weight='duotone' className='text-faint' />
          </div>
        )}
      </m.div>
    </AnimatePresence>
  );
});

interface MetadataSectionProps {
  currentSong: QueuedSong | null;
  elapsed: number;
}

const MetadataSection = memo(function MetadataSection({
  currentSong,
  elapsed,
}: MetadataSectionProps) {
  if (!currentSong) {
    return (
      <div className='flex h-6 items-center'>
        <p className='font-body text-muted text-sm'>Nothing playing</p>
      </div>
    );
  }

  const displayName = currentSong.nickname ?? currentSong.title;
  const sourceKey = getSourceKey(currentSong.sourceUrl);
  const songKey = currentSong.id;

  return (
    <AnimatePresence mode='wait'>
      <m.div
        key={songKey}
        className='flex min-w-0 flex-col gap-0.5'
        variants={metadataVariants}
        initial='initial'
        animate='animate'
        exit='exit'
        transition={metadataTransition}
      >
        <div className='flex min-w-0 items-center gap-2'>
          <p className='font-body text-fg truncate text-sm font-medium'>{displayName}</p>
          {currentSong.artist && (
            <p className='font-body text-muted shrink-0 text-xs'>· {currentSong.artist}</p>
          )}
          <TagTicker tags={currentSong.tags ?? []} />
        </div>
        <div className='flex items-center gap-2'>
          <p className='text-muted font-mono text-xs'>
            {formatDuration(elapsed)} / {formatDuration(currentSong.duration)}
          </p>
          {sourceKey && (
            <span className='flex shrink-0 items-center [&_svg]:h-3 [&_svg]:w-3'>
              <SourceIcon sourceKey={sourceKey} />
            </span>
          )}
          <VolumeBoostBadge volumeBoost={currentSong.volumeBoost} />
        </div>
      </m.div>
    </AnimatePresence>
  );
});

/* ---------------------------------------------------------------------------
 * Parent component — still re-renders on every tick (reads `elapsed`), but
 * memoized children bail out when their props haven't changed.
 * --------------------------------------------------------------------------- */

export function NowPlayingBar() {
  const {
    state,
    elapsed,
    registerProgress,
    registerThumb,
    skip,
    leave,
    pause,
    setLoop,
    shuffle,
    unshuffle,
    seek,
    setOverrideElapsed,
  } = usePlayer();
  const { currentSong, isPlaying, isPaused, isConnectedToVoice, loopMode, isShuffled } = state;
  const isStopped = !!currentSong && !isPlaying && !isPaused;

  const { queueOpen, setQueueOpen } = useQueuePanel();

  const { coolingDown, statusTitle, handleCooldownClick } = useCooldownGuard();

  const cooldown: CooldownState = useMemo(
    () => ({ coolingDown, statusTitle, onCooldownClick: handleCooldownClick }),
    [coolingDown, statusTitle, handleCooldownClick]
  );

  const { busy: pauseBusy, handler: handlePauseResume } = useMutationHandler(
    pause,
    'Could not toggle playback.'
  );
  const { busy: skipBusy, handler: handleSkip } = useMutationHandler(skip, 'Could not skip track.');
  const { busy: loopBusy, handler: handleCycleLoop } = useMutationHandler(
    useCallback(async () => {
      const next = loopMode === 'off' ? 'queue' : loopMode === 'queue' ? 'song' : 'off';
      await setLoop(next);
    }, [loopMode, setLoop]),
    'Could not change loop mode.'
  );
  const { busy: shuffleBusy, handler: handleShuffleToggle } = useMutationHandler(
    useCallback(async () => {
      if (isShuffled) {
        await unshuffle();
      } else {
        await shuffle();
      }
    }, [isShuffled, shuffle, unshuffle]),
    'Could not toggle shuffle.'
  );

  const handleStop = useCallback(() => {
    void (async () => {
      try {
        await leave();
      } catch (error) {
        console.error(error);
      }
    })();
  }, [leave]);

  const handleSeek = useCallback(
    async (seconds: number) => {
      const positionMs = seconds * 1000;
      await seek(positionMs);
      setOverrideElapsed(seconds);
    },
    [seek, setOverrideElapsed]
  );

  useEffect(() => {
    setOverrideElapsed(undefined);
  }, [setOverrideElapsed]);

  const handleQueueToggle = useCallback(() => {
    setQueueOpen(!queueOpen);
  }, [queueOpen, setQueueOpen]);

  const handleQueueClose = useCallback(() => {
    setQueueOpen(false);
  }, [setQueueOpen]);

  const mobileQuickControls = useMemo(
    () => ({
      currentSong,
      loopMode,
      isShuffled,
      loopBusy,
      shuffleBusy,
      skipBusy,
      cooldown,
      onSkip: handleSkip,
      onCycleLoop: handleCycleLoop,
      onShuffleToggle: handleShuffleToggle,
    }),
    [
      currentSong,
      loopMode,
      isShuffled,
      loopBusy,
      shuffleBusy,
      skipBusy,
      cooldown,
      handleSkip,
      handleCycleLoop,
      handleShuffleToggle,
    ]
  );

  return (
    <div className='bg-base w-full shrink-0'>
      {/* Mobile: progress bar on top */}
      <ProgressBar
        currentSong={currentSong}
        registerProgress={registerProgress}
        registerThumb={registerThumb}
        elapsed={elapsed}
        setOverrideElapsed={setOverrideElapsed}
        variant='mobile'
      />

      <div className='flex h-22 flex-row items-center gap-1 px-3 md:h-20 md:px-8'>
        {/* Playback controls: Play/Pause (desktop: also Skip, Leave) */}
        <PlaybackControls
          currentSong={currentSong}
          isPaused={isPaused}
          isStopped={isStopped}
          isPlaying={isPlaying}
          isConnectedToVoice={isConnectedToVoice}
          pauseBusy={pauseBusy}
          skipBusy={skipBusy}
          cooldown={cooldown}
          onPauseResume={handlePauseResume}
          onSkip={handleSkip}
          onStop={handleStop}
        />

        {/* Desktop: spacer → art → metadata+progress → spacer → loop/shuffle+queue */}
        <div className='hidden flex-1 md:flex' />
        <div className='hidden shrink-0 md:block'>
          <AlbumArt currentSong={currentSong} />
        </div>
        <div className='hidden h-14 min-w-0 flex-8 flex-col justify-between px-3 md:flex'>
          <MetadataSection currentSong={currentSong} elapsed={elapsed} />
          <ProgressBar
            currentSong={currentSong}
            registerProgress={registerProgress}
            registerThumb={registerThumb}
            elapsed={elapsed}
            onSeek={handleSeek}
            setOverrideElapsed={setOverrideElapsed}
            variant='desktop'
          />
        </div>
        <div className='hidden flex-1 md:flex' />
        <div className='hidden shrink-0 items-center gap-1.5 md:flex'>
          <LoopShuffleControls
            currentSong={currentSong}
            loopMode={loopMode}
            isShuffled={isShuffled}
            loopBusy={loopBusy}
            shuffleBusy={shuffleBusy}
            cooldown={cooldown}
            onCycleLoop={handleCycleLoop}
            onShuffleToggle={handleShuffleToggle}
          />
          <Button
            variant='inherit'
            surface='base'
            size='icon'
            onClick={handleQueueToggle}
            title='Queue'
            className={`shrink-0 md:h-12 md:w-12 ${
              queueOpen
                ? 'pressed text-accent hover:text-accent-muted'
                : 'hover:text-fg text-black dark:text-white'
            }`}
          >
            <QueueIcon size={24} weight='duotone' className='md:h-5 md:w-5' />
          </Button>
        </div>

        {/* Mobile: metadata + art + queue */}
        <div className='ms-auto flex shrink-0 items-center md:hidden'>
          <AnimatePresence mode='wait'>
            {currentSong ? (
              <m.div
                key={currentSong.id}
                className='mr-2 max-w-32 min-w-0'
                variants={metadataVariants}
                initial='initial'
                animate='animate'
                exit='exit'
                transition={metadataTransition}
              >
                <p className='font-body text-fg truncate text-right text-sm font-semibold'>
                  {currentSong.nickname ?? currentSong.title}
                </p>
                {currentSong.artist && (
                  <p className='font-body text-muted truncate text-right text-xs'>
                    {currentSong.artist}
                  </p>
                )}
              </m.div>
            ) : (
              <m.div
                key='empty'
                className='mr-2 min-w-0'
                variants={metadataVariants}
                initial='initial'
                animate='animate'
                exit='exit'
                transition={metadataTransition}
              >
                <p className='font-body text-muted text-right text-sm'>Nothing playing</p>
              </m.div>
            )}
          </AnimatePresence>
          <AlbumArt currentSong={currentSong} />
          <div className='bg-border mx-1 h-8 w-px shrink-0' />
          <Button
            variant='inherit'
            surface='base'
            size='icon'
            onClick={handleQueueToggle}
            title='Queue'
            className={`shrink-0 md:h-12 md:w-12 ${
              queueOpen
                ? 'pressed text-accent hover:text-accent-muted'
                : 'hover:text-fg text-black dark:text-white'
            }`}
          >
            <QueueIcon size={24} weight='duotone' className='md:h-5 md:w-5' />
          </Button>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      {queueOpen && (
        <div className='fixed inset-0 z-50 md:hidden'>
          <div
            className='absolute inset-0 cursor-pointer bg-black/60 backdrop-blur-sm'
            onClick={handleQueueClose}
            role='presentation'
          />
          <m.div
            className='bg-surface clay-floating absolute right-0 bottom-0 left-0 flex max-h-[85vh] flex-col rounded-t-2xl'
            initial='initial'
            animate='animate'
            exit='exit'
            variants={slideUp}
            transition={slideUpTransition}
          >
            <QueuePanel mobileQuickControls={mobileQuickControls} />
          </m.div>
        </div>
      )}
    </div>
  );
}
