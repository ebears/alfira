import { deleteTag, fetchTagSongs, fetchTags, updateTag } from '@alfira/server/shared/api';
import type { Song } from '@alfira/server/shared/types';
import { MagnifyingGlassIcon, TagIcon, TrashIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
    const t = setTimeout(() => setShowTagsLoading(true), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetchTags()
      .then(setAllTags)
      .finally(() => setLoadingTags(false));
  }, []);

  const filtered = useMemo(
    () => allTags.filter((t) => t.canonicalName.toLowerCase().includes(search.toLowerCase())),
    [allTags, search]
  );

  const selectTag = useCallback((tag: TagItem) => {
    setSelected(tag);
    setEditingName(tag.canonicalName);
    setLoadingSongs(true);
    fetchTagSongs(tag.nameLower)
      .then(setTagSongs)
      .finally(() => setLoadingSongs(false));
  }, []);

  const saveName = useCallback(
    async (nextName: string) => {
      if (!selected || savingName) return;
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
      if (!selected) return;
      const effectiveColor = getTagColorClasses(selected.canonicalName, selected.color).name;
      if (effectiveColor === color) return; // already the effective color
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
      if (!selected) return;
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
    if (!selected) return;
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

  return (
    <div className='p-4 md:p-8 h-full overflow-y-auto pb-24 md:pb-20'>
      <PageHeader
        icon={TagIcon}
        title='Tags'
        subtitle={`Manage tags & colors${loadingTags ? '' : ` • ${allTags.length} tag${allTags.length !== 1 ? 's' : ''}`}`}
      />

      <div className='flex gap-4 flex-1 min-h-0'>
        {/* Left pane: tag list */}
        <div className='flex-1 flex flex-col min-w-0 bg-elevated clay-resting rounded-lg overflow-hidden'>
          <div className='px-3 pt-3 pb-2'>
            <div className='relative'>
              <MagnifyingGlassIcon
                className='absolute left-3 top-1/2 -translate-y-1/2 text-faint w-3.5 h-3.5'
                weight='duotone'
              />
              <input
                type='text'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search tags...'
                className='input text-sm pl-9'
              />
            </div>
          </div>

          <div className='flex-1 overflow-y-auto'>
            {loadingTags ? (
              showTagsLoading ? (
                <div className='flex items-center justify-center h-20 text-muted text-sm'>
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
                const colors = getTagColorClasses(tag.canonicalName, tag.color);
                const isActive = selected?.nameLower === tag.nameLower;
                return (
                  <button
                    type='button'
                    key={tag.nameLower}
                    onClick={() => selectTag(tag)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-accent/25 text-accent-foreground'
                        : 'hover:bg-accent/10 text-fg'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[13px] font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}
                    >
                      {tag.canonicalName}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right pane: tag detail */}
        <div className='flex-1 flex flex-col min-w-0 bg-elevated clay-resting rounded-lg overflow-hidden'>
          {!selected ? (
            <div className='flex-1 flex items-center justify-center text-muted text-sm'>
              Select a tag to view and edit its details.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className='px-4 py-3 border-b border-border'>
                <div className='flex items-center gap-2'>
                  <p className='text-xs font-medium text-fg uppercase tracking-wider shrink-0'>
                    Tag Name
                  </p>
                  <input
                    type='text'
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => editingName !== selected.canonicalName && saveName(editingName)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      editingName !== selected.canonicalName &&
                      saveName(editingName)
                    }
                    className='input text-sm flex-1'
                  />
                  <Button
                    variant='danger'
                    size='icon'
                    onClick={() => setShowDeleteConfirm(true)}
                    title={`Delete "${selected.canonicalName}"`}
                    className='shrink-0 -mr-1'
                  >
                    <TrashIcon size={16} weight='duotone' />
                  </Button>
                </div>
              </div>

              {/* Color picker */}
              <div className='px-4 py-3 border-b border-border space-y-2'>
                <p className='text-xs font-medium text-fg uppercase tracking-wider'>Color</p>
                <div className='flex gap-2'>
                  {TAG_COLOR_NAMES.map((colorName) => {
                    const colorClasses =
                      TAG_COLORS.find((c) => c.name === colorName) ?? TAG_COLORS[0];
                    const isSelected =
                      getTagColorClasses(selected.canonicalName, selected.color).name === colorName;
                    return (
                      <button
                        type='button'
                        key={colorName}
                        onClick={() => pickColor(colorName)}
                        title={colorName}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border border-border/40 ${
                          isSelected
                            ? 'opacity-100 ring-2 ring-offset-1 ring-offset-surface ring-fg'
                            : 'opacity-80 hover:opacity-100'
                        } ${colorClasses.bg} ${colorClasses.text}`}
                      >
                        {isSelected ? (
                          <svg
                            className='w-3.5 h-3.5'
                            fill='currentColor'
                            viewBox='0 0 12 12'
                            aria-hidden='true'
                          >
                            <path d='M10.28 2.28L4.5 8.06l-2.78-2.79a.5.5 0 0 0-.71.71l3.15 3.15a.5.5 0 0 0 .71 0l6.36-6.36a.5.5 0 0 0 0-.71.5.5 0 0 0-.71 0z' />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Song list */}
              <div className='flex-1 overflow-y-auto px-4 py-3'>
                <p className='text-xs font-medium text-fg uppercase tracking-wider mb-3'>
                  {loadingSongs
                    ? 'Loading…'
                    : `${tagSongs.length} song${tagSongs.length !== 1 ? 's' : ''}`}
                </p>
                {tagSongs.length === 0 && !loadingSongs ? (
                  <p className='text-sm text-muted text-center py-8'>No songs with this tag yet.</p>
                ) : (
                  <div className='space-y-1'>
                    {tagSongs.map((song) => {
                      const allTags = song.tags ?? [];
                      return (
                        <div
                          key={song.id}
                          className='flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-surface/80 transition-colors group'
                        >
                          <div className='w-12 h-12 rounded border border-border shrink-0 overflow-hidden bg-base'>
                            {(song.artwork ?? song.thumbnailUrl) ? (
                              <ArtworkImage
                                src={song.artwork ?? song.thumbnailUrl}
                                alt=''
                                className='w-full h-full'
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center text-faint text-[10px]' />
                            )}
                          </div>
                          <div className='flex-1 min-w-0'>
                            <p className='font-body text-sm text-fg truncate leading-snug'>
                              {song.nickname || song.title}
                            </p>
                            <div className='flex items-center gap-2 flex-wrap'>
                              {song.artist && (
                                <span className='font-mono text-[11px] text-muted truncate'>
                                  {song.artist}
                                </span>
                              )}
                              {song.album && (
                                <span className='font-mono text-[11px] text-faint truncate'>
                                  {song.album}
                                </span>
                              )}
                            </div>
                            {allTags.length > 0 && <TagTicker tags={allTags} />}
                          </div>
                          <Button
                            variant='inherit'
                            size='icon'
                            surface='base'
                            onClick={() => removeSong(song)}
                            title='Remove from this tag'
                            className='shrink-0 opacity-0 group-hover:opacity-100 transition-opacity'
                          >
                            <svg
                              className='w-3.5 h-3.5'
                              fill='none'
                              viewBox='0 0 16 16'
                              aria-hidden='true'
                            >
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
                    })}
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
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
