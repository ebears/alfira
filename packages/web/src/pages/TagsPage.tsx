import { deleteTag, fetchTagSongs, fetchTags, updateTag } from '@alfira/server/shared/api';
import { type Song } from '@alfira/server/shared/types';
import { MagnifyingGlassIcon, TagIcon, TrashIcon } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import ConfirmModal from '../components/ConfirmModal';
import EmptyState from '../components/EmptyState';
import TagTicker from '../components/TagTicker';
import { ArtworkImage } from '../components/ui/ArtworkImage';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { useTagColors } from '../context/TagsContext';
import { getTagColorClasses, TAG_COLORS } from '../utils/tagColors';

const TAG_COLOR_NAMES = TAG_COLORS.map((c) => c.name);

interface TagItem {
  canonicalName: string;
  nameLower: string;
  color?: string | null;
}

export default function TagsPage() {
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TagItem | null>(null);
  const [tagSongs, setTagSongs] = useState<Song[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { refreshTags } = useTagColors();

  const [showTagsLoading, setShowTagsLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setShowTagsLoading(true);
    }, 200);
    return () => {
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const tags = await fetchTags();
      setAllTags(tags);
      setLoadingTags(false);
    })();
  }, []);

  const filtered = useMemo(
    () => allTags.filter((t) => t.canonicalName.toLowerCase().includes(search.toLowerCase())),
    [allTags, search]
  );

  const selectTag = useCallback((tag: TagItem) => {
    setSelected(tag);
    setEditingName(tag.canonicalName);
    setLoadingSongs(true);
    void (async () => {
      const songs = await fetchTagSongs(tag.nameLower);
      setTagSongs(songs);
      setLoadingSongs(false);
    })();
  }, []);

  const saveName = useCallback(
    async (nextName: string) => {
      if (!selected || savingName) {
        return;
      }
      setSavingName(true);
      try {
        const { tag } = await updateTag(selected.nameLower, { canonicalName: nextName });
        setAllTags((prev) =>
          prev.map((t) =>
            t.nameLower === selected.nameLower ? { ...t, canonicalName: tag.canonicalName } : t
          )
        );
        setSelected((prev) => (prev ? { ...prev, canonicalName: tag.canonicalName } : null));
        refreshTags();
      } finally {
        setSavingName(false);
      }
    },
    [selected, savingName, refreshTags]
  );

  const pickColor = useCallback(
    async (color: string) => {
      if (!selected) {
        return;
      }
      const effectiveColor = getTagColorClasses(selected.canonicalName, selected.color).name;
      if (effectiveColor === color) {
        return;
      } // already the effective color
      // Optimistic update
      setAllTags((prev) =>
        prev.map((t) => (t.nameLower === selected.nameLower ? { ...t, color } : t))
      );
      setSelected((prev) => (prev ? { ...prev, color } : null));
      await updateTag(selected.nameLower, { color });
      refreshTags();
    },
    [selected, refreshTags]
  );

  const removeSong = useCallback(
    async (song: Song) => {
      if (!selected) {
        return;
      }
      const newTags = (song.tags ?? []).filter(
        (t) => t.toLowerCase() !== selected.nameLower.toLowerCase()
      );
      const updated = await import('@alfira/server/shared/api').then((m) =>
        m.updateSong(song.id, { tags: newTags })
      );
      setTagSongs((prev) => prev.filter((s) => s.id !== updated.id));
    },
    [selected]
  );

  const handleDelete = useCallback(async () => {
    if (!selected) {
      return;
    }
    try {
      await deleteTag(selected.nameLower);
      setAllTags((prev) => prev.filter((t) => t.nameLower !== selected.nameLower));
      setSelected(null);
      setTagSongs([]);
      refreshTags();
    } finally {
      setShowDeleteConfirm(false);
    }
  }, [selected, refreshTags]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  }, []);

  const handleNameBlur = useCallback(() => {
    if (selected && editingName !== selected.canonicalName) {
      void saveName(editingName);
    }
  }, [editingName, saveName, selected]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && selected && editingName !== selected.canonicalName) {
        void saveName(editingName);
      }
    },
    [editingName, saveName, selected]
  );

  const handleShowDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);
  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  return (
    <div className='h-full overflow-y-auto p-4 md:p-8'>
      <PageHeader
        icon={TagIcon}
        title='Tags'
        subtitle={`Manage tags & colors${loadingTags ? '' : ` • ${allTags.length} tag${allTags.length !== 1 ? 's' : ''}`}`}
      />

      <div className='flex min-h-0 flex-1 gap-4'>
        {/* Left pane: tag list */}
        <div className='bg-elevated clay-resting flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg'>
          <div className='px-3 pt-3 pb-2'>
            <div className='relative'>
              <MagnifyingGlassIcon
                className='text-faint absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2'
                weight='duotone'
              />
              <input
                type='text'
                value={search}
                onChange={handleSearchChange}
                placeholder='Search tags...'
                className='input pl-9 text-sm'
              />
            </div>
          </div>

          <div className='flex-1 overflow-y-auto'>
            {loadingTags ? (
              showTagsLoading ? (
                <div className='text-muted flex h-20 items-center justify-center text-sm'>
                  Loading…
                </div>
              ) : null
            ) : filtered.length === 0 ? (
              <EmptyState
                compact
                title={search ? 'No Matches' : 'No Tags Yet'}
                message={
                  search ? 'No tags match your search' : 'Tags are created when you tag songs'
                }
              />
            ) : (
              filtered.map((tag) => {
                const isActive = selected?.nameLower === tag.nameLower;
                return (
                  <TagListItem
                    key={tag.nameLower}
                    tag={tag}
                    isActive={isActive}
                    onSelect={selectTag}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Right pane: tag detail */}
        <div className='bg-elevated clay-resting flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg'>
          {!selected ? (
            <div className='text-muted flex flex-1 items-center justify-center text-sm'>
              Select a tag to view and edit its details.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className='border-border border-b px-4 py-3'>
                <div className='flex items-center gap-2'>
                  <p className='text-fg shrink-0 text-xs font-medium tracking-wider uppercase'>
                    Tag Name
                  </p>
                  <input
                    type='text'
                    value={editingName}
                    onChange={handleNameChange}
                    onBlur={handleNameBlur}
                    onKeyDown={handleNameKeyDown}
                    className='input flex-1 text-sm'
                  />
                  <Button
                    variant='danger'
                    size='icon'
                    onClick={handleShowDelete}
                    title={`Delete "${selected.canonicalName}"`}
                    className='-mr-1 shrink-0'
                  >
                    <TrashIcon size={16} weight='duotone' />
                  </Button>
                </div>
              </div>

              {/* Color picker */}
              <div className='border-border space-y-2 border-b px-4 py-3'>
                <p className='text-fg text-xs font-medium tracking-wider uppercase'>Color</p>
                <div className='flex gap-2'>
                  {TAG_COLOR_NAMES.map((colorName) => {
                    const colorClasses =
                      TAG_COLORS.find((c) => c.name === colorName) ?? TAG_COLORS[0];
                    const isSelected =
                      getTagColorClasses(selected.canonicalName, selected.color).name === colorName;
                    return (
                      <ColorButton
                        key={colorName}
                        colorName={colorName}
                        colorClasses={colorClasses}
                        isSelected={isSelected}
                        onPick={pickColor}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Song list */}
              <div className='flex-1 overflow-y-auto px-4 py-3'>
                <p className='text-fg mb-3 text-xs font-medium tracking-wider uppercase'>
                  {loadingSongs
                    ? 'Loading…'
                    : `${tagSongs.length} song${tagSongs.length !== 1 ? 's' : ''}`}
                </p>
                {tagSongs.length === 0 && !loadingSongs ? (
                  <p className='text-muted py-8 text-center text-sm'>No songs with this tag yet.</p>
                ) : (
                  <div className='space-y-1'>
                    {tagSongs.map((song) => (
                      <TagSongItem key={song.id} song={song} onRemove={removeSong} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && selected && (
        <ConfirmModal
          title='Delete Tag'
          message={`Delete "${selected.canonicalName}"? It will be removed from all songs.`}
          confirmLabel='Delete'
          onConfirm={handleDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memoized sub-components — extracted from inline map callbacks to avoid
// react-perf warnings for inline functions/objects as props.
// ---------------------------------------------------------------------------

const TagListItem = memo(function TagListItem({
  tag,
  isActive,
  onSelect,
}: {
  tag: TagItem;
  isActive: boolean;
  onSelect: (tag: TagItem) => void;
}) {
  const colors = getTagColorClasses(tag.canonicalName, tag.color);
  const handleClick = useCallback(() => {
    onSelect(tag);
  }, [onSelect, tag]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
        isActive ? 'bg-accent/25 text-accent-foreground' : 'hover:bg-accent/10 text-fg'
      }`}
    >
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[13px] font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}
      >
        {tag.canonicalName}
      </span>
    </button>
  );
});

const ColorButton = memo(function ColorButton({
  colorName,
  colorClasses,
  isSelected,
  onPick,
}: {
  colorName: string;
  colorClasses: { bg: string; text: string; name: string };
  isSelected: boolean;
  onPick: (color: string) => void;
}) {
  const handleClick = useCallback(() => {
    onPick(colorName);
  }, [onPick, colorName]);

  return (
    <button
      type='button'
      onClick={handleClick}
      title={colorName}
      className={`border-border/40 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-all ${
        isSelected
          ? 'ring-offset-surface ring-fg opacity-100 ring-2 ring-offset-1'
          : 'opacity-80 hover:opacity-100'
      } ${colorClasses.bg} ${colorClasses.text}`}
    >
      {isSelected ? (
        <svg className='h-3.5 w-3.5' fill='currentColor' viewBox='0 0 12 12' aria-hidden='true'>
          <path d='M10.28 2.28L4.5 8.06l-2.78-2.79a.5.5 0 0 0-.71.71l3.15 3.15a.5.5 0 0 0 .71 0l6.36-6.36a.5.5 0 0 0 0-.71.5.5 0 0 0-.71 0z' />
        </svg>
      ) : null}
    </button>
  );
});

const TagSongItem = memo(function TagSongItem({
  song,
  onRemove,
}: {
  song: Song;
  onRemove: (song: Song) => void;
}) {
  const allTags = song.tags ?? [];
  const handleRemove = useCallback(() => {
    onRemove(song);
  }, [onRemove, song]);

  return (
    <div className='hover:bg-surface/80 group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors'>
      <div className='border-border bg-base h-12 w-12 shrink-0 overflow-hidden rounded border'>
        {(song.artwork ?? song.thumbnailUrl) ? (
          <ArtworkImage src={song.artwork ?? song.thumbnailUrl} alt='' className='h-full w-full' />
        ) : (
          <div className='text-faint flex h-full w-full items-center justify-center text-[10px]' />
        )}
      </div>
      <div className='min-w-0 flex-1'>
        <p className='font-body text-fg truncate text-sm leading-snug'>
          {song.nickname ?? song.title}
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          {song.artist && (
            <span className='text-muted truncate font-mono text-[11px]'>{song.artist}</span>
          )}
          {song.album && (
            <span className='text-faint truncate font-mono text-[11px]'>{song.album}</span>
          )}
        </div>
        {allTags.length > 0 && <TagTicker tags={allTags} />}
      </div>
      <Button
        variant='inherit'
        size='icon'
        surface='base'
        onClick={handleRemove}
        title='Remove from this tag'
        className='shrink-0 opacity-0 transition-opacity group-hover:opacity-100'
      >
        <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 16 16' aria-hidden='true'>
          <path
            d='M4 4l8 8M12 4l-8 8'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </svg>
      </Button>
    </div>
  );
});
