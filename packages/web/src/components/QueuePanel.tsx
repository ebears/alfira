import type { QueuedSong } from '@alfira-bot/server/shared';
import { formatDuration } from '@alfira-bot/server/shared';
import {
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpIcon,
  BombIcon,
  CircleNotchIcon,
  DotsThreeOutlineVerticalIcon,
  LightningIcon,
  ListIcon,
  MusicNoteIcon,
  PlayIcon,
  PlusCircleIcon,
  RepeatIcon,
  RepeatOnceIcon,
  ShuffleIcon,
  SkipForwardIcon,
  TrashIcon,
  UserCircleIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from '../components/ConfirmModal';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import OverrideModal from '../components/queue/OverrideModal';
import QuickAddModal from '../components/queue/QuickAddModal';
import { SourceIcon } from '../components/SourceIcons';
import { useAdminView } from '../context/AdminViewContext';
import { usePermissions } from '../context/PermissionsContext';
import { usePlayer } from '../context/PlayerContext';
import { getSourceKey } from '../utils/source';
import { getRandomIdleIcon } from './EmptyState';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { DurationBadge } from './ui/DurationBadge';
import { VolumeBoostBadge } from './ui/VolumeBoostBadge';

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
  const {
    state,
    loading,
    elapsed,
    registerProgress,
    clear,
    removeSong,
    promoteSong,
    demoteSong,
    reorderQueue,
  } = usePlayer();
  const { isAdminView } = useAdminView();
  const { hasPermission } = usePermissions();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { currentSong, queue, priorityQueue } = state;

  const canManage = isAdminView || hasPermission('queue.manage');

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
    estimateSize: (i) => (virtualItems[i]?.type === 'header' ? 36 : 92),
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

  const handleRemove = useCallback(
    async (songId: string) => {
      await removeSong(songId);
    },
    [removeSong]
  );

  const handlePromote = useCallback(
    async (songId: string) => {
      await promoteSong(songId);
    },
    [promoteSong]
  );

  const handleDemote = useCallback(
    async (songId: string) => {
      await demoteSong(songId);
    },
    [demoteSong]
  );

  const handleMoveUp = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx <= 0) return;
      const newOrder = [...targetQueue];
      const a = newOrder[idx];
      const b = newOrder[idx - 1];
      if (a && b) {
        newOrder[idx - 1] = a;
        newOrder[idx] = b;
      }
      reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handleMoveDown = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx < 0 || idx >= targetQueue.length - 1) return;
      const newOrder = [...targetQueue];
      const a = newOrder[idx];
      const b = newOrder[idx + 1];
      if (a && b) {
        newOrder[idx] = b;
        newOrder[idx + 1] = a;
      }
      reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handleMoveToTop = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx <= 0) return;
      const newOrder = [...targetQueue];
      const [item] = newOrder.splice(idx, 1);
      if (item) newOrder.unshift(item);
      reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handleMoveToBottom = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx < 0 || idx >= targetQueue.length - 1) return;
      const newOrder = [...targetQueue];
      const [item] = newOrder.splice(idx, 1);
      if (item) newOrder.push(item);
      reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [];
    if (isAdminView || hasPermission('queue.quickadd')) {
      items.push({
        id: 'quick-add',
        label: 'Quick Add',
        icon: <PlusCircleIcon size={14} weight="duotone" />,
        onClick: () => setShowQuickAdd(true),
      });
    }
    if (isAdminView || hasPermission('queue.override')) {
      items.push({
        id: 'override',
        label: 'Override',
        icon: <PlayIcon size={14} weight="duotone" />,
        danger: true,
        onClick: () => setShowOverride(true),
      });
    }
    if (isAdminView || hasPermission('queue.manage')) {
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
            elapsed={elapsed}
            registerProgress={registerProgress}
          />
        ) : (
          <IdleCard />
        )}

        {/* Empty state */}
        {virtualItems.length === 0 && (
          <div className="py-8 text-center">
            <p className="font-mono text-[11px] text-faint">queue is empty</p>
          </div>
        )}
      </div>

      {/* Virtualized scroll container */}
      {virtualItems.length > 0 && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pb-4 min-h-0"
          style={{
            WebkitMaskImage:
              'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)',
            maskImage:
              'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)',
          }}
        >
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
                  className="pb-1"
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
                    variant={item.variant}
                    canManage={canManage}
                    targetQueue={item.variant === 'priority' ? priorityQueue : queue}
                    onRemove={handleRemove}
                    onPromote={handlePromote}
                    onDemote={handleDemote}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onMoveToTop={handleMoveToTop}
                    onMoveToBottom={handleMoveToBottom}
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
  variant,
  canManage,
  targetQueue,
  onRemove,
  onPromote,
  onDemote,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onMoveToBottom,
}: {
  song: QueuedSong;
  index: number;
  variant: 'priority' | 'regular';
  canManage: boolean;
  targetQueue: QueuedSong[];
  onRemove: (songId: string) => Promise<void>;
  onPromote: (songId: string) => Promise<void>;
  onDemote: (songId: string) => Promise<void>;
  onMoveUp: (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => void;
  onMoveDown: (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => void;
  onMoveToTop: (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => void;
  onMoveToBottom: (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isPriority = variant === 'priority';
  const isFirst = index === 0;
  const isLast = index >= targetQueue.length - 1;

  const menuItems: MenuItem[] = useMemo(() => {
    if (!canManage) return [];
    const items: MenuItem[] = [];

    // Remove — always available
    items.push({
      id: 'remove',
      label: 'Remove',
      icon: <TrashIcon size={14} weight="duotone" />,
      danger: true,
      onClick: () => onRemove(song.id),
    });

    // Promote — only for regular queue items
    if (!isPriority) {
      items.push({
        id: 'promote',
        label: 'Promote to Up Next',
        icon: <LightningIcon size={14} weight="duotone" />,
        onClick: () => onPromote(song.id),
      });
    }

    // Demote — only for priority queue items
    if (isPriority) {
      items.push({
        id: 'demote',
        label: 'Demote to Queue',
        icon: <ListIcon size={14} weight="duotone" />,
        onClick: () => onDemote(song.id),
      });
    }

    // Reorder controls — for both queues
    if (targetQueue.length > 1) {
      items.push({
        id: 'move-up',
        label: 'Move Up',
        icon: <ArrowUpIcon size={14} weight="duotone" />,
        disabled: isFirst,
        onClick: () => onMoveUp(targetQueue, song.id, isPriority ? 'priority' : 'queue'),
      });
      items.push({
        id: 'move-down',
        label: 'Move Down',
        icon: <ArrowDownIcon size={14} weight="duotone" />,
        disabled: isLast,
        onClick: () => onMoveDown(targetQueue, song.id, isPriority ? 'priority' : 'queue'),
      });
      items.push({
        id: 'move-top',
        label: 'Move to Top',
        icon: <ArrowLineUpIcon size={14} weight="duotone" />,
        disabled: isFirst,
        onClick: () => onMoveToTop(targetQueue, song.id, isPriority ? 'priority' : 'queue'),
      });
      items.push({
        id: 'move-bottom',
        label: 'Move to Bottom',
        icon: <ArrowLineDownIcon size={14} weight="duotone" />,
        disabled: isLast,
        onClick: () => onMoveToBottom(targetQueue, song.id, isPriority ? 'priority' : 'queue'),
      });
    }

    return items;
  }, [
    canManage,
    isPriority,
    isFirst,
    isLast,
    targetQueue,
    song.id,
    onRemove,
    onPromote,
    onDemote,
    onMoveUp,
    onMoveDown,
    onMoveToTop,
    onMoveToBottom,
  ]);

  const accent = isPriority;
  const sourceKey = useMemo(() => getSourceKey(song.sourceUrl), [song.sourceUrl]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <div className="flex items-center gap-3 px-3 py-2 group">
        {/* Index */}
        <span
          className={`font-mono text-[10px] w-4 text-right shrink-0 ${accent ? 'text-accent' : 'text-faint'}`}
        >
          {index + 1}
        </span>

        {/* Thumbnail */}
        <div className="overflow-hidden w-10 h-10 rounded border border-border shrink-0 bg-elevated">
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname || song.title}
            className="w-full h-full"
            imageClassName="scale-[1.33]"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <p className="text-xs font-semibold text-fg leading-tight flex items-center gap-1.5 min-w-0">
            <MusicNoteIcon size={13} weight="fill" className="shrink-0 text-muted" />
            <span className="truncate">{song.nickname || song.title}</span>
          </p>
          <div className="flex items-center gap-2 text-[11px] text-muted min-w-0">
            {song.artist && (
              <span className="max-w-[16ch] flex items-center gap-1 min-w-0">
                <UserIcon size={12} weight="fill" className="shrink-0" />
                <span className="truncate">{song.artist}</span>
              </span>
            )}
            <DurationBadge seconds={song.duration} className="text-[11px]" />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted min-w-0">
            {sourceKey && (
              <span className="flex items-center shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5">
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
            <span className="max-w-[16ch] flex items-center gap-1 min-w-0">
              <UserCircleIcon size={12} weight="fill" className="shrink-0" />
              <span className="truncate">{song.requestedBy}</span>
            </span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 shrink-0">
          <VolumeBoostBadge volumeBoost={song.volumeBoost} />
        </div>

        {/* Actions */}
        {canManage && (
          <Button
            ref={triggerRef}
            variant="inherit"
            surface="base"
            size="icon"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Song actions"
            className={`opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-6 h-6 ${menuOpen ? 'pressed text-accent opacity-100' : 'text-muted hover:text-fg'}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
          >
            <DotsThreeOutlineVerticalIcon size={14} weight="duotone" />
          </Button>
        )}
      </div>
      {menuOpen && (
        <ContextMenu
          items={menuItems}
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          triggerRef={triggerRef}
          align="right"
        />
      )}
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
  elapsed,
  registerProgress,
}: {
  song: QueuedSong;
  elapsed: number;
  registerProgress: (ref: HTMLDivElement | null) => void;
}) {
  const sourceKey = useMemo(() => getSourceKey(song.sourceUrl), [song.sourceUrl]);

  return (
    <div className="card overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <div className="flex gap-4 p-4">
        {/* Artwork */}
        <div className="relative shrink-0 overflow-hidden rounded-xl bg-elevated">
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname || song.title}
            className="w-20 h-20 rounded-xl border border-border"
            imageClassName="scale-[1.33]"
          />
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-center min-w-0 gap-1.5">
          <a
            href={song.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-fg hover:text-accent leading-tight flex items-center gap-1.5 min-w-0"
          >
            <MusicNoteIcon size={13} weight="fill" className="shrink-0 text-muted" />
            <span className="truncate">{song.nickname || song.title}</span>
          </a>
          <div className="flex items-center gap-2 text-[11px] text-muted min-w-0">
            {song.artist && (
              <span className="max-w-[16ch] flex items-center gap-1 min-w-0">
                <UserIcon size={12} weight="fill" className="shrink-0" />
                <span className="truncate">{song.artist}</span>
              </span>
            )}
            <span className="max-w-[16ch] flex items-center gap-1 min-w-0">
              <UserCircleIcon size={12} weight="fill" className="shrink-0" />
              <span className="truncate">{song.requestedBy}</span>
            </span>
            {sourceKey && (
              <span className="flex items-center shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5">
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
            <VolumeBoostBadge volumeBoost={song.volumeBoost} />
          </div>

          {/* Progress */}
          <div className="mt-1">
            <div className="relative h-1.5 w-full bg-elevated rounded-full overflow-hidden">
              <div
                ref={registerProgress}
                className="absolute inset-y-0 left-0 bg-accent rounded-full"
                style={{ width: '0%' }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[10px] text-muted">{formatDuration(elapsed)}</span>
              <span className="font-mono text-[10px] text-muted">
                {formatDuration(song.duration)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

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
