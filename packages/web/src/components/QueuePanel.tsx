import { type QueuedSong } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
import {
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpIcon,
  BombIcon,
  CircleNotchIcon,
  DotsSixVerticalIcon,
  DotsThreeOutlineVerticalIcon,
  LightningIcon,
  ListIcon,
  MusicNoteIcon,
  PlayIcon,
  PlusCircleIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOnceIcon,
  ShuffleIcon,
  SkipForwardIcon,
  TrashIcon,
  UserCircleIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
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
import { type CooldownState } from '../hooks/useCooldownGuard';
import { SortableListProvider, useSortableItem } from '../hooks/useSortableVirtualList';
import { queueItemVariants } from '../lib/motion';
import { getSourceKey } from '../utils/source';
import { getRandomIdleIcon } from './EmptyState';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { cooldownButtonProps } from './ui/cooldownButtonProps';
import { DurationBadge } from './ui/DurationBadge';
import { Skeleton } from './ui/Skeleton';
import { VolumeBoostBadge } from './ui/VolumeBoostBadge';

/* --------------------------------------------------------------------------
 * Module-level constants — stable references for memoized components
 * -------------------------------------------------------------------------- */

const CARD_BG_STYLE = { background: 'var(--color-base)' } as const;
const ZERO_WIDTH_STYLE = { width: '0%' } as const;
const QUEUE_TRANSITION = { duration: 0.2, ease: 'easeOut' } as const;
const SCROLL_MASK_STYLE = {
  WebkitMaskImage:
    'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)',
  maskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 40px), transparent 100%)',
} as const;

function getVirtualRowStyle(start: number): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${start}px)`,
  };
}

export interface MobileQuickControls {
  currentSong: QueuedSong | null;
  loopMode: 'off' | 'queue' | 'song';
  isShuffled: boolean;
  loopBusy: boolean;
  shuffleBusy: boolean;
  skipBusy: boolean;
  cooldown: CooldownState;
  onSkip: () => void;
  onCycleLoop: () => void;
  onShuffleToggle: () => void;
}

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

  const priorityIds = useMemo(() => priorityQueue.map((s) => s.id), [priorityQueue]);
  const queueIds = useMemo(() => queue.map((s) => s.id), [queue]);

  type VirtualQueueItem =
    | {
        type: 'song';
        variant: 'priority' | 'regular';
        song: QueuedSong;
        listIndex: number;
        key: string;
      }
    | { type: 'header'; variant: 'priority' | 'regular'; key: string };

  const virtualItems: VirtualQueueItem[] = useMemo(() => {
    const items: VirtualQueueItem[] = [];
    if (priorityQueue.length > 0) {
      items.push({ type: 'header', variant: 'priority', key: 'header-priority' });
      for (const [i, song] of priorityQueue.entries()) {
        items.push({
          type: 'song',
          variant: 'priority',
          song,
          listIndex: i,
          key: `p-${song.id}`,
        });
      }
    }
    if (queue.length > 0) {
      items.push({ type: 'header', variant: 'regular', key: 'header-regular' });
      for (const [i, song] of queue.entries()) {
        items.push({
          type: 'song',
          variant: 'regular',
          song,
          listIndex: i,
          key: `r-${song.id}`,
        });
      }
    }
    return items;
  }, [priorityQueue, queue]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getItemKey: (i) => virtualItems[i]!.key,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (virtualItems[i]?.type === 'header' ? 36 : 92),
    overscan: 5,
  });

  const virtualContainerStyle = useMemo(
    () => ({
      height: `${virtualizer.getTotalSize()}px`,
      position: 'relative' as const,
    }),
    [virtualizer]
  );

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
      if (idx <= 0) {
        return;
      }
      const newOrder = [...targetQueue];
      const a = newOrder[idx];
      const b = newOrder[idx - 1];
      if (a && b) {
        newOrder[idx - 1] = a;
        newOrder[idx] = b;
      }
      void reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handleMoveDown = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx < 0 || idx >= targetQueue.length - 1) {
        return;
      }
      const newOrder = [...targetQueue];
      const a = newOrder[idx];
      const b = newOrder[idx + 1];
      if (a && b) {
        newOrder[idx] = b;
        newOrder[idx + 1] = a;
      }
      void reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handleMoveToTop = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx <= 0) {
        return;
      }
      const newOrder = [...targetQueue];
      const [item] = newOrder.splice(idx, 1);
      if (item) {
        newOrder.unshift(item);
      }
      void reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handleMoveToBottom = useCallback(
    (targetQueue: QueuedSong[], songId: string, target: 'queue' | 'priority') => {
      const idx = targetQueue.findIndex((s) => s.id === songId);
      if (idx < 0 || idx >= targetQueue.length - 1) {
        return;
      }
      const newOrder = [...targetQueue];
      const [item] = newOrder.splice(idx, 1);
      if (item) {
        newOrder.push(item);
      }
      void reorderQueue(
        newOrder.map((s) => s.id),
        target
      );
    },
    [reorderQueue]
  );

  const handlePriorityReorder = useCallback(
    async (orderedIds: string[]) => {
      await reorderQueue(orderedIds, 'priority');
    },
    [reorderQueue]
  );

  const handleQueueReorder = useCallback(
    async (orderedIds: string[]) => {
      await reorderQueue(orderedIds, 'queue');
    },
    [reorderQueue]
  );

  const handleToggleMenu = useCallback(() => {
    setMenuOpen(!menuOpen);
  }, [menuOpen]);
  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);
  const handleCloseQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
  }, []);
  const handleAddedQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
  }, []);
  const handleCloseOverride = useCallback(() => {
    setShowOverride(false);
  }, []);
  const handleOverrideDone = useCallback(() => {
    setShowOverride(false);
  }, []);
  const handleConfirmClear = useCallback(async () => {
    setClearConfirm(false);
    await handleClear();
  }, [handleClear]);
  const handleCancelClear = useCallback(() => {
    setClearConfirm(false);
  }, []);

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [];
    if (isAdminView || hasPermission('queue.quickadd')) {
      items.push({
        id: 'quick-add',
        label: 'Quick Add',
        icon: <PlusCircleIcon size={14} weight='duotone' />,
        onClick: () => {
          setShowQuickAdd(true);
        },
      });
    }
    if (isAdminView || hasPermission('queue.override')) {
      items.push({
        id: 'override',
        label: 'Override',
        icon: <PlayIcon size={14} weight='duotone' />,
        danger: true,
        onClick: () => {
          setShowOverride(true);
        },
      });
    }
    if (isAdminView || hasPermission('queue.manage')) {
      items.push({
        id: 'clear-queue',
        label: 'Clear Queue',
        icon: <BombIcon size={14} weight='duotone' />,
        danger: true,
        disabled: clearBusy || isQueueEmpty,
        onClick: () => {
          setClearConfirm(true);
        },
      });
    }
    return items;
  }, [isAdminView, hasPermission, clearBusy, isQueueEmpty]);

  if (loading) {
    return (
      <div className='flex h-full flex-col'>
        <PanelHeader
          triggerRef={triggerRef}
          menuOpen={menuOpen}
          onToggleMenu={handleToggleMenu}
          mobileQuickControls={mobileQuickControls}
          showActions={false}
        />
        <div className='flex-1 space-y-3 p-4'>
          <Skeleton className='h-5 w-48 rounded' />
          <Skeleton className='h-12 w-full rounded' />
          <Skeleton className='h-12 w-full rounded' />
          <Skeleton className='h-12 w-full rounded' />
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col'>
      <PanelHeader
        triggerRef={triggerRef}
        menuOpen={menuOpen}
        onToggleMenu={handleToggleMenu}
        mobileQuickControls={mobileQuickControls}
        showActions={menuItems.length > 0}
      />

      {/* Fixed content: Now Playing */}
      <div className='shrink-0 space-y-4 p-4'>
        <AnimatePresence mode='wait'>
          {currentSong ? (
            <m.div
              key={currentSong.id}
              variants={queueItemVariants}
              initial='initial'
              animate='animate'
              exit='exit'
              transition={QUEUE_TRANSITION}
            >
              <NowPlayingCard
                song={currentSong}
                elapsed={elapsed}
                registerProgress={registerProgress}
              />
            </m.div>
          ) : (
            <m.div
              key='idle'
              variants={queueItemVariants}
              initial='initial'
              animate='animate'
              exit='exit'
              transition={QUEUE_TRANSITION}
            >
              <IdleCard />
            </m.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {priorityQueue.length === 0 && queue.length === 0 && (
          <div className='py-8 text-center'>
            <p className='text-faint font-mono text-[11px]'>queue is empty</p>
          </div>
        )}
      </div>

      {/* Virtualized scroll container */}
      {virtualItems.length > 0 && (
        <div
          ref={scrollRef}
          className='min-h-0 flex-1 overflow-y-auto px-4 pb-4'
          style={SCROLL_MASK_STYLE}
        >
          <div style={virtualContainerStyle}>
            {/* Priority queue section */}
            <SortableListProvider
              itemIds={priorityIds}
              onReorder={handlePriorityReorder}
              scrollContainerRef={scrollRef}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = virtualItems[virtualRow.index];
                if (!item || item.variant !== 'priority') {
                  return null;
                }
                return (
                  <div
                    key={item.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={item.type === 'header' ? undefined : 'pb-1'}
                    style={getVirtualRowStyle(virtualRow.start)}
                  >
                    {item.type === 'header' ? (
                      <h2 className='font-display text-fg text-lg tracking-wider'>
                        <LightningIcon size={16} weight='duotone' className='mr-1 inline' />
                        Up Next
                        <span className='text-accent ml-2 font-mono text-xs tracking-normal normal-case'>
                          {priorityQueue.length}
                        </span>
                      </h2>
                    ) : (
                      <m.div
                        initial='initial'
                        animate='animate'
                        variants={queueItemVariants}
                        transition={QUEUE_TRANSITION}
                      >
                        <QueueSongItem
                          song={item.song}
                          index={item.listIndex}
                          variant='priority'
                          canManage={canManage}
                          targetQueue={priorityQueue}
                          onRemove={handleRemove}
                          onPromote={handlePromote}
                          onDemote={handleDemote}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          onMoveToTop={handleMoveToTop}
                          onMoveToBottom={handleMoveToBottom}
                        />
                      </m.div>
                    )}
                  </div>
                );
              })}
            </SortableListProvider>

            {/* Regular queue section */}
            <SortableListProvider
              itemIds={queueIds}
              onReorder={handleQueueReorder}
              scrollContainerRef={scrollRef}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = virtualItems[virtualRow.index];
                if (!item || item.variant !== 'regular') {
                  return null;
                }
                return (
                  <div
                    key={item.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={item.type === 'header' ? undefined : 'pb-1'}
                    style={getVirtualRowStyle(virtualRow.start)}
                  >
                    {item.type === 'header' ? (
                      <h2 className='font-display text-fg text-lg tracking-wider'>
                        Queue
                        {queue.length > 0 && (
                          <span className='text-muted ml-2 font-mono text-xs tracking-normal normal-case'>
                            {queue.length}
                          </span>
                        )}
                      </h2>
                    ) : (
                      <m.div
                        initial='initial'
                        animate='animate'
                        variants={queueItemVariants}
                        transition={QUEUE_TRANSITION}
                      >
                        <QueueSongItem
                          song={item.song}
                          index={item.listIndex}
                          variant='regular'
                          canManage={canManage}
                          targetQueue={queue}
                          onRemove={handleRemove}
                          onPromote={handlePromote}
                          onDemote={handleDemote}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          onMoveToTop={handleMoveToTop}
                          onMoveToBottom={handleMoveToBottom}
                        />
                      </m.div>
                    )}
                  </div>
                );
              })}
            </SortableListProvider>
          </div>
        </div>
      )}

      {menuOpen && (
        <ContextMenu
          items={menuItems}
          isOpen={menuOpen}
          onClose={handleCloseMenu}
          triggerRef={triggerRef}
          align='right'
        />
      )}

      {/* Modals rendered via portal to escape slideout stacking context */}
      {showQuickAdd &&
        createPortal(
          <QuickAddModal onClose={handleCloseQuickAdd} onAdded={handleAddedQuickAdd} />,
          document.body
        )}
      {showOverride &&
        createPortal(
          <OverrideModal onClose={handleCloseOverride} onOverride={handleOverrideDone} />,
          document.body
        )}
      {clearConfirm &&
        createPortal(
          <ConfirmModal
            title='Clear Queue'
            message='All songs in the queue will be removed. This cannot be undone.'
            confirmLabel='Clear'
            onConfirm={handleConfirmClear}
            onCancel={handleCancelClear}
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
  const { itemRef, dragHandleRef, isDragging, isAnyDragging, isDropTarget } = useSortableItem(
    song.id,
    index
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handleToggleSongMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  }, []);
  const handleCloseSongMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);
  const isPriority = variant === 'priority';
  const isFirst = index === 0;
  const isLast = index >= targetQueue.length - 1;

  const menuItems: MenuItem[] = useMemo(() => {
    if (!canManage) {
      return [];
    }
    const items: MenuItem[] = [];

    // Remove — always available
    items.push({
      id: 'remove',
      label: 'Remove',
      icon: <TrashIcon size={14} weight='duotone' />,
      danger: true,
      onClick: () => onRemove(song.id),
    });

    // Promote — only for regular queue items
    if (!isPriority) {
      items.push({
        id: 'promote',
        label: 'Promote to Up Next',
        icon: <LightningIcon size={14} weight='duotone' />,
        onClick: () => onPromote(song.id),
      });
    }

    // Demote — only for priority queue items
    if (isPriority) {
      items.push({
        id: 'demote',
        label: 'Demote to Queue',
        icon: <ListIcon size={14} weight='duotone' />,
        onClick: () => onDemote(song.id),
      });
    }

    // Reorder controls — for both queues
    if (targetQueue.length > 1) {
      items.push({
        id: 'move-up',
        label: 'Move Up',
        icon: <ArrowUpIcon size={14} weight='duotone' />,
        disabled: isFirst,
        onClick: () => {
          onMoveUp(targetQueue, song.id, isPriority ? 'priority' : 'queue');
        },
      });
      items.push({
        id: 'move-down',
        label: 'Move Down',
        icon: <ArrowDownIcon size={14} weight='duotone' />,
        disabled: isLast,
        onClick: () => {
          onMoveDown(targetQueue, song.id, isPriority ? 'priority' : 'queue');
        },
      });
      items.push({
        id: 'move-top',
        label: 'Move to Top',
        icon: <ArrowLineUpIcon size={14} weight='duotone' />,
        disabled: isFirst,
        onClick: () => {
          onMoveToTop(targetQueue, song.id, isPriority ? 'priority' : 'queue');
        },
      });
      items.push({
        id: 'move-bottom',
        label: 'Move to Bottom',
        icon: <ArrowLineDownIcon size={14} weight='duotone' />,
        disabled: isLast,
        onClick: () => {
          onMoveToBottom(targetQueue, song.id, isPriority ? 'priority' : 'queue');
        },
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
    <div ref={itemRef} className='relative overflow-hidden rounded-lg' style={CARD_BG_STYLE}>
      {/* Drop target highlight */}
      {isDropTarget && (
        <div className='bg-accent/10 pointer-events-none absolute inset-0 z-10 rounded-lg' />
      )}
      <div className={`group flex items-center gap-3 px-3 py-2 ${isDragging ? 'opacity-50' : ''}`}>
        {/* Drag handle */}
        {canManage && (
          <button
            ref={dragHandleRef}
            type='button'
            className={`text-faint hover:text-muted shrink-0 cursor-grab rounded opacity-0 transition-opacity active:cursor-grabbing ${isAnyDragging ? 'opacity-100' : 'group-hover:opacity-100'}`}
            aria-label={`Drag to reorder "${song.nickname ?? song.title}"`}
          >
            <DotsSixVerticalIcon size={18} weight='bold' />
          </button>
        )}

        {/* Index */}
        <span
          className={`w-4 shrink-0 text-right font-mono text-[10px] ${accent ? 'text-accent' : 'text-faint'}`}
        >
          {index + 1}
        </span>

        {/* Thumbnail */}
        <div className='border-border bg-elevated h-10 w-10 shrink-0 overflow-hidden rounded border'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname ?? song.title}
            className='h-full w-full'
            imageClassName='scale-[1.33]'
          />
        </div>

        {/* Info */}
        <div className='flex min-w-0 flex-1 flex-col justify-center gap-0.5'>
          <p className='text-fg flex min-w-0 items-center gap-1.5 text-xs leading-tight font-semibold'>
            <MusicNoteIcon size={13} weight='fill' className='text-muted shrink-0' />
            <span className='truncate'>{song.nickname ?? song.title}</span>
          </p>
          <div className='text-muted flex min-w-0 items-center gap-2 text-[11px]'>
            {song.artist && (
              <span className='flex max-w-[16ch] min-w-0 items-center gap-1'>
                <UserIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.artist}</span>
              </span>
            )}
            <DurationBadge seconds={song.duration} className='text-[11px]' />
          </div>
          <div className='text-muted flex min-w-0 items-center gap-2 text-[11px]'>
            {sourceKey && (
              <span className='flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5'>
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
            <span className='flex max-w-[16ch] min-w-0 items-center gap-1'>
              <UserCircleIcon size={12} weight='fill' className='shrink-0' />
              <span className='truncate'>{song.requestedBy}</span>
            </span>
          </div>
        </div>

        {/* Badges */}
        <div className='flex shrink-0 items-center gap-2'>
          <VolumeBoostBadge volumeBoost={song.volumeBoost} />
        </div>

        {/* Actions */}
        {canManage && (
          <Button
            ref={triggerRef}
            variant='inherit'
            surface='base'
            size='icon'
            aria-haspopup='true'
            aria-expanded={menuOpen}
            aria-label='Song actions'
            className={`h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${menuOpen ? 'pressed text-accent opacity-100' : 'text-muted hover:text-fg'}`}
            onClick={handleToggleSongMenu}
          >
            <DotsThreeOutlineVerticalIcon size={14} weight='duotone' />
          </Button>
        )}
      </div>
      {menuOpen && (
        <ContextMenu
          items={menuItems}
          isOpen={menuOpen}
          onClose={handleCloseSongMenu}
          triggerRef={triggerRef}
          align='right'
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
  showActions = true,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  menuOpen: boolean;
  onToggleMenu: () => void;
  mobileQuickControls?: MobileQuickControls;
  showActions?: boolean;
}) {
  const mqc = mobileQuickControls;
  const isLoopActive = mqc ? mqc.loopMode !== 'off' : false;
  const loopIcon =
    mqc && isLoopActive ? (
      mqc.loopMode === 'song' ? (
        <RepeatOnceIcon size={16} weight='fill' />
      ) : (
        <RepeatIcon size={16} weight='fill' />
      )
    ) : (
      <RepeatIcon size={16} weight='duotone' />
    );

  return (
    <div className='border-border flex shrink-0 items-center justify-between border-b px-4 py-3'>
      <h1 className='font-display text-accent flex items-center gap-2 text-3xl tracking-wider'>
        <QueueIcon size={24} weight='duotone' className='relative top-1 shrink-0' />
        Queue
      </h1>
      <div className='flex items-center gap-1'>
        {mqc && (
          <>
            <Button
              variant='inherit'
              surface='base'
              size='icon'
              {...cooldownButtonProps(mqc.cooldown, {
                onClick: mqc.onSkip,
                disabled: !mqc.currentSong || mqc.skipBusy,
                title: 'Skip',
              })}
              className='text-muted hover:text-fg'
            >
              {mqc.skipBusy ? (
                <CircleNotchIcon size={18} weight='bold' className='animate-spin' />
              ) : (
                <SkipForwardIcon size={20} weight='duotone' />
              )}
            </Button>
            <Button
              variant='inherit'
              surface='base'
              size='icon'
              {...cooldownButtonProps(mqc.cooldown, {
                onClick: mqc.onCycleLoop,
                disabled: !mqc.currentSong || mqc.loopBusy,
                title: `Loop: ${mqc.loopMode}`,
              })}
              className={
                isLoopActive
                  ? 'pressed text-accent hover:text-accent-muted'
                  : 'text-muted hover:text-fg'
              }
            >
              {mqc.loopBusy ? (
                <CircleNotchIcon size={18} weight='bold' className='animate-spin' />
              ) : (
                loopIcon
              )}
            </Button>
            <Button
              variant='inherit'
              surface='base'
              size='icon'
              {...cooldownButtonProps(mqc.cooldown, {
                onClick: mqc.onShuffleToggle,
                disabled: !mqc.currentSong || mqc.shuffleBusy,
                title: mqc.isShuffled ? 'Unshuffle queue' : 'Shuffle queue',
              })}
              className={
                mqc.isShuffled
                  ? 'pressed text-accent hover:text-accent-muted'
                  : 'text-muted hover:text-fg'
              }
            >
              {mqc.shuffleBusy ? (
                <CircleNotchIcon size={18} weight='bold' className='animate-spin' />
              ) : (
                <ShuffleIcon size={20} weight={mqc.isShuffled ? 'fill' : 'duotone'} />
              )}
            </Button>
          </>
        )}
        {showActions && (
          <Button
            ref={triggerRef}
            variant='inherit'
            size='icon'
            type='button'
            aria-haspopup='true'
            aria-expanded={menuOpen}
            title='More actions'
            surface='elevated'
            className={menuOpen ? 'pressed text-accent' : ''}
            onClick={onToggleMenu}
          >
            <DotsThreeOutlineVerticalIcon size={18} weight='duotone' />
          </Button>
        )}
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
    <div className='card overflow-hidden' style={CARD_BG_STYLE}>
      <div className='flex gap-4 p-4'>
        {/* Artwork */}
        <div className='bg-elevated relative shrink-0 overflow-hidden rounded-xl'>
          <ArtworkImage
            src={song.artwork ?? song.thumbnailUrl}
            alt={song.nickname ?? song.title}
            className='border-border h-20 w-20 rounded-xl border'
            imageClassName='scale-[1.33]'
          />
        </div>

        {/* Info */}
        <div className='flex min-w-0 flex-1 flex-col justify-center gap-1.5'>
          <a
            href={song.sourceUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='text-fg hover:text-accent flex min-w-0 items-center gap-1.5 text-xs leading-tight font-semibold'
          >
            <MusicNoteIcon size={13} weight='fill' className='text-muted shrink-0' />
            <span className='truncate'>{song.nickname ?? song.title}</span>
          </a>
          <div className='text-muted flex min-w-0 items-center gap-2 text-[11px]'>
            {song.artist && (
              <span className='flex max-w-[16ch] min-w-0 items-center gap-1'>
                <UserIcon size={12} weight='fill' className='shrink-0' />
                <span className='truncate'>{song.artist}</span>
              </span>
            )}
            <span className='flex max-w-[16ch] min-w-0 items-center gap-1'>
              <UserCircleIcon size={12} weight='fill' className='shrink-0' />
              <span className='truncate'>{song.requestedBy}</span>
            </span>
            {sourceKey && (
              <span className='flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5'>
                <SourceIcon sourceKey={sourceKey} />
              </span>
            )}
            <VolumeBoostBadge volumeBoost={song.volumeBoost} />
          </div>

          {/* Progress */}
          <div className='mt-1'>
            <div className='bg-elevated relative h-1.5 w-full overflow-hidden rounded-full'>
              <div
                ref={registerProgress}
                className='bg-accent absolute inset-y-0 left-0 rounded-full'
                style={ZERO_WIDTH_STYLE}
              />
            </div>
            <div className='mt-1 flex justify-between'>
              <span className='text-muted font-mono text-[10px]'>{formatDuration(elapsed)}</span>
              <span className='text-muted font-mono text-[10px]'>
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
    <div className='card flex items-center justify-center py-8' style={CARD_BG_STYLE}>
      <div className='text-center'>
        <div className='bg-elevated border-border mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border'>
          <Icon size={20} weight='duotone' className='text-faint' />
        </div>
        <p className='font-display text-faint mb-1 text-xl tracking-wider'>Nothing Playing</p>
      </div>
    </div>
  );
});
