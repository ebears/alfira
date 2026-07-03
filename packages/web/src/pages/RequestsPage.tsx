import type { SongRequest } from '@alfira-bot/server/shared';
import { CheckCircleIcon, TrashIcon, XCircleIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import {
  approveRequest,
  cancelRequest,
  denyRequest,
  type FetchRequestsResult,
  fetchRequests,
} from '../api/api';
import AddSongModal from '../components/AddSongModal';
import { SourceIcon } from '../components/SourceIcons';
import { Button } from '../components/ui/Button';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';

type Tab = 'pending' | 'closed';

export default function RequestsPage() {
  const { user } = useAuth();
  const { isAdminView } = useAdminView();
  const [tab, setTab] = useState<Tab>('pending');
  const [mineOnly, setMineOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [data, setData] = useState<FetchRequestsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = tab === 'pending' ? 'pending' : 'all';
      const result = await fetchRequests(1, 50, {
        status,
        mine: mineOnly || undefined,
      });
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [tab, mineOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await approveRequest(id);
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve.');
    }
  };

  const handleDeny = async (id: string) => {
    setActionError(null);
    try {
      await denyRequest(id);
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to deny.');
    }
  };

  const handleCancel = async (id: string) => {
    setActionError(null);
    try {
      await cancelRequest(id);
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel.');
    }
  };

  const items = data?.items ?? [];
  const countLabel = loading
    ? '—'
    : `${data?.pagination.total ?? 0} request${(data?.pagination.total ?? 0) !== 1 ? 's' : ''}`;

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-fg tracking-wider">Requests</h1>
          <p className="font-mono text-xs text-muted mt-1">{countLabel}</p>
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
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-surface accent-accent"
            />
            <span className="font-mono text-xs text-muted">Only show my requests</span>
          </label>
        )}
      </div>

      {/* Errors */}
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-mono">
          {actionError}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-mono">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-muted font-mono text-sm">
          <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin inline-block" />
          Loading…
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted">
          {tab === 'pending' ? 'No pending requests.' : 'No request history.'}
        </p>
      )}

      {/* Request cards */}
      <div className="space-y-3">
        {items.map((req) => (
          <RequestCard
            key={req.id}
            req={req}
            isOwn={req.requestedBy === user?.discordId}
            isAdmin={isAdminView}
            onApprove={handleApprove}
            onDeny={handleDeny}
            onCancel={handleCancel}
          />
        ))}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddSongModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function RequestCard({
  req,
  isOwn,
  isAdmin,
  onApprove,
  onDeny,
  onCancel,
}: {
  req: SongRequest;
  isOwn: boolean;
  isAdmin: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const isPending = req.status === 'pending';
  const isPlaylist = req.type === 'playlist';
  const thumbnailUrl = isPlaylist
    ? req.playlistData?.thumbnailUrl || req.thumbnailUrl
    : req.artworkUrl || req.thumbnailUrl;

  const statusColors: Record<string, string> = {
    pending: 'bg-warning/10 text-warning border-warning/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    denied: 'bg-danger/10 text-danger border-danger/20',
  };

  const dateLabel = new Date(req.createdAt).toLocaleDateString();

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-elevated border border-border">
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-muted/20 shrink-0 flex items-center justify-center">
          <span className="text-muted text-xs font-mono">{isPlaylist ? 'PL' : 'TR'}</span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-body text-sm text-fg truncate">{req.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {req.sourceName && req.sourceName !== 'playlist' && (
            <SourceIcon sourceKey={req.sourceName} />
          )}
          <span className="font-mono text-[10px] text-muted">{formatSeconds(req.duration)}</span>
          {isPlaylist && req.playlistData && (
            <span className="font-mono text-[10px] text-muted">
              · {req.playlistData.videoCount} tracks
            </span>
          )}
          <span className="font-mono text-[10px] text-muted">
            · {req.requestedByDisplayName ?? req.requestedBy}
          </span>
          <span className="font-mono text-[10px] text-faint">· {dateLabel}</span>
        </div>
        {!isPending && req.reviewedBy && (
          <p className="font-mono text-[10px] text-muted mt-0.5">
            Reviewed {req.closedAt ? new Date(req.closedAt).toLocaleDateString() : ''}
          </p>
        )}
      </div>

      {/* Status badge */}
      <span
        className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border shrink-0 ${
          statusColors[req.status] ?? 'bg-muted/10 text-muted border-muted/20'
        }`}
      >
        {req.status}
      </span>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-2 shrink-0">
          {isOwn && (
            <Button
              variant="inherit"
              onClick={() => onCancel(req.id)}
              surface="elevated"
              title="Cancel request"
            >
              <TrashIcon size={16} weight="duotone" className="text-muted" />
            </Button>
          )}
          {isAdmin && (
            <>
              <Button
                variant="inherit"
                onClick={() => onApprove(req.id)}
                surface="elevated"
                title="Approve"
              >
                <CheckCircleIcon size={16} weight="duotone" className="text-emerald-400" />
              </Button>
              <Button
                variant="inherit"
                onClick={() => onDeny(req.id)}
                surface="elevated"
                title="Deny"
              >
                <XCircleIcon size={16} weight="duotone" className="text-danger" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
