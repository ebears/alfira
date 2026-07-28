import { type Playlist, type TagItem } from '@alfira/server/shared';
import { PlaylistIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { fetchTags, getPlaylistsPage } from '../api/api';
import { Backdrop } from '../components/Backdrop';
import NotificationToast from '../components/NotificationToast';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { SpringUp } from '../components/ui/SpringUp';
import { VirtualPlaylistList } from '../components/VirtualPlaylistList';
import { useAdminView } from '../context/AdminViewContext';
import { CreatePlaylistSubmitButton, useCreatePlaylist } from '../hooks/useCreatePlaylist';
import { useNotification } from '../hooks/useNotification';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { onSocketEvent } from '../hooks/useSocket';

const ITEMS_PER_PAGE = 48;

export default function PlaylistsPage() {
  const { isAdminView } = useAdminView();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const { notification } = useNotification();

  const {
    items,
    isLoading,
    isFetching,
    isError,
    hasMore,
    hasLoaded,
    fetchNextPage,
    prepend,
    retry,
  } = usePaginatedData<Playlist, [boolean]>({
    fetchPage: async (page, limit, admin) => {
      const result = await getPlaylistsPage(admin, page, limit);
      return {
        items: result.items,
        hasMore: result.pagination.page < result.pagination.totalPages,
        total: result.pagination.total,
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
      const row = e.currentTarget.closest<HTMLElement>('[data-playlist-id]');
      const playlistId = row?.dataset.playlistId;
      if (playlistId) {
        void navigate(`/playlists/${playlistId}`);
      }
    },
    [navigate]
  );

  const pageStyle = useMemo(() => ({ paddingBottom: 0 }), []);

  const handleShowCreate = useCallback(() => {
    setShowCreate(true);
  }, []);
  const handleHideCreate = useCallback(() => {
    setShowCreate(false);
  }, []);

  return (
    <div className='flex h-full min-h-0 flex-col p-4 md:p-8' style={pageStyle}>
      <PageHeader
        icon={PlaylistIcon}
        title='Playlists'
        subtitle={`Browse & manage playlists${hasLoaded ? ` • ${items.length} playlist${items.length !== 1 ? 's' : ''}` : ''}`}
      >
        <Button
          variant='primary'
          onClick={handleShowCreate}
          className={showCreate ? 'pressed' : ''}
        >
          + New Playlist
        </Button>
      </PageHeader>

      {/* List */}
      <VirtualPlaylistList
        items={items}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        hasMore={hasMore}
        hasLoaded={hasLoaded}
        onRetry={retry}
        onFetchMore={fetchNextPage}
        onRowClick={handleRowClick}
        emptyTitle='No Playlists Yet'
        emptyMessage='Create one to get started'
      />

      {showCreate && <CreatePlaylistModal onClose={handleHideCreate} />}
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
    void (async () => {
      try {
        const tags = await fetchTags();
        setTags(tags);
      } catch {
        // Tags are non-critical — fail silently
      }
    })();
  }, []);

  // Close modal on success (error === null means success)
  useEffect(() => {
    if (state?.error === null) {
      onClose();
    }
  }, [state, onClose]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleTagChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTag(e.target.value);
  }, []);

  return (
    <Backdrop onClose={onClose}>
      <SpringUp className='glass-modal mx-4 w-full max-w-sm p-5 md:p-6'>
        <form action={formAction}>
          <h2 className='font-display text-fg mb-1 text-2xl tracking-wider md:text-3xl'>
            New Playlist
          </h2>
          <p className='text-muted mb-4 font-mono text-xs md:mb-6'>choose a name</p>
          <input
            name='name'
            className='input mb-3'
            placeholder='My Playlist'
            value={name}
            onChange={handleNameChange}
            onKeyDown={handleNameKeyDown}
            required
          />
          <div className='mb-3'>
            <p className='text-muted mb-1.5 font-mono text-xs'>track a tag (optional)</p>
            <select
              name='tagNameLower'
              className='input w-full'
              value={selectedTag}
              onChange={handleTagChange}
            >
              <option value=''>None (manual playlist)</option>
              {tags.map((tag) => (
                <option key={tag.nameLower} value={tag.nameLower}>
                  {tag.canonicalName}
                </option>
              ))}
            </select>
          </div>
          {state?.error && <p className='text-danger mb-3 font-mono text-xs'>{state.error}</p>}
          <div className='flex justify-end gap-2'>
            <Button variant='inherit' type='button' onClick={onClose} surface='surface'>
              Cancel
            </Button>
            <CreatePlaylistSubmitButton disabled={!name.trim()}>Create</CreatePlaylistSubmitButton>
          </div>
        </form>
      </SpringUp>
    </Backdrop>
  );
}
