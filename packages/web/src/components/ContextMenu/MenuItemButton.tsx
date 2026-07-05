import { CaretRightIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { MenuItem, SubmenuConfig } from '../ContextMenu';

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
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={item.disabled}
      onClick={onClick}
      className={`
				w-full text-left px-3 py-1.5 text-xs font-mono
				flex items-center gap-2
				transition-colors duration-100
				disabled:opacity-50 disabled:cursor-not-allowed
				${item.danger ? 'text-danger hover:bg-danger/10' : 'text-fg hover:bg-muted/20'}
			`}
    >
      {item.icon && <span className="shrink-0">{item.icon}</span>}
      <span className="truncate flex-1">{item.label}</span>
      {(item.submenu || item.editSubmenu) && (
        <CaretRightIcon size={12} weight="duotone" className="shrink-0 ml-auto opacity-50" />
      )}
    </button>
  );
}
