import { type SongRequest } from '@alfira/server/shared';
import { TrayIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { approveRequest, cancelRequest, denyRequest, fetchRequests } from '../api/api';
import AddSongModal from '../components/AddSongModal';
import { Button } from '../components/ui/Button';
import Checkbox from '../components/ui/Checkbox';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { PageHeader } from '../components/ui/PageHeader';
import VirtualRequestList from '../components/VirtualRequestList';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import { usePaginatedData } from '../hooks/usePaginatedData';

type Tab = 'pending' | 'closed';

const ITEMS_PER_PAGE = 48;

export default function RequestsPage() {
  const { user } = useAuth();
  const { isAdminView } = useAdminView();
  const [tab, setTab] = useState<Tab | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const tabResolved = useRef(false);

  const effectiveTab = tab ?? 'pending';

  const {
    items,
    isLoading,
    isFetching,
    isError,
    total,
    hasMore,
    hasLoaded,
    removeItem,
    fetchNextPage,
    retry,
    reset,
  } = usePaginatedData<SongRequest, [string, boolean]>({
    fetchPage: async (page, limit, currentTab, currentMineOnly) => {
      const status = currentTab === 'pending' ? 'pending' : 'all';
      const result = await fetchRequests(page, limit, {
        status,
        mine: currentMineOnly || undefined,
      });
      return {
        items: result.items,
        hasMore: result.pagination.page < result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    limit: ITEMS_PER_PAGE,
    deps: [effectiveTab, mineOnly],
  });

  const handleApprove = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await approveRequest(id);
        removeItem(id);
      } catch (error: unknown) {
        setActionError(error instanceof Error ? error.message : 'Failed to approve.');
      }
    },
    [removeItem]
  );

  const handleDeny = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await denyRequest(id);
        removeItem(id);
      } catch (error: unknown) {
        setActionError(error instanceof Error ? error.message : 'Failed to deny.');
      }
    },
    [removeItem]
  );

  const handleCancel = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await cancelRequest(id);
        removeItem(id);
      } catch (error: unknown) {
        setActionError(error instanceof Error ? error.message : 'Failed to cancel.');
      }
    },
    [removeItem]
  );

  const isOwnFn = useCallback(
    (requestedBy: string) => requestedBy === user?.discordId,
    [user?.discordId]
  );

  // Determine the initial tab after the first fetch completes.
  // Always fetch pending first; if empty, switch to history. The tab bar
  // stays hidden until resolution is done, preventing a flash of the wrong
  // tab. The skeleton (now shown immediately on dep-change re-fetches)
  // covers the transition when we redirect to history.
  useEffect(() => {
    if (!hasLoaded || tabResolved.current) {
      return;
    }

    if (tab === null) {
      if (total > 0) {
        setTab('pending');
      } else {
        setTab('closed');
      }
      tabResolved.current = true;
    }
  }, [hasLoaded, tab, total]);

  const resolved = tabResolved.current;

  const countLabel = hasLoaded ? `${total} request${total !== 1 ? 's' : ''}` : '—';

  const pageStyle = useMemo(() => ({ paddingBottom: 0 }), []);

  const handleShowAddModal = useCallback(() => {
    setShowAddModal(true);
  }, []);
  const handleHideAddModal = useCallback(() => {
    setShowAddModal(false);
  }, []);

  const handleSelectPendingTab = useCallback(() => {
    setTab('pending');
  }, []);

  const handleSelectHistoryTab = useCallback(() => {
    setTab('closed');
    setMineOnly(false);
  }, []);

  const handleAddedAndClose = useCallback(() => {
    setShowAddModal(false);
  }, []);

  const handleRequestCreated = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className='flex h-full min-h-0 flex-col p-4 md:p-8' style={pageStyle}>
      <PageHeader
        icon={TrayIcon}
        title='Requests'
        subtitle={`Submit & review requests${hasLoaded ? ` • ${countLabel}` : ''}`}
      >
        <Button
          variant='primary'
          onClick={handleShowAddModal}
          className={showAddModal ? 'pressed' : ''}
        >
          + Request Song
        </Button>
      </PageHeader>

      {/* Tabs + filter — hidden until the initial tab is resolved */}
      {resolved && (
        <>
          <div className='mb-4 flex items-center gap-3 md:mb-6'>
            <div className='bg-elevated flex gap-1 rounded-lg p-1'>
              <button
                type='button'
                onClick={handleSelectPendingTab}
                className={`font-body cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors ${
                  tab === 'pending' ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
                }`}
              >
                Pending
              </button>
              <button
                type='button'
                onClick={handleSelectHistoryTab}
                className={`font-body cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors ${
                  tab === 'closed' ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
                }`}
              >
                History
              </button>
            </div>

            {tab === 'pending' && (
              <label className='ml-auto flex cursor-pointer items-center gap-2'>
                <Checkbox checked={mineOnly} onChange={setMineOnly} />
                <span className='text-muted font-mono text-xs'>Only show my requests</span>
              </label>
            )}
          </div>

          {actionError && <ErrorBanner message={actionError} className='mb-4 font-mono' />}
        </>
      )}

      {/* Virtualized request list */}
      <VirtualRequestList
        items={items}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        hasMore={hasMore}
        isOwnFn={isOwnFn}
        isAdmin={isAdminView}
        hasLoaded={hasLoaded}
        onRetry={retry}
        onFetchMore={fetchNextPage}
        onApprove={handleApprove}
        onDeny={handleDeny}
        onCancel={handleCancel}
        emptyTitle={effectiveTab === 'pending' ? 'No Pending Requests' : 'No Request History'}
        emptyMessage={
          effectiveTab === 'pending'
            ? 'Nothing to review right now'
            : 'Submit a request to get started'
        }
      />

      {/* Modals */}
      {showAddModal && (
        <AddSongModal
          onClose={handleHideAddModal}
          onAdded={handleAddedAndClose}
          onRequestCreated={handleRequestCreated}
        />
      )}
    </div>
  );
}
