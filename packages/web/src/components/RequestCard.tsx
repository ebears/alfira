import { type SongRequest } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
import { CheckCircleIcon, TrashIcon, XCircleIcon } from '@phosphor-icons/react';
import { memo, useCallback } from 'react';

import { SourceIcon } from './SourceIcons';
import { ArtworkImage } from './ui/ArtworkImage';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export interface RequestCardProps {
  req: SongRequest;
  isOwn: boolean;
  isAdmin: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onCancel: (id: string) => void;
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  denied: 'bg-danger/10 text-danger border-danger/20',
};

export const RequestCard = memo(function RequestCard({
  req,
  isOwn,
  isAdmin,
  onApprove,
  onDeny,
  onCancel,
}: RequestCardProps) {
  const isPending = req.status === 'pending';
  const isPlaylist = req.type === 'playlist';
  const thumbnailUrl = isPlaylist
    ? (req.playlistData?.thumbnailUrl ?? req.thumbnailUrl)
    : (req.artworkUrl ?? req.thumbnailUrl);
  const dateLabel = new Date(req.createdAt).toLocaleDateString();

  const handleCancel = useCallback(() => {
    onCancel(req.id);
  }, [onCancel, req.id]);
  const handleApprove = useCallback(() => {
    onApprove(req.id);
  }, [onApprove, req.id]);
  const handleDeny = useCallback(() => {
    onDeny(req.id);
  }, [onDeny, req.id]);

  return (
    <Card className='flex items-center gap-4 rounded-xl p-4'>
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <ArtworkImage
          src={thumbnailUrl}
          alt=''
          className='border-border h-14 w-14 shrink-0 rounded-lg border'
        />
      ) : (
        <div className='bg-muted/20 flex h-14 w-14 shrink-0 items-center justify-center rounded-lg'>
          <span className='text-muted font-mono text-xs'>{isPlaylist ? 'PL' : 'TR'}</span>
        </div>
      )}

      {/* Info */}
      <div className='min-w-0 flex-1'>
        <p className='font-body text-fg truncate text-sm'>{req.title}</p>
        <div className='mt-0.5 flex items-center gap-1.5'>
          {req.sourceName && req.sourceName !== 'playlist' && (
            <SourceIcon sourceKey={req.sourceName} />
          )}
          <span className='text-muted font-mono text-[10px]'>{formatDuration(req.duration)}</span>
          {isPlaylist && req.playlistData && (
            <span className='text-muted font-mono text-[10px]'>
              · {req.playlistData.videoCount} tracks
            </span>
          )}
          <span className='text-muted font-mono text-[10px]'>
            · {req.requestedByDisplayName ?? req.requestedBy}
          </span>
          <span className='text-faint font-mono text-[10px]'>· {dateLabel}</span>
        </div>
        {!isPending && req.reviewedBy && (
          <p className='text-muted mt-0.5 font-mono text-[10px]'>
            Reviewed {req.closedAt ? new Date(req.closedAt).toLocaleDateString() : ''}
          </p>
        )}
      </div>

      {/* Status badge */}
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${
          statusColors[req.status] ?? 'bg-muted/10 text-muted border-muted/20'
        }`}
      >
        {req.status}
      </span>

      {/* Actions */}
      {isPending && (
        <div className='flex shrink-0 items-center gap-2'>
          {isOwn && (
            <Button
              variant='inherit'
              onClick={handleCancel}
              surface='elevated'
              title='Cancel request'
            >
              <TrashIcon size={16} weight='duotone' className='text-muted' />
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant='inherit' onClick={handleApprove} surface='elevated' title='Approve'>
                <CheckCircleIcon size={16} weight='duotone' className='text-emerald-400' />
              </Button>
              <Button variant='inherit' onClick={handleDeny} surface='elevated' title='Deny'>
                <XCircleIcon size={16} weight='duotone' className='text-danger' />
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
});

export default RequestCard;
