import type { QueuedSong } from '@alfira-bot/server/shared';
import { formatDuration } from '@alfira-bot/server/shared';
import {
  AlienIcon,
  BombIcon,
  CakeIcon,
  CatIcon,
  CircleNotchIcon,
  CookieIcon,
  DotsThreeOutlineVerticalIcon,
  GhostIcon,
  LightningIcon,
  ListIcon,
  MoonIcon,
  OnigiriIcon,
  PizzaIcon,
  PlanetIcon,
  PlayCircleIcon,
  PlayIcon,
  PlusCircleIcon,
  RepeatIcon,
  RepeatOnceIcon,
  RocketLaunchIcon,
  ShuffleIcon,
  SkipForwardIcon,
  SkullIcon,
  SmileyAngryIcon,
  SockIcon,
  SwordIcon,
  ToiletPaperIcon,
  YinYangIcon,
} from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from '../components/ConfirmModal';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import LoadPlaylistModal from '../components/queue/LoadPlaylistModal';
import OverrideModal from '../components/queue/OverrideModal';
import QuickAddModal from '../components/queue/QuickAddModal';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';
import { usePlayer } from '../context/PlayerContext';
import { Button } from './ui/Button';

export interface MobileQuickControls {
  currentSong: QueuedSong | null;
  loopMode: 'off' | 'queue' | 'song';
  isShuffled: boolean;
  loopBusy: boolean;
  shuffleBusy: boolean;
  skipBusy: boolean;
  onSkip: () => void;
  onCycleLoop: () => void;
  onShuffleToggle: () => void;
}

type VirtualQueueItem =
  | {
      type: 'song';
      variant: 'priority' | 'regular';
      song: QueuedSong;
      listIndex: number;
      key: string;
    }
  | { type: 'header'; variant: 'priority' | 'regular'; key: string };

export default function QueuePanel({
  mobileQuickControls,
}: {
  mobileQuickControls?: MobileQuickControls;
}) {
  const { state, loading, elapsed, registerProgress, clear } = usePlayer();
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showLoadPlaylist, setShowLoadPlaylist] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { currentSong, queue, priorityQueue, isPlaying } = state;

  const virtualItems: VirtualQueueItem[] = useMemo(() => {
    const items: VirtualQueueItem[] = [];
    if (priorityQueue.length > 0) {
      items.push({ type: 'header', variant: 'priority', key: 'header-priority' });
      priorityQueue.forEach((song, i) => {
        items.push({
          type: 'song',
          variant: 'priority',
          song,
          listIndex: i,
          key: `${song.id}-p${i}`,
        });
      });
    }
    if (queue.length > 0) {
      items.push({ type: 'header', variant: 'regular', key: 'header-regular' });
      queue.forEach((song, i) => {
        items.push({
          type: 'song',
          variant: 'regular',
          song,
          listIndex: i,
          key: `${song.id}-r${i}`,
        });
      });
    }
    return items;
  }, [priorityQueue, queue]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (virtualItems[i]?.type === 'header' ? 36 : 56),
    overscan: 5,
  });
  const isQueueEmpty = queue.length === 0 && priorityQueue.length === 0 && !currentSong;

  const handleClear = useCallback(async () => {
    setClearBusy(true);
    try {
      await clear();
    } finally {
      setClearBusy(false);
    }
  }, [clear]);

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      {
        id: 'load-playlist',
        label: 'Load Playlist',
        icon: <ListIcon size={14} weight="duotone" />,
        onClick: () => setShowLoadPlaylist(true),
      },
    ];
    if (isAdminView || hasPermission('queue.quickadd')) {
      items.push({
        id: 'quick-add',
        label: 'Quick Add',
        icon: <PlusCircleIcon size={14} weight="duotone" />,
        onClick: () => setShowQuickAdd(true),
      });
    }
    if (isAdminView || hasPermission('queue.manage')) {
      items.push({
        id: 'override',
        label: 'Override',
        icon: <PlayIcon size={14} weight="duotone" />,
        danger: true,
        onClick: () => setShowOverride(true),
      });
    }
    if (isAdminView || hasPermission('queue.clear')) {
      items.push({
        id: 'clear-queue',
        label: 'Clear Queue',
        icon: <BombIcon size={14} weight="duotone" />,
        danger: true,
        disabled: clearBusy || isQueueEmpty,
        onClick: () => setClearConfirm(true),
      });
    }
    return items;
  }, [isAdminView, hasPermission, clearBusy, isQueueEmpty]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader
          triggerRef={triggerRef}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen(!menuOpen)}
          mobileQuickControls={mobileQuickControls}
        />
        <div className="flex-1 p-4 space-y-3">
          <div className="skeleton h-5 w-48 rounded" />
          <div className="skeleton h-12 w-full rounded" />
          <div className="skeleton h-12 w-full rounded" />
          <div className="skeleton h-12 w-full rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        triggerRef={triggerRef}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(!menuOpen)}
        mobileQuickControls={mobileQuickControls}
      />

      {/* Fixed content: Now Playing */}
      <div className="p-4 space-y-4 shrink-0">
        {currentSong ? (
          <NowPlayingCard
            song={currentSong}
            isPlaying={isPlaying}
            elapsed={elapsed}
            registerProgress={registerProgress}
          />
        ) : (
          <IdleCard />
        )}

        {/* Empty state */}
        {virtualItems.length === 0 && (
          <div className="py-8 text-center space-y-2">
            <p className="font-mono text-[11px] text-faint">queue is empty</p>
            <button
              type="button"
              onClick={() => setShowLoadPlaylist(true)}
              className="cursor-pointer font-mono text-[11px] text-accent hover:underline"
            >
              load a playlist to get started
            </button>
          </div>
        )}
      </div>

      {/* Virtualized scroll container */}
      {virtualItems.length > 0 && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = virtualItems[virtualRow.index];
              if (item == null) return null;

              if (item.type === 'header') {
                return (
                  <div
                    key={item.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {item.variant === 'priority' ? (
                      <h2 className="font-display text-lg text-fg tracking-wider">
                        <LightningIcon size={16} weight="duotone" className="inline mr-1" />
                        Up Next
                        <span className="ml-2 font-mono text-xs text-accent normal-case tracking-normal">
                          {priorityQueue.length}
                        </span>
                      </h2>
                    ) : (
                      <h2 className="font-display text-lg text-fg tracking-wider">
                        Queue
                        {queue.length > 0 && (
                          <span className="ml-2 font-mono text-xs text-muted normal-case tracking-normal">
                            {queue.length}
                          </span>
                        )}
                      </h2>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <QueueSongItem
                    song={item.song}
                    index={item.listIndex}
                    accent={item.variant === 'priority'}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {menuOpen && (
        <ContextMenu
          items={menuItems}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          triggerRef={triggerRef}
          align="right"
        />
      )}

      {/* Modals rendered via portal to escape slideout stacking context */}
      {showLoadPlaylist &&
        createPortal(
          <LoadPlaylistModal
            onClose={() => setShowLoadPlaylist(false)}
            onLoaded={() => {
              setShowLoadPlaylist(false);
            }}
          />,
          document.body
        )}
      {showQuickAdd &&
        createPortal(
          <QuickAddModal
            onClose={() => setShowQuickAdd(false)}
            onAdded={() => {
              setShowQuickAdd(false);
            }}
          />,
          document.body
        )}
      {showOverride &&
        createPortal(
          <OverrideModal
            onClose={() => setShowOverride(false)}
            onOverride={() => {
              setShowOverride(false);
            }}
          />,
          document.body
        )}
      {clearConfirm &&
        createPortal(
          <ConfirmModal
            title="Clear Queue"
            message="All songs in the queue will be removed. This cannot be undone."
            confirmLabel="Clear"
            onConfirm={async () => {
              setClearConfirm(false);
              await handleClear();
            }}
            onCancel={() => setClearConfirm(false)}
          />,
          document.body
        )}
    </div>
  );
}

const QueueSongItem = memo(function QueueSongItem({
  song,
  index,
  accent,
}: {
  song: QueuedSong;
  index: number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <span
        className={`font-mono text-[10px] w-4 text-right shrink-0 ${accent ? 'text-accent' : 'text-faint'}`}
      >
        {index + 1}
      </span>
      <div className="overflow-hidden w-8 h-8 rounded border border-border shrink-0">
        <img
          src={song.artwork ?? song.thumbnailUrl}
          alt={song.nickname || song.title}
          className="w-full h-full object-cover scale-[1.33]"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body text-xs font-medium text-fg truncate">
          {song.nickname || song.title}
        </p>
        <p className="font-mono text-[9px] text-muted hidden sm:block">req. {song.requestedBy}</p>
      </div>
      <span className="font-mono text-[10px] text-muted shrink-0">
        {formatDuration(song.duration)}
      </span>
    </div>
  );
});

const PanelHeader = memo(function PanelHeader({
  triggerRef,
  menuOpen,
  onToggleMenu,
  mobileQuickControls,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  menuOpen: boolean;
  onToggleMenu: () => void;
  mobileQuickControls?: MobileQuickControls;
}) {
  const mqc = mobileQuickControls;
  const isLoopActive = mqc ? mqc.loopMode !== 'off' : false;
  const loopIcon =
    mqc && isLoopActive ? (
      mqc.loopMode === 'song' ? (
        <RepeatOnceIcon size={16} weight="fill" />
      ) : (
        <RepeatIcon size={16} weight="fill" />
      )
    ) : (
      <RepeatIcon size={16} weight="duotone" />
    );

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <h1 className="font-display text-3xl text-fg tracking-wider">Queue</h1>
      <div className="flex items-center gap-1">
        {mqc && (
          <>
            <Button
              variant="inherit"
              surface="base"
              size="icon"
              onClick={mqc.onSkip}
              disabled={!mqc.currentSong || mqc.skipBusy}
              title="Skip"
              className="text-muted hover:text-fg disabled:opacity-50"
            >
              {mqc.skipBusy ? (
                <CircleNotchIcon size={18} weight="bold" className="animate-spin" />
              ) : (
                <SkipForwardIcon size={20} weight="duotone" />
              )}
            </Button>
            <Button
              variant="inherit"
              surface="base"
              size="icon"
              onClick={mqc.onCycleLoop}
              disabled={!mqc.currentSong || mqc.loopBusy}
              title={`Loop: ${mqc.loopMode}`}
              className={`disabled:opacity-50 ${
                isLoopActive
                  ? 'pressed text-accent hover:text-accent-muted'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {mqc.loopBusy ? (
                <CircleNotchIcon size={18} weight="bold" className="animate-spin" />
              ) : (
                loopIcon
              )}
            </Button>
            <Button
              variant="inherit"
              surface="base"
              size="icon"
              onClick={mqc.onShuffleToggle}
              disabled={!mqc.currentSong || mqc.shuffleBusy}
              title={mqc.isShuffled ? 'Unshuffle queue' : 'Shuffle queue'}
              className={`disabled:opacity-50 ${
                mqc.isShuffled
                  ? 'pressed text-accent hover:text-accent-muted'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {mqc.shuffleBusy ? (
                <CircleNotchIcon size={18} weight="bold" className="animate-spin" />
              ) : (
                <ShuffleIcon size={20} weight={mqc.isShuffled ? 'fill' : 'duotone'} />
              )}
            </Button>
          </>
        )}
        <Button
          ref={triggerRef}
          variant="inherit"
          size="icon"
          type="button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          title="More actions"
          surface="elevated"
          className={`${menuOpen ? 'pressed text-accent' : ''}`}
          onClick={onToggleMenu}
        >
          <DotsThreeOutlineVerticalIcon size={18} weight="duotone" />
        </Button>
      </div>
    </div>
  );
});

const NowPlayingCard = memo(function NowPlayingCard({
  song,
  isPlaying,
  elapsed,
  registerProgress,
}: {
  song: QueuedSong;
  isPlaying: boolean;
  elapsed: number;
  registerProgress: (ref: HTMLDivElement | null) => void;
}) {
  return (
    <div className="card overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <div className="flex gap-3 p-3">
        <div className="relative shrink-0 overflow-hidden rounded-xl">
          <img
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname || song.title}
            className="w-20 h-20 rounded-xl border border-border object-cover scale-[1.33]"
            decoding="async"
          />
          {isPlaying && (
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
              <PlayCircleIcon size={10} weight="duotone" className="text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <a
            href={song.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-sm text-fg hover:text-accent line-clamp-2"
          >
            {song.nickname || song.title}
          </a>
          <p className="font-mono text-[10px] text-muted mt-0.5">requested by {song.requestedBy}</p>
          <div className="mt-2">
            <div className="relative h-1.5 w-full bg-elevated rounded-full overflow-hidden">
              <div
                ref={registerProgress}
                className="absolute inset-y-0 left-0 bg-accent rounded-full"
                style={{ width: '0%' }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[9px] text-muted">{formatDuration(elapsed)}</span>
              <span className="font-mono text-[9px] text-muted">
                {formatDuration(song.duration)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const IdleIcons = [
  AlienIcon,
  BombIcon,
  CakeIcon,
  CatIcon,
  CookieIcon,
  GhostIcon,
  MoonIcon,
  OnigiriIcon,
  PizzaIcon,
  PlanetIcon,
  RocketLaunchIcon,
  SkullIcon,
  SmileyAngryIcon,
  SockIcon,
  SwordIcon,
  ToiletPaperIcon,
  YinYangIcon,
];

let lastIndex = -1;
function getRandomIdleIcon() {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * IdleIcons.length);
  } while (IdleIcons.length > 1 && idx === lastIndex);
  lastIndex = idx;
  return IdleIcons[idx] ?? IdleIcons[0];
}

const IdleCard = memo(function IdleCard() {
  const [Icon] = useState(getRandomIdleIcon);
  return (
    <div
      className="card flex items-center justify-center py-8"
      style={{ background: 'var(--color-base)' }}
    >
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-elevated border border-border flex items-center justify-center mx-auto mb-3">
          <Icon size={20} weight="duotone" className="text-faint" />
        </div>
        <p className="font-display text-xl text-faint tracking-wider mb-1">Nothing Playing</p>
      </div>
    </div>
  );
});
