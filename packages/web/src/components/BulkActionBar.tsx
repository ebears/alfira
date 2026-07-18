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
    <div className='fixed bottom-20 md:bottom-18 left-0 right-0 z-50 flex justify-center pb-4 md:pb-6 pointer-events-none'>
      <SpringUp className='pointer-events-auto flex items-center gap-3 px-4 py-3 bg-elevated border border-border rounded-xl shadow-2xl'>
        <span className='text-sm font-mono text-fg tabular-nums'>
          {count} / {totalCount} selected
        </span>

        <button
          type='button'
          className='text-xs text-muted hover:text-accent transition-colors cursor-pointer'
          onClick={allLoadedSelected ? onDeselectAll : onSelectAll}
        >
          {allLoadedSelected ? 'Deselect all' : selectLabel}
        </button>

        <div className='w-px h-5 bg-border' />

        {canDelete && (
          <Button
            variant='danger'
            className='text-xs flex items-center gap-1.5'
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
            className='text-xs flex items-center gap-1.5'
            onClick={onTag}
          >
            <TagIcon size={14} weight='duotone' />
            Edit selected
          </Button>
        )}

        <button
          type='button'
          className='ml-1 p-1 text-muted hover:text-fg transition-colors cursor-pointer'
          onClick={onDeselectAll}
          title='Clear selection'
        >
          <XIcon size={16} weight='bold' />
        </button>
      </SpringUp>
    </div>
  );
}
