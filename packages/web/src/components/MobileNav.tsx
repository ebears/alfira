import {
  CraneTowerIcon,
  GuitarIcon,
  HashIcon,
  SignOutIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { ADMIN_NAV_ITEMS, NAV_ITEMS } from '../constants';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import SettingsMenu from './SettingsMenu';
import { Button } from './ui/Button';
import { SpringUp } from './ui/SpringUp';

// NavLink className render prop — React Router API, extracted to module scope for stable reference.
const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center rounded-xl font-body transition-all duration-150 cursor-pointer px-3 py-3 ${
    isActive ? 'btn-inherit pressed' : 'btn-inherit'
  }`;

export default function MobileNav() {
  const { user, logout } = useAuth();
  const { isAdminView } = useAdminView();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on escape key
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close drawer when clicking outside
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = useCallback(async () => {
    await logout();
    void navigate('/login');
  }, [logout, navigate]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const backdropKeyHandler = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      setIsOpen(false);
    }
  }, []);

  const linkStyle = useMemo(
    () => ({ '--btn-surface': 'var(--color-elevated)' }) as React.CSSProperties,
    []
  );

  return (
    <>
      {/* Mobile header bar */}
      <header className='bg-elevated border-border safe-area-top fixed top-0 right-0 left-0 z-40 flex h-14 items-center justify-between border-b px-4 md:hidden'>
        {/* Left: Menu button */}
        <Button
          variant='inherit'
          surface='elevated'
          size='icon'
          onClick={handleOpen}
          aria-label='Open navigation menu'
        >
          <HashIcon size={24} weight='duotone' />
        </Button>

        {/* Center: Wordmark */}
        <div className='flex items-center gap-2'>
          <span className='font-display text-accent text-3xl tracking-wider'>Alfira</span>
          {isAdminView && (
            <span className='bg-accent/10 text-accent border-accent/20 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase'>
              admin
            </span>
          )}
        </div>

        {/* Right: User avatar */}
        <div className='flex h-11 w-11 items-center justify-center'>
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className='border-border h-8 w-8 rounded-full border'
              decoding='async'
            />
          ) : (
            <div className='bg-elevated border-border flex h-8 w-8 items-center justify-center rounded-full border'>
              <span className='text-muted font-mono text-xs'>
                {user?.username?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Backdrop overlay */}
      {isOpen && (
        <SpringUp className='fixed inset-0 z-50 md:hidden'>
          <button
            type='button'
            aria-label='Close navigation menu'
            className='absolute inset-0 bg-black/60 backdrop-blur-sm'
            onClick={handleClose}
            onKeyDown={backdropKeyHandler}
          />
        </SpringUp>
      )}

      {/* Slide-out drawer */}
      <div
        ref={drawerRef}
        className={`bg-elevated border-border safe-area-top fixed top-0 bottom-0 left-0 z-50 flex w-72 max-w-[85vw] transform flex-col border-r transition-transform duration-300 ease-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className='border-border flex items-center justify-between border-b p-4'>
          <div className='flex items-center gap-2'>
            <span className='border-accent/30 bg-accent/10 flex h-10 w-10 shrink-0 items-center justify-center self-end rounded border'>
              {isAdminView ? (
                <CraneTowerIcon size={24} weight='duotone' className='text-accent' />
              ) : (
                <GuitarIcon size={24} weight='duotone' className='text-accent' />
              )}
            </span>
            <span className='font-display text-accent text-3xl tracking-wider'>Alfira</span>
          </div>
          <Button
            variant='inherit'
            surface='elevated'
            size='icon'
            onClick={handleClose}
            aria-label='Close navigation menu'
          >
            <XCircleIcon size={24} weight='duotone' />
          </Button>
        </div>

        {/* Navigation links */}
        <nav className='space-y-2 px-3 pt-3 pb-2'>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={handleClose}
              className={navLinkClassName}
              style={linkStyle}
            >
              <span className='mr-auto'>{label}</span>
              <Icon size={22} weight='duotone' />
            </NavLink>
          ))}
          {isAdminView && ADMIN_NAV_ITEMS.length > 0 && (
            <>
              <div className='px-2 py-1'>
                <div className='bg-fg/15 h-px' />
              </div>
              {ADMIN_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={handleClose}
                  className={navLinkClassName}
                  style={linkStyle}
                >
                  <span className='mr-auto'>{label}</span>
                  <Icon size={22} weight='duotone' />
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Bottom section: Settings, separator, user */}
        <div className='mt-auto'>
          {/* Settings Menu */}
          <SettingsMenu collapsed={false} onClick={handleClose} />

          {/* Separator above user section */}
          <div className='px-5'>
            <div className='bg-fg/20 h-px' />
          </div>

          {/* User section */}
          <div className='p-3'>
            <div className='mb-3 flex items-center gap-3 px-2 py-2'>
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className='h-7 w-7 rounded-full'
                  decoding='async'
                />
              ) : (
                <div className='bg-elevated flex h-7 w-7 items-center justify-center rounded-full'>
                  <span className='text-muted font-mono text-sm'>
                    {user?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <span className='text-fg font-body flex-1 truncate'>{user?.username}</span>
            </div>
            <Button
              variant='danger'
              onClick={handleLogout}
              className='text-foreground flex w-full cursor-pointer items-center rounded-xl px-3 py-2 transition-all duration-150'
            >
              <span className='mr-auto text-sm'>log out</span>
              <SignOutIcon size={18} weight='duotone' />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
