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
import { useCallback, useEffect, useRef, useState } from 'react';
import AddFilterPopover from './AddFilterPopover';
import FilterChips from './FilterChips';
import { Button } from './ui/Button';

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
  textSortFields = [],
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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync local input ← external value (e.g. browser back/forward on SongsPage)
  useEffect(() => {
    setSearchInput(searchValue);
  }, [searchValue]);

  const handleSearchInputChange = useCallback(
    (next: string) => {
      setSearchInput(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  const hasActiveSort = sort !== defaultSort || order !== 'desc';

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
      <div className='flex items-center gap-2 mb-1'>
        {/* Search */}
        <div className='relative flex-1'>
          <MagnifyingGlassIcon
            className='absolute left-3 top-1/2 -translate-y-1/2 text-faint w-4 h-4 md:w-3.5 md:h-3.5'
            weight='duotone'
          />
          <input
            className='input pl-10'
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
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
          onClick={() => setFilterOpen(true)}
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
            onClick={() => setSortOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 ${
              sortOpen || hasActiveSort ? 'pressed text-accent' : ''
            }`}
            title={`Sort by ${sortOptions.find((o) => o.value === sort)?.label ?? sort} (${order === 'asc' ? 'ascending' : 'descending'})`}
          >
            <SortAscendingIcon size={16} weight='duotone' />
            <CaretDownIcon size={10} weight='fill' className='text-faint' />
          </Button>

          {sortOpen && (
            <div className='absolute right-0 top-full mt-1.5 w-48 glass-popover z-20 py-1 origin-top-right'>
              {sortOptions.map((opt) => {
                const isActive = sort === opt.value;
                return (
                  <button
                    key={opt.value}
                    type='button'
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-body transition-colors ${
                      isActive
                        ? 'text-accent bg-accent/5'
                        : 'text-fg hover:bg-surface active:bg-surface/80'
                    }`}
                    onClick={() => handleSortOptionClick(opt.value)}
                  >
                    <span>{opt.label}</span>
                    {isActive && (
                      <button
                        type='button'
                        className='cursor-pointer p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors'
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortOptionClick(opt.value);
                        }}
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
              })}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        {onViewModeChange && (
          <Button
            variant='inherit'
            surface='surface'
            onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}
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
          onClose={() => setFilterOpen(false)}
        />
      )}
    </>
  );
}
