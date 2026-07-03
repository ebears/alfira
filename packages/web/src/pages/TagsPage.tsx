import { deleteTag, fetchTagSongs, fetchTags, updateTag } from '@alfira-bot/server/shared/api';
import type { Song } from '@alfira-bot/server/shared/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useTagColors } from '../context/TagsContext';

const TAG_COLORS = [
  {
    name: 'orange',
    bg: 'light:bg-orange-500/15 bg-orange-500/20',
    text: 'light:text-orange-600 text-orange-300',
  },
  { name: 'sky', bg: 'light:bg-sky-500/15 bg-sky-500/20', text: 'light:text-sky-600 text-sky-300' },
  {
    name: 'emerald',
    bg: 'light:bg-emerald-500/15 bg-emerald-500/20',
    text: 'light:text-emerald-600 text-emerald-300',
  },
  {
    name: 'amber',
    bg: 'light:bg-amber-500/15 bg-amber-500/20',
    text: 'light:text-amber-700 text-amber-300',
  },
  {
    name: 'violet',
    bg: 'light:bg-violet-500/15 bg-violet-500/20',
    text: 'light:text-violet-600 text-violet-300',
  },
] as const;
const TAG_COLOR_NAMES = TAG_COLORS.map((c) => c.name);

function getTagColor(tag: string, explicitColor?: string | null) {
  if (explicitColor) {
    const found = TAG_COLORS.find((c) => c.name === explicitColor);
    if (found) return found;
  }
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) hash = (hash * 33) ^ tag.charCodeAt(i);
  return TAG_COLORS[((hash >>> 0) * 31) % TAG_COLORS.length];
}

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
      const updated = await import('@alfira-bot/server/shared/api').then((m) =>
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
    <div className="p-4 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Tags</h1>
        <p className="font-mono text-xs text-muted mt-2">
          Manage tags & colors
          {loadingTags ? '' : ` • ${allTags.length} tag${allTags.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="flex gap-4 h-105">
        {/* Left pane: tag list */}
        <div className="flex-1 flex flex-col min-w-0 border border-border rounded-md overflow-hidden bg-elevated">
          <div className="px-3 py-2 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags..."
              className="w-full bg-transparent text-sm text-fg placeholder:text-muted outline-none caret-current"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingTags ? (
              <div className="flex items-center justify-center h-20 text-muted text-sm">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-muted text-sm">
                {search ? 'No tags match your search.' : 'No tags yet.'}
              </div>
            ) : (
              filtered.map((tag) => {
                const colors = getTagColor(tag.canonicalName, tag.color);
                const isActive = selected?.nameLower === tag.nameLower;
                return (
                  <button
                    type="button"
                    key={tag.nameLower}
                    onClick={() => selectTag(tag)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-accent/25 text-accent-foreground'
                        : 'hover:bg-secondary text-foreground'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${colors.bg} ${colors.text}`}
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
        <div className="flex-1 flex flex-col min-w-0 border border-border rounded-md overflow-hidden bg-elevated">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted text-sm">
              Select a tag to view and edit its details.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border space-y-1">
                <p className="text-xs font-medium text-fg uppercase tracking-wider">
                  Canonical Name
                </p>
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => editingName !== selected.canonicalName && saveName(editingName)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    editingName !== selected.canonicalName &&
                    saveName(editingName)
                  }
                  className="w-full px-2 py-1 text-sm text-fg bg-secondary rounded border border-border outline-none focus:border-accent transition-colors"
                />
              </div>

              {/* Color picker */}
              <div className="px-4 py-3 border-b border-border space-y-2">
                <p className="text-xs font-medium text-fg uppercase tracking-wider">Color</p>
                <div className="flex gap-2">
                  {TAG_COLOR_NAMES.map((colorName) => {
                    const colorClasses =
                      TAG_COLORS.find((c) => c.name === colorName) ?? TAG_COLORS[0];
                    const isSelected = selected.color != null && selected.color === colorName;
                    return (
                      <button
                        type="button"
                        key={colorName}
                        onClick={() => pickColor(colorName)}
                        title={colorName}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-opacity ${
                          isSelected
                            ? 'opacity-100 ring-2 ring-offset-1 ring-offset-background ring-foreground'
                            : 'opacity-60 hover:opacity-80'
                        } ${colorClasses.bg} ${colorClasses.text}`}
                      >
                        {isSelected ? (
                          <svg
                            className="w-3 h-3"
                            fill="currentColor"
                            viewBox="0 0 12 12"
                            aria-hidden="true"
                          >
                            <path d="M10.28 2.28L4.5 8.06l-2.78-2.79a.5.5 0 0 0-.71.71l3.15 3.15a.5.5 0 0 0 .71 0l6.36-6.36a.5.5 0 0 0 0-.71.5.5 0 0 0-.71 0z" />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Song list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-fg uppercase tracking-wider">
                  {loadingSongs
                    ? 'Loading…'
                    : `${tagSongs.length} song${tagSongs.length !== 1 ? 's' : ''}`}
                </p>
                <div className="space-y-2">
                  {tagSongs.map((song) => (
                    <div
                      key={song.id}
                      className="flex items-center gap-2 py-1 px-2 rounded bg-secondary hover:bg-tertiary transition-colors"
                    >
                      <span className="flex-1 truncate text-sm text-fg">{song.title}</span>
                      <button
                        type="button"
                        onClick={() => removeSong(song)}
                        className="text-muted hover:text-destructive transition-colors"
                        title="Remove from this tag"
                        aria-label="Remove from this tag"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            d="M4 4l8 8M12 4l-8 8"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <div className="px-4 py-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full py-1.5 text-sm rounded text-red-500 hover:text-fg hover:bg-red-500 transition-colors"
                >
                  Delete "{selected.canonicalName}"
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showDeleteConfirm && selected && (
        <ConfirmModal
          title="Delete Tag"
          message={`Delete "${selected.canonicalName}"? It will be removed from all songs.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
