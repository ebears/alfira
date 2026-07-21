import { TagIcon, TrashIcon, XIcon } from '@phosphor-icons/react';

import { Button } from './ui/Button';
import { SpringUp } from './ui/SpringUp';

interface BulkActionBarProps {
  count: number;
  loadedCount: number;
  totalCount: number;
  canDelete: boolean;
  canTag: boolean;
  deleteLabel?: string;
  onDelete: () => void;
  onTag: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  isDeleting?: boolean;
}

export default function BulkActionBar({
  count,
  loadedCount,
  totalCount,
  canDelete,
  canTag,
  deleteLabel = 'Delete selected',
  onDelete,
  onTag,
  onSelectAll,
  onDeselectAll,
  isDeleting,
}: BulkActionBarProps) {
  const allLoadedSelected = count > 0 && count === loadedCount;
  const selectLabel =
    loadedCount < totalCount ? `Select all ${loadedCount}` : `Select all ${totalCount}`;

  return (
    <div className='pointer-events-none fixed right-0 bottom-20 left-0 z-50 flex justify-center pb-4 md:bottom-18 md:pb-6'>
      <SpringUp className='bg-elevated border-border pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl'>
        <span className='text-fg font-mono text-sm tabular-nums'>
          {count} / {totalCount} selected
        </span>

        <button
          type='button'
          className='text-muted hover:text-accent cursor-pointer text-xs transition-colors'
          onClick={allLoadedSelected ? onDeselectAll : onSelectAll}
        >
          {allLoadedSelected ? 'Deselect all' : selectLabel}
        </button>

        <div className='bg-border h-5 w-px' />

        {canDelete && (
          <Button
            variant='danger'
            className='flex items-center gap-1.5 text-xs'
            onClick={onDelete}
            disabled={isDeleting}
          >
            <TrashIcon size={14} weight='duotone' />
            {deleteLabel}
          </Button>
        )}

        {canTag && (
          <Button
            variant='inherit'
            surface='surface'
            className='flex items-center gap-1.5 text-xs'
            onClick={onTag}
          >
            <TagIcon size={14} weight='duotone' />
            Edit selected
          </Button>
        )}

        <button
          type='button'
          className='text-muted hover:text-fg ml-1 cursor-pointer p-1 transition-colors'
          onClick={onDeselectAll}
          title='Clear selection'
        >
          <XIcon size={16} weight='bold' />
        </button>
      </SpringUp>
    </div>
  );
}
