import { CaretLeftIcon } from '@phosphor-icons/react';
import { memo, useCallback } from 'react';

import { type SubmenuConfig } from '../ContextMenu';
import { SpringUp } from '../ui/SpringUp';

interface SubmenuPanelProps {
  config: SubmenuConfig;
  onBack: () => void;
  onSelect: (id: string) => void;
}

interface SubmenuItemProps {
  item: SubmenuConfig['items'][number];
  onSelect: (id: string) => void;
}

const SubmenuItem = memo(function SubmenuItem({ item, onSelect }: SubmenuItemProps) {
  const handleClick = useCallback(() => {
    onSelect(item.id);
  }, [onSelect, item.id]);

  return (
    <button
      type='button'
      role='menuitem'
      tabIndex={-1}
      disabled={item.disabled}
      onClick={handleClick}
      className='text-fg hover:bg-border/50 flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors duration-100 disabled:opacity-50'
    >
      {item.icon != null && <span className='shrink-0'>{item.icon}</span>}
      <span className='truncate'>{item.label}</span>
    </button>
  );
});

export function SubmenuPanel({ config, onBack, onSelect }: SubmenuPanelProps) {
  return (
    <SpringUp>
      <div className='border-border flex items-center gap-2 border-b px-3 py-2'>
        <button
          type='button'
          aria-label='Back to main menu'
          onClick={onBack}
          className='text-muted hover:text-fg rounded p-1 transition-colors'
        >
          <CaretLeftIcon size={14} weight='duotone' />
        </button>
        <span className='text-muted truncate font-mono text-xs'>{config.title}</span>
      </div>
      <div className='max-h-48 overflow-y-auto'>
        {config.items.length === 0 ? (
          <p className='text-muted px-3 py-2 font-mono text-xs'>
            {config.emptyMessage ?? 'no items'}
          </p>
        ) : (
          config.items.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <div className='border-border border-b' />}
              <SubmenuItem item={item} onSelect={onSelect} />
            </div>
          ))
        )}
      </div>
    </SpringUp>
  );
}
