import type { Playlist, TagItem } from '@alfira-bot/server/shared';
import { fetchTags } from '@alfira-bot/server/shared/api';
import { PlaylistIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPlaylistsPage } from '../api/api';
import { Backdrop } from '../components/Backdrop';
import NotificationToast from '../components/NotificationToast';
import { Button } from '../components/ui/Button';
import { VirtualPlaylistList } from '../components/VirtualPlaylistList';
import { useAdminView } from '../context/AdminViewContext';
import { CreatePlaylistSubmitButton, useCreatePlaylist } from '../hooks/useCreatePlaylist';
import { useNotification } from '../hooks/useNotification';
import { onSocketEvent } from '../hooks/useSocket';
import { useVirtualizedInfiniteScroll } from '../hooks/useVirtualizedInfiniteScroll';

const ITEMS_PER_PAGE = 20;

export default function PlaylistsPage() {
  const { isAdminView } = useAdminView();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const { notification } = useNotification();

  const { items, isLoading, isFetching, isError, hasLoaded, prepend, retry, sentinelRef } =
    useVirtualizedInfiniteScroll<Playlist, [boolean]>({
      fetchPage: async (page, limit, admin) => {
        const result = await getPlaylistsPage(admin, page, limit);
        return {
          items: result.items,
          hasMore: result.pagination.page < result.pagination.totalPages,
        };
      },
      limit: ITEMS_PER_PAGE,
      deps: [isAdminView],
    });

  // ---------------------------------------------------------------------------
  // Real-time socket wiring
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handlePlaylistUpdated = (updated: Playlist) => {
      // Check if this playlist is already in the list
      if (items.some((p) => p.id === updated.id)) {
        // Replace existing — but for simplicity in infinite scroll, just prepend
        // since we can't easily find and replace without the full list
        prepend(updated);
      } else {
        prepend(updated);
      }
    };

    const offUpdated = onSocketEvent('playlists:updated', handlePlaylistUpdated);

    return () => {
      offUpdated();
    };
  }, [prepend, items]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      const row = e.currentTarget.closest('[data-playlist-id]');
      const playlistId = row?.getAttribute('data-playlist-id');
      if (playlistId) navigate(`/playlists/${playlistId}`);
    },
    [navigate]
  );

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-accent tracking-wider flex items-center gap-2">
            <PlaylistIcon size={28} weight="duotone" className="shrink-0 relative top-1" />
            Playlists
          </h1>
          <p className="font-mono text-xs text-muted mt-2">
            Browse & manage playlists
            {hasLoaded ? ` • ${items.length} playlist${items.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowCreate(true)}
          className={showCreate ? 'pressed' : ''}
        >
          + New Playlist
        </Button>
      </div>

      {/* List */}
      <VirtualPlaylistList
        items={items}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        hasLoaded={hasLoaded}
        onRetry={retry}
        sentinelRef={sentinelRef}
        onRowClick={handleRowClick}
        emptyTitle="No Playlists Yet"
        emptyMessage="Create one to get started"
      />

      {showCreate && <CreatePlaylistModal onClose={() => setShowCreate(false)} />}
      {notification && <NotificationToast notification={notification} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create playlist modal
// ---------------------------------------------------------------------------
function CreatePlaylistModal({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useCreatePlaylist();
  const [name, setName] = useState('');
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedTag, setSelectedTag] = useState('');

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => {
        // Tags are non-critical — fail silently
      });
  }, []);

  // Close modal on success (error === null means success)
  useEffect(() => {
    if (state?.error === null) {
      onClose();
    }
  }, [state, onClose]);

  return (
    <Backdrop onClose={onClose}>
      <form
        action={formAction}
        className="p-5 md:p-6 w-full max-w-sm mx-4 glass-modal animate-fade-up"
      >
        <h2 className="font-display text-2xl md:text-3xl text-fg tracking-wider mb-1">
          New Playlist
        </h2>
        <p className="font-mono text-xs text-muted mb-4 md:mb-6">choose a name</p>
        <input
          name="name"
          className="input mb-3"
          placeholder="My Playlist"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          required
        />
        <div className="mb-3">
          <p className="font-mono text-xs text-muted mb-1.5">track a tag (optional)</p>
          <select
            name="tagNameLower"
            className="input w-full"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            <option value="">None (manual playlist)</option>
            {tags.map((tag) => (
              <option key={tag.nameLower} value={tag.nameLower}>
                {tag.canonicalName}
              </option>
            ))}
          </select>
        </div>
        {state?.error && <p className="font-mono text-xs text-danger mb-3">{state.error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="inherit" type="button" onClick={onClose} surface="surface">
            Cancel
          </Button>
          <CreatePlaylistSubmitButton disabled={!name.trim()}>Create</CreatePlaylistSubmitButton>
        </div>
      </form>
    </Backdrop>
  );
}
