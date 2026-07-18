import { CaretLeftIcon } from '@phosphor-icons/react';
import type { SubmenuConfig } from '../ContextMenu';
import { SpringUp } from '../ui/SpringUp';

interface SubmenuPanelProps {
  config: SubmenuConfig;
  onBack: () => void;
  onSelect: (id: string) => void;
}

export function SubmenuPanel({ config, onBack, onSelect }: SubmenuPanelProps) {
  return (
    <SpringUp>
      <div className='flex items-center gap-2 px-3 py-2 border-b border-border'>
        <button
          type='button'
          aria-label='Back to main menu'
          onClick={onBack}
          className='text-muted hover:text-fg p-1 rounded transition-colors'
        >
          <CaretLeftIcon size={14} weight='duotone' />
        </button>
        <span className='font-mono text-xs text-muted truncate'>{config.title}</span>
      </div>
      <div className='max-h-48 overflow-y-auto'>
        {config.items.length === 0 ? (
          <p className='px-3 py-2 text-xs font-mono text-muted'>
            {config.emptyMessage ?? 'no items'}
          </p>
        ) : (
          config.items.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <div className='border-b border-border' />}
              <button
                type='button'
                role='menuitem'
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => onSelect(item.id)}
                className='w-full text-left px-3 py-1.5 text-xs font-mono text-fg hover:bg-border/50 transition-colors duration-100 disabled:opacity-50 flex items-center gap-2'
              >
                {item.icon && <span className='shrink-0'>{item.icon}</span>}
                <span className='truncate'>{item.label}</span>
              </button>
            </div>
          ))
        )}
      </div>
    </SpringUp>
  );
}
