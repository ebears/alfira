import { type SongRequest } from '@alfira/server/shared';
import { formatDuration } from '@alfira/server/shared';
import { CheckCircleIcon, TrashIcon, XCircleIcon } from '@phosphor-icons/react';
import { memo } from 'react';
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
    ? req.playlistData?.thumbnailUrl || req.thumbnailUrl
    : req.artworkUrl || req.thumbnailUrl;
  const dateLabel = new Date(req.createdAt).toLocaleDateString();

  return (
    <Card className='rounded-xl flex items-center gap-4 p-4'>
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <ArtworkImage
          src={thumbnailUrl}
          alt=''
          className='w-14 h-14 rounded-lg shrink-0 border border-border'
        />
      ) : (
        <div className='w-14 h-14 rounded-lg bg-muted/20 shrink-0 flex items-center justify-center'>
          <span className='text-muted text-xs font-mono'>{isPlaylist ? 'PL' : 'TR'}</span>
        </div>
      )}

      {/* Info */}
      <div className='flex-1 min-w-0'>
        <p className='font-body text-sm text-fg truncate'>{req.title}</p>
        <div className='flex items-center gap-1.5 mt-0.5'>
          {req.sourceName && req.sourceName !== 'playlist' && (
            <SourceIcon sourceKey={req.sourceName} />
          )}
          <span className='font-mono text-[10px] text-muted'>{formatDuration(req.duration)}</span>
          {isPlaylist && req.playlistData && (
            <span className='font-mono text-[10px] text-muted'>
              · {req.playlistData.videoCount} tracks
            </span>
          )}
          <span className='font-mono text-[10px] text-muted'>
            · {req.requestedByDisplayName ?? req.requestedBy}
          </span>
          <span className='font-mono text-[10px] text-faint'>· {dateLabel}</span>
        </div>
        {!isPending && req.reviewedBy && (
          <p className='font-mono text-[10px] text-muted mt-0.5'>
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
        <div className='flex items-center gap-2 shrink-0'>
          {isOwn && (
            <Button
              variant='inherit'
              onClick={() => onCancel(req.id)}
              surface='elevated'
              title='Cancel request'
            >
              <TrashIcon size={16} weight='duotone' className='text-muted' />
            </Button>
          )}
          {isAdmin && (
            <>
              <Button
                variant='inherit'
                onClick={() => onApprove(req.id)}
                surface='elevated'
                title='Approve'
              >
                <CheckCircleIcon size={16} weight='duotone' className='text-emerald-400' />
              </Button>
              <Button
                variant='inherit'
                onClick={() => onDeny(req.id)}
                surface='elevated'
                title='Deny'
              >
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
