import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CheckSquareIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  RowsIcon,
  SortAscendingIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import AddFilterPopover from './AddFilterPopover';
import FilterChips from './FilterChips';
import { Button } from './ui/Button';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_TEXT_SORT_FIELDS: string[] = [];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SortOption {
  value: string;
  label: string;
}

export interface ListToolbarProps {
  // ── Search ──
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  // ── Sort ──
  sortOptions: SortOption[];
  sort: string;
  order: 'asc' | 'desc';
  onSortChange: (field: string, order: 'asc' | 'desc') => void;
  /** The default (no-op) sort field. Controls pressed state of the sort button. */
  defaultSort: string;
  /**
   * Sort fields where ascending means A→Z. The arrow icon is flipped for these.
   * Fields not listed here are treated as numeric/date (asc = lowest first).
   */
  textSortFields?: string[];

  // ── Filters ──
  filterTags: string[];
  filterSources: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onAddSource: (source: string) => void;
  onRemoveSource: (source: string) => void;

  // ── Bulk selection toggle ──
  showBulkToggle?: boolean;
  selectionMode?: boolean;
  onToggleSelectionMode?: () => void;

  // ── View mode toggle ──
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sortOptions,
  sort,
  order,
  onSortChange,
  defaultSort,
  textSortFields = EMPTY_TEXT_SORT_FIELDS,
  filterTags,
  filterSources,
  onAddTag,
  onRemoveTag,
  onAddSource,
  onRemoveSource,
  showBulkToggle = false,
  selectionMode = false,
  onToggleSelectionMode,
  viewMode,
  onViewModeChange,
}: ListToolbarProps) {
  // ── Search (local mirror + debounce) ─────────────────────────────
  const [searchInput, setSearchInput] = useState(searchValue);
  // eslint-disable-next-line unicorn/no-useless-undefined
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local input ← external value (e.g. browser back/forward on SongsPage)
  useEffect(() => {
    setSearchInput(searchValue);
  }, [searchValue]);

  const handleSearchInputChange = useCallback(
    (next: string) => {
      setSearchInput(next);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onSearchChange(next);
      }, 250);
    },
    [onSearchChange]
  );

  // ── Sort dropdown ────────────────────────────────────────────────
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!sortOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [sortOpen]);

  const hasActiveSort = sort !== defaultSort || order !== 'desc';

  const handleOpenFilter = useCallback(() => {
    setFilterOpen(true);
  }, []);
  const handleCloseFilter = useCallback(() => {
    setFilterOpen(false);
  }, []);
  const handleToggleSort = useCallback(() => {
    setSortOpen((v) => !v);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleSearchInputChange(e.target.value);
    },
    [handleSearchInputChange]
  );

  const handleViewModeToggle = useCallback(
    () => onViewModeChange?.(viewMode === 'grid' ? 'list' : 'grid'),
    [onViewModeChange, viewMode]
  );

  const handleSortOptionClick = useCallback(
    (field: string) => {
      if (field === sort) {
        // Toggle order
        onSortChange(field, order === 'asc' ? 'desc' : 'asc');
      } else {
        // New field — determine default order: text fields → asc, numeric/date → desc
        const newOrder = textSortFields.includes(field) ? 'asc' : 'desc';
        onSortChange(field, newOrder);
      }
      setSortOpen(false);
    },
    [sort, order, textSortFields, onSortChange]
  );

  // Direction arrow: text fields show ↓ when ascending (A→Z = down),
  // numeric/date fields show ↑ when ascending (lowest first = up).
  const isTextField = textSortFields.includes(sort);
  const showDownArrow = isTextField ? order === 'asc' : order !== 'asc';

  // ── Filter popover ───────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const hasActiveFilters = filterTags.length > 0 || filterSources.length > 0;

  return (
    <>
      {/* ── Toolbar ── */}
      <div className='mb-1 flex items-center gap-2'>
        {/* Search */}
        <div className='relative flex-1'>
          <MagnifyingGlassIcon
            className='text-faint absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 md:h-3.5 md:w-3.5'
            weight='duotone'
          />
          <input
            className='input pl-10'
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={handleSearchChange}
          />
        </div>

        {/* Bulk selection toggle */}
        {showBulkToggle && (
          <Button
            variant='inherit'
            surface='surface'
            onClick={onToggleSelectionMode}
            className={`flex items-center gap-1.5 px-2.5 ${
              selectionMode ? 'pressed text-accent' : ''
            }`}
            title={selectionMode ? 'Exit selection mode' : 'Select items'}
          >
            <CheckSquareIcon size={16} weight='duotone' />
          </Button>
        )}

        {/* Filter button */}
        <Button
          variant='inherit'
          surface='surface'
          onClick={handleOpenFilter}
          className={`flex items-center gap-1.5 px-2.5 ${
            hasActiveFilters ? 'pressed text-accent' : ''
          }`}
          title={`Filter${hasActiveFilters ? ` (${filterTags.length + filterSources.length} active)` : ''}`}
        >
          <FunnelIcon size={16} weight='duotone' />
        </Button>

        {/* Sort dropdown */}
        <div className='relative' ref={sortRef}>
          <Button
            variant='inherit'
            surface='surface'
            onClick={handleToggleSort}
            className={`flex items-center gap-1.5 px-2.5 ${
              sortOpen || hasActiveSort ? 'pressed text-accent' : ''
            }`}
            title={`Sort by ${sortOptions.find((o) => o.value === sort)?.label ?? sort} (${order === 'asc' ? 'ascending' : 'descending'})`}
          >
            <SortAscendingIcon size={16} weight='duotone' />
            <CaretDownIcon size={10} weight='fill' className='text-faint' />
          </Button>

          {sortOpen && (
            <div className='glass-popover absolute top-full right-0 z-20 mt-1.5 w-48 origin-top-right py-1'>
              {sortOptions.map((opt) => {
                const isActive = sort === opt.value;
                return (
                  <SortOptionItem
                    key={opt.value}
                    opt={opt}
                    isActive={isActive}
                    showDownArrow={showDownArrow}
                    order={order}
                    onClick={handleSortOptionClick}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        {onViewModeChange && (
          <Button
            variant='inherit'
            surface='surface'
            onClick={handleViewModeToggle}
            className='flex items-center gap-1.5 px-2.5'
            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {viewMode === 'grid' ? (
              <RowsIcon size={16} weight='duotone' />
            ) : (
              <SquaresFourIcon size={16} weight='duotone' />
            )}
          </Button>
        )}
      </div>

      {/* ── Filter chips ── */}
      {hasActiveFilters && (
        <div className='mb-1'>
          <FilterChips
            tags={filterTags}
            sources={filterSources}
            onRemoveTag={onRemoveTag}
            onRemoveSource={onRemoveSource}
          />
        </div>
      )}

      {/* ── Filter popover ── */}
      {filterOpen && (
        <AddFilterPopover
          activeTags={filterTags}
          activeSources={filterSources}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          onAddSource={onAddSource}
          onRemoveSource={onRemoveSource}
          onClose={handleCloseFilter}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort option item — memoized to avoid per-item inline callbacks
// ---------------------------------------------------------------------------

const SortOptionItem = memo(function SortOptionItem({
  opt,
  isActive,
  showDownArrow,
  order,
  onClick,
}: {
  opt: SortOption;
  isActive: boolean;
  showDownArrow: boolean;
  order: 'asc' | 'desc';
  onClick: (value: string) => void;
}) {
  const handleClick = useCallback(() => {
    onClick(opt.value);
  }, [onClick, opt.value]);
  const handleArrowClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(opt.value);
    },
    [onClick, opt.value]
  );

  return (
    <button
      type='button'
      className={`font-body flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
        isActive ? 'text-accent bg-accent/5' : 'text-fg hover:bg-surface active:bg-surface/80'
      }`}
      onClick={handleClick}
    >
      <span>{opt.label}</span>
      {isActive && (
        <button
          type='button'
          className='cursor-pointer rounded p-0.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10'
          onClick={handleArrowClick}
          title={order === 'asc' ? 'Switch to descending' : 'Switch to ascending'}
        >
          {showDownArrow ? (
            <ArrowDownIcon size={14} weight='bold' />
          ) : (
            <ArrowUpIcon size={14} weight='bold' />
          )}
        </button>
      )}
    </button>
  );
});
