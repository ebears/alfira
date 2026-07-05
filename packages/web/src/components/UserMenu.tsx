import type { User } from '@alfira-bot/server/shared';
import { SignOutIcon, UserIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface UserMenuProps {
  user: User;
  collapsed: boolean;
  onLogout: () => void;
}

export default function UserMenu({ user, collapsed, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Position the popover above the trigger, falling back to below if needed
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const gap = 8;

    // Try above first
    let top = trigger.top - menu.height - gap;
    // Fall back to below the trigger if there isn't enough room above
    if (top < gap) {
      top = trigger.bottom + gap;
    }
    // Clamp to viewport
    if (top + menu.height > window.innerHeight - gap) {
      top = window.innerHeight - menu.height - gap;
    }

    let left = trigger.left + trigger.width / 2 - menu.width / 2;
    if (left < gap) left = gap;
    if (left + menu.width > window.innerWidth - gap) {
      left = window.innerWidth - menu.width - gap;
    }

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    // Wait for the portal content to be in the DOM before measuring
    requestAnimationFrame(() => {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    });
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  const avatarSize = collapsed ? 'size-[22px]' : 'w-7 h-7';
  const avatarFallbackSize = collapsed ? 'text-[11px]' : 'text-sm';

  const avatar = user.avatar ? (
    <img
      src={user.avatar}
      alt={user.username}
      className={`${avatarSize} rounded-full object-cover shrink-0`}
      decoding="async"
    />
  ) : (
    <div
      className={`${avatarSize} rounded-full bg-elevated flex items-center justify-center shrink-0`}
    >
      <span className={`font-mono ${avatarFallbackSize} text-muted`}>
        {user.username?.[0]?.toUpperCase()}
      </span>
    </div>
  );

  const triggerSurfaceVar = { '--btn-surface': 'var(--color-elevated)' } as React.CSSProperties;

  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={user.username}
        className={`flex items-center rounded-xl font-body transition-all duration-150 cursor-pointer w-full btn-inherit ${
          collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'
        } ${open ? 'pressed text-accent' : ''}`}
        style={triggerSurfaceVar}
      >
        {!collapsed && (
          <span className={`truncate mr-auto ${open ? 'text-accent' : 'text-fg'}`}>
            {user.username}
          </span>
        )}
        {avatar}
      </button>

      {/* Popover — mirrors ContextMenu styling */}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: position.top, left: position.left }}
            className="z-9999 min-w-40"
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-popover outline-2 outline-accent/20">
              {/* Username header — mirrors ContextMenu InfoRow */}
              <div className="px-3 py-1.5 text-xs font-mono text-muted flex items-center gap-2">
                <UserIcon size={14} weight="duotone" className="shrink-0" />
                <span className="truncate">{user.username}</span>
              </div>
              {/* Separator — mirrors ContextMenu separators */}
              <div className="border-b border-muted/50" />
              {/* Logout — mirrors ContextMenu MenuItemButton danger styling */}
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-danger hover:bg-danger/10 flex items-center gap-2 transition-colors duration-100"
              >
                <SignOutIcon size={14} weight="duotone" className="shrink-0" />
                <span>Log out</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
