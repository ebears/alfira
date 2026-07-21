import type React from 'react';

import { type User } from '@alfira/server/shared';
import { SignOutIcon, UserIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    if (!triggerRef.current || !menuRef.current) {
      return;
    }
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
    if (left < gap) {
      left = gap;
    }
    if (left + menu.width > window.innerWidth - gap) {
      left = window.innerWidth - menu.width - gap;
    }

    setPosition({ top, left });
  }, []);

  // Position before paint (useLayoutEffect) to avoid a (0,0) flash.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  // Close on click outside
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
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
    if (!open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [open]);

  const handleLogout = useCallback(() => {
    setOpen(false);
    onLogout();
  }, [onLogout]);

  const handleToggle = useCallback(() => {
    setOpen((o) => !o);
  }, []);

  const handleStopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const portalStyle = useMemo(
    () => ({ position: 'fixed' as const, top: position.top, left: position.left }),
    [position.top, position.left]
  );

  const avatarSize = collapsed ? 'size-[22px]' : 'w-7 h-7';
  const avatarFallbackSize = collapsed ? 'text-[11px]' : 'text-sm';

  const avatar = user.avatar ? (
    <img
      src={user.avatar}
      alt={user.username}
      className={`${avatarSize} shrink-0 rounded-full object-cover`}
      decoding='async'
    />
  ) : (
    <div
      className={`${avatarSize} bg-elevated flex shrink-0 items-center justify-center rounded-full`}
    >
      <span className={`font-mono ${avatarFallbackSize} text-muted`}>
        {user.username[0]?.toUpperCase()}
      </span>
    </div>
  );

  const triggerSurfaceVar = useMemo(
    () => ({ '--btn-surface': 'var(--color-elevated)' }) as React.CSSProperties,
    []
  );

  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type='button'
        onClick={handleToggle}
        title={user.username}
        className={`font-body btn-inherit flex w-full cursor-pointer items-center rounded-xl transition-all duration-150 ${
          collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'
        } ${open ? 'pressed text-accent' : ''}`}
        style={triggerSurfaceVar}
      >
        {!collapsed && (
          <span className={`mr-auto truncate ${open ? 'text-accent' : 'text-fg'}`}>
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
            role='menu'
            tabIndex={-1}
            style={portalStyle}
            className='z-9999 min-w-40'
            onKeyDown={handleStopPropagation}
            onClick={handleStopPropagation}
          >
            <div className='glass-popover outline-accent/20 outline-2'>
              {/* Username header — mirrors ContextMenu InfoRow */}
              <div className='text-muted flex items-center gap-2 px-3 py-1.5 font-mono text-xs'>
                <UserIcon size={14} weight='duotone' className='shrink-0' />
                <span className='truncate'>{user.username}</span>
              </div>
              {/* Separator — mirrors ContextMenu separators */}
              <div className='border-muted/50 border-b' />
              {/* Logout — mirrors ContextMenu MenuItemButton danger styling */}
              <button
                type='button'
                role='menuitem'
                onClick={handleLogout}
                className='text-danger hover:bg-danger/10 flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors duration-100'
              >
                <SignOutIcon size={14} weight='duotone' className='shrink-0' />
                <span>Log out</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
