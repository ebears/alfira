import { DotsThreeOutlineVerticalIcon } from '@phosphor-icons/react';
import {
  type ReactNode,
  type RefObject,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { EditSubmenuPanel } from './ContextMenu/EditSubmenuPanel';
import { MenuItemButton } from './ContextMenu/MenuItemButton';
import { SubmenuPanel } from './ContextMenu/SubmenuPanel';
import { Button } from './ui/Button';

// --- Types ---

export interface SubmenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface SubmenuConfig {
  title: string;
  items: SubmenuItem[];
  onSelect: (id: string) => void;
  emptyMessage?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  submenu?: SubmenuConfig;
  editSubmenu?: {
    title: string;
    value: string;
    onChange: (val: string) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    placeholder?: string;
  };
  info?: { label: string; icon?: ReactNode };
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  align?: 'left' | 'right';
}

// --- Trigger ---

export function ContextMenuTrigger({
  onToggle,
  isOpen,
  ref,
  className,
  surface,
  size,
  style,
  variant,
  onMouseDown,
}: {
  onToggle: () => void;
  isOpen: boolean;
  ref: RefObject<HTMLButtonElement | null>;
  className?: string;
  surface?: 'base' | 'surface' | 'elevated';
  size?: 'default' | 'icon';
  style?: React.CSSProperties;
  variant?: 'inherit' | 'surface';
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle();
    },
    [onToggle]
  );

  return (
    <Button
      ref={ref}
      variant={variant ?? 'inherit'}
      size={size ?? 'icon'}
      aria-haspopup='true'
      aria-expanded={isOpen}
      title='More actions'
      surface={surface ?? 'elevated'}
      style={style}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      className={`${className ?? ''} ${isOpen ? 'pressed text-accent' : ''}`}
    >
      <DotsThreeOutlineVerticalIcon size={18} weight='duotone' />
    </Button>
  );
}

// --- Menu ---

export function ContextMenu({
  items,
  isOpen,
  onClose,
  triggerRef,
  align = 'right',
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuConfig | null>(null);
  // Store the item ID, not the object, so we always get fresh values from items
  const [activeEditItemId, setActiveEditItemId] = useState<string | null>(null);
  const [submenuParentIndex, setSubmenuParentIndex] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Look up the current editSubmenu config from items (always fresh)
  const activeEditItem = activeEditItemId ? items.find((i) => i.id === activeEditItemId) : null;
  const activeEditSubmenu = activeEditItem?.editSubmenu ?? null;

  const currentItems = (
    activeSubmenu
      ? activeSubmenu.items.map((item) => ({
          id: item.id,
          label: item.label,
          icon: item.icon,
          disabled: item.disabled,
        }))
      : activeEditItemId
        ? []
        : items
  ) as { id: string; label: string; icon?: ReactNode; disabled?: boolean }[];
  const currentItemsRef = useRef(currentItems);
  currentItemsRef.current = currentItems;

  // Position calculation — useLayoutEffect runs before paint, preventing a (0,0) flash.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return;
    }

    const lastUpdateRef = { current: 0 };

    const updatePosition = () => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 16) {
        return;
      } // ~60fps throttle
      lastUpdateRef.current = now;

      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 192; // min-w-48 = 12rem = 192px
      const menuHeight = menuRef.current?.offsetHeight ?? 200;

      let top = rect.bottom + 4;
      let left = align === 'right' ? rect.right - menuWidth : rect.left;

      // Clamp to viewport
      if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - 4;
      }
      if (left < 8) {
        left = 8;
      }
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef, align]);

  // Reset submenu and focus when opening (useEffect is fine — not position-critical)
  useEffect(() => {
    if (isOpen) {
      setActiveSubmenu(null);
      setActiveEditItemId(null);
      setFocusedIndex(0);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [isOpen, onClose, triggerRef]);

  // Close on Escape (or go back from submenu)
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeSubmenu || activeEditItemId) {
          activeEditSubmenu?.onCancel();
          setActiveSubmenu(null);
          setActiveEditItemId(null);
          setFocusedIndex(submenuParentIndex);
        } else {
          onClose();
          triggerRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    isOpen,
    onClose,
    triggerRef,
    activeSubmenu,
    activeEditItemId,
    activeEditSubmenu,
    submenuParentIndex,
  ]);

  // Keyboard navigation
  const handleBackFromSubmenu = useCallback(() => {
    setActiveSubmenu(null);
    setFocusedIndex(submenuParentIndex);
  }, [submenuParentIndex]);

  const handleSubmenuSelect = useCallback(
    (id: string) => {
      activeSubmenu?.onSelect(id);
      onClose();
    },
    [activeSubmenu, onClose]
  );

  const handleBackFromEdit = useCallback(() => {
    activeEditSubmenu?.onCancel();
    setActiveEditItemId(null);
    setFocusedIndex(submenuParentIndex);
  }, [activeEditSubmenu, submenuParentIndex]);

  const handleEditSave = useCallback(() => {
    activeEditSubmenu?.onSave();
    onClose();
  }, [activeEditSubmenu, onClose]);

  const menuStyle = useMemo(
    () => ({ position: 'fixed' as const, top: position.top, left: position.left }),
    [position]
  );

  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const items = currentItemsRef.current;
      const enabledIndices = items
        .map((item, i) => (!item.disabled ? i : -1))
        .filter((i) => i >= 0);
      if (enabledIndices.length === 0) {
        return;
      }

      const findNextEnabled = (current: number, direction: 1 | -1): number => {
        const pos = enabledIndices.indexOf(current);
        if (pos === -1) {
          return enabledIndices[0];
        }
        const nextPos = (pos + direction + enabledIndices.length) % enabledIndices.length;
        return enabledIndices[nextPos];
      };

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => findNextEnabled(prev, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => findNextEnabled(prev, -1));
      } else if (e.key === 'Tab') {
        onClose();
        triggerRef.current?.focus();
      }
    },
    [onClose, triggerRef]
  );

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      role='menu'
      tabIndex={-1}
      aria-label='Song actions'
      style={menuStyle}
      className='z-9999 min-w-48'
      onKeyDown={activeEditItemId ? undefined : handleKeyDown}
      onClick={handleStopPropagation}
    >
      <div className='glass-popover outline-2 outline-accent/20'>
        {activeSubmenu ? (
          <SubmenuPanel
            config={activeSubmenu}
            onBack={handleBackFromSubmenu}
            onSelect={handleSubmenuSelect}
          />
        ) : activeEditSubmenu ? (
          <EditSubmenuPanel
            config={activeEditSubmenu}
            onBack={handleBackFromEdit}
            onSave={handleEditSave}
          />
        ) : (
          items.map((item, index) => {
            if (item.info) {
              return (
                <div key={item.id}>
                  {(index > 0 || item.separatorBefore) && (
                    <div className='border-b border-muted/50' />
                  )}
                  <InfoRow item={item} />
                </div>
              );
            }
            return (
              <div key={item.id}>
                {index > 0 && <div className='border-b border-muted/50' />}
                <MenuItemRow
                  item={item}
                  focusedIndex={focusedIndex}
                  onClose={onClose}
                  setActiveSubmenu={setActiveSubmenu}
                  setActiveEditItemId={setActiveEditItemId}
                  setSubmenuParentIndex={setSubmenuParentIndex}
                  setFocusedIndex={setFocusedIndex}
                />
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}

// --- Sub-components ---

const MenuItemRow = memo(function MenuItemRow({
  item,
  focusedIndex,
  onClose,
  setActiveSubmenu,
  setActiveEditItemId,
  setSubmenuParentIndex,
  setFocusedIndex,
}: {
  item: MenuItem;
  focusedIndex: number;
  onClose: () => void;
  setActiveSubmenu: (s: SubmenuConfig | null) => void;
  setActiveEditItemId: (id: string | null) => void;
  setSubmenuParentIndex: (i: number) => void;
  setFocusedIndex: (i: number) => void;
}) {
  const handleClick = useCallback(() => {
    if (item.submenu) {
      setActiveSubmenu(item.submenu);
      setSubmenuParentIndex(focusedIndex);
      setFocusedIndex(0);
    } else if (item.editSubmenu) {
      setActiveEditItemId(item.id);
      setSubmenuParentIndex(focusedIndex);
      setFocusedIndex(0);
    } else {
      item.onClick?.();
      onClose();
    }
  }, [
    focusedIndex,
    item,
    onClose,
    setActiveEditItemId,
    setActiveSubmenu,
    setFocusedIndex,
    setSubmenuParentIndex,
  ]);

  return <MenuItemButton item={item} onClick={handleClick} />;
});

function InfoRow({ item }: { item: MenuItem }) {
  return (
    <div
      role='presentation'
      className='px-3 py-1.5 text-xs font-mono text-muted flex items-center gap-2'
    >
      {item.icon && <span className='shrink-0'>{item.icon}</span>}
      <span className='truncate'>{item.info?.label}</span>
    </div>
  );
}
