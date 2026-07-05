import type { SongRequest } from '@alfira-bot/server/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { approveRequest, cancelRequest, denyRequest, fetchRequests } from '../api/api';
import AddSongModal from '../components/AddSongModal';
import { Button } from '../components/ui/Button';
import Checkbox from '../components/ui/Checkbox';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import VirtualRequestList from '../components/VirtualRequestList';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import { useVirtualizedInfiniteScroll } from '../hooks/useVirtualizedInfiniteScroll';

type Tab = 'pending' | 'closed';

const ITEMS_PER_PAGE = 20;

export default function RequestsPage() {
  const { user } = useAuth();
  const { isAdminView } = useAdminView();
  const [tab, setTab] = useState<Tab>('pending');
  const [mineOnly, setMineOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoRedirected = useRef(false);

  const {
    items,
    isLoading,
    isFetching,
    isError,
    total,
    hasLoaded,
    removeItem,
    retry,
    reset,
    sentinelRef,
  } = useVirtualizedInfiniteScroll<SongRequest, [string, boolean]>({
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
    deps: [tab, mineOnly],
  });

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await approveRequest(id);
      removeItem(id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve.');
    }
  };

  const handleDeny = async (id: string) => {
    setActionError(null);
    try {
      await denyRequest(id);
      removeItem(id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to deny.');
    }
  };

  const handleCancel = async (id: string) => {
    setActionError(null);
    try {
      await cancelRequest(id);
      removeItem(id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel.');
    }
  };

  const isOwnFn = useCallback(
    (requestedBy: string) => requestedBy === user?.discordId,
    [user?.discordId]
  );

  // Redirect to history if pending is empty after the initial fetch completes.
  // Detected by watching for items[] reference change (setItems always creates a
  // new array). A mount guard skips the initial render + Strict Mode double-invoke.
  const mounted = useRef(false);
  const prevItemsRef = useRef(items);
  useEffect(() => {
    const itemsChanged = prevItemsRef.current !== items;
    prevItemsRef.current = items;

    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!itemsChanged) return;
    if (autoRedirected.current) return;
    if (tab === 'pending' && total === 0) {
      autoRedirected.current = true;
      setTab('closed');
    }
  });

  const countLabel = hasLoaded ? `${total} request${total !== 1 ? 's' : ''}` : '—';

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Requests</h1>
          <p className="font-mono text-xs text-muted mt-2">
            Submit & review requests{hasLoaded ? ` • ${countLabel}` : ''}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowAddModal(true)}
          className={showAddModal ? 'pressed' : ''}
        >
          + Request Song
        </Button>
      </div>

      {/* Tabs + filter */}
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="flex gap-1 bg-elevated rounded-lg p-1">
          <button
            type="button"
            onClick={() => {
              setTab('pending');
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-body transition-colors cursor-pointer ${
              tab === 'pending' ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
            }`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('closed');
              setMineOnly(false);
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-body transition-colors cursor-pointer ${
              tab === 'closed' ? 'bg-accent text-elevated' : 'text-muted hover:text-fg'
            }`}
          >
            History
          </button>
        </div>

        {tab === 'pending' && (
          <label className="flex items-center gap-2 cursor-pointer ml-auto">
            <Checkbox checked={mineOnly} onChange={setMineOnly} />
            <span className="font-mono text-xs text-muted">Only show my requests</span>
          </label>
        )}
      </div>

      {actionError && <ErrorBanner message={actionError} className="mb-4 font-mono" />}

      {/* Virtualized request list */}
      <VirtualRequestList
        items={items}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        isOwnFn={isOwnFn}
        isAdmin={isAdminView}
        hasLoaded={hasLoaded}
        onRetry={retry}
        sentinelRef={sentinelRef}
        onApprove={handleApprove}
        onDeny={handleDeny}
        onCancel={handleCancel}
        emptyTitle={tab === 'pending' ? 'No Pending Requests' : 'No Request History'}
        emptyMessage={
          tab === 'pending' ? 'Nothing to review right now' : 'Submit a request to get started'
        }
      />

      {/* Modals */}
      {showAddModal && (
        <AddSongModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
          }}
          onRequestCreated={() => {
            reset();
          }}
        />
      )}
    </div>
  );
}
