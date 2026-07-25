import { CaretRightIcon } from '@phosphor-icons/react';
import { type ReactNode } from 'react';

import { type MenuItem, type SubmenuConfig } from '../ContextMenu';

interface MenuItemButtonProps {
  item: {
    id: string;
    label: string;
    icon?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    submenu?: SubmenuConfig;
    editSubmenu?: MenuItem['editSubmenu'];
  };
  onClick: () => void;
}

export function MenuItemButton({ item, onClick }: MenuItemButtonProps) {
  const hasSubmenu = item.submenu != null || item.editSubmenu != null;

  return (
    <button
      type='button'
      role='menuitem'
      tabIndex={-1}
      disabled={item.disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-muted/20'} `}
    >
      {item.icon != null && <span className='shrink-0'>{item.icon}</span>}
      <span className='flex-1 truncate'>{item.label}</span>
      {hasSubmenu && (
        <CaretRightIcon size={12} weight='duotone' className='ml-auto shrink-0 opacity-50' />
      )}
    </button>
  );
}
