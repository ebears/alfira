import type React from 'react';

import { CaretLeftIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef } from 'react';

import { type MenuItem } from '../ContextMenu';
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
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      config.onChange(e.target.value);
    },
    [config]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        onSave();
      }
      if (e.key === 'Escape') {
        onBack();
      }
    },
    [onSave, onBack]
  );

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
      <div className='px-2 py-2'>
        <input
          ref={inputRef}
          className='input mb-2 w-full px-2 py-1.5 text-xs'
          value={config.value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={config.saving}
          placeholder={config.placeholder ?? 'Enter value...'}
        />
        <div className='flex justify-end gap-1'>
          <button
            type='button'
            onClick={onBack}
            className='text-muted hover:text-fg rounded px-2 py-1 text-xs transition-colors'
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={onSave}
            disabled={config.saving}
            className='text-accent hover:text-accent/80 rounded px-2 py-1 text-xs transition-colors disabled:opacity-50'
          >
            {config.saving ? '...' : 'Save'}
          </button>
        </div>
      </div>
    </SpringUp>
  );
}
