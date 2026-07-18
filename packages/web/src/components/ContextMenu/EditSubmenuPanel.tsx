import { CaretLeftIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import type { MenuItem } from '../ContextMenu';
import { SpringUp } from '../ui/SpringUp';

interface EditSubmenuPanelProps {
  config: NonNullable<MenuItem['editSubmenu']>;
  onBack: () => void;
  onSave: () => void;
}

export function EditSubmenuPanel({ config, onBack, onSave }: EditSubmenuPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Delay focus to let the spring-up animation start.
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

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
      <div className='px-2 py-2'>
        <input
          ref={inputRef}
          className='input text-xs py-1.5 px-2 w-full mb-2'
          value={config.value}
          onChange={(e) => config.onChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onBack();
          }}
          disabled={config.saving}
          placeholder={config.placeholder ?? 'Enter value...'}
        />
        <div className='flex gap-1 justify-end'>
          <button
            type='button'
            onClick={onBack}
            className='text-xs text-muted hover:text-fg px-2 py-1 rounded transition-colors'
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={onSave}
            disabled={config.saving}
            className='text-xs text-accent hover:text-accent/80 px-2 py-1 rounded transition-colors disabled:opacity-50'
          >
            {config.saving ? '...' : 'Save'}
          </button>
        </div>
      </div>
    </SpringUp>
  );
}
