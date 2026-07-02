import {
  CraneTowerIcon,
  GuitarIcon,
  HashIcon,
  SignOutIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from '../constants';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import SettingsMenu from './SettingsMenu';
import { Button } from './ui/Button';

export default function MobileNav() {
  const { user, logout } = useAuth();
  const { isAdminView } = useAdminView();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile header bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 bg-elevated border-b border-border safe-area-top">
        {/* Left: Menu button */}
        <Button
          variant="inherit"
          surface="elevated"
          size="icon"
          onClick={() => setIsOpen(true)}
          aria-label="Open navigation menu"
        >
          <HashIcon size={24} weight="duotone" />
        </Button>

        {/* Center: Wordmark */}
        <div className="flex items-center gap-2">
          <span className="font-display text-3xl text-accent tracking-wider">Alfira</span>
          {isAdminView && (
            <span className="text-[9px] font-mono bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded uppercase tracking-widest">
              admin
            </span>
          )}
        </div>

        {/* Right: User avatar */}
        <div className="w-11 h-11 flex items-center justify-center">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className="w-8 h-8 rounded-full border border-border"
              decoding="async"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-elevated border border-border flex items-center justify-center">
              <span className="font-mono text-xs text-muted">
                {user?.username?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Backdrop overlay */}
      {isOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-up"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') setIsOpen(false);
          }}
        />
      )}

      {/* Slide-out drawer */}
      <div
        ref={drawerRef}
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw] bg-elevated border-r border-border flex flex-col transform transition-transform duration-300 ease-out safe-area-top ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded border border-accent/30 bg-accent/10 self-end">
              {isAdminView ? (
                <CraneTowerIcon size={24} weight="duotone" className="text-accent" />
              ) : (
                <GuitarIcon size={24} weight="duotone" className="text-accent" />
              )}
            </span>
            <span className="font-display text-3xl text-accent tracking-wider">Alfira</span>
          </div>
          <Button
            variant="inherit"
            surface="elevated"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
          >
            <XCircleIcon size={24} weight="duotone" />
          </Button>
        </div>

        {/* Navigation links */}
        <nav className="px-3 pt-3 pb-2 space-y-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center rounded-xl font-body transition-all duration-150 cursor-pointer px-3 py-3 ${
                  isActive ? 'btn-inherit pressed' : 'btn-inherit'
                }`
              }
              style={{ '--btn-surface': 'var(--color-elevated)' } as React.CSSProperties}
            >
              <span className="mr-auto">{label}</span>
              <Icon size={22} weight="duotone" />
            </NavLink>
          ))}
          {isAdminView && ADMIN_NAV_ITEMS.length > 0 && (
            <>
              <div className="px-2 py-1">
                <div className="h-px bg-fg/15" />
              </div>
              {ADMIN_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setIsOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded-xl font-body transition-all duration-150 cursor-pointer px-3 py-3 ${
                      isActive ? 'btn-inherit pressed' : 'btn-inherit'
                    }`
                  }
                  style={{ '--btn-surface': 'var(--color-elevated)' } as React.CSSProperties}
                >
                  <span className="mr-auto">{label}</span>
                  <Icon size={22} weight="duotone" />
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Bottom section: Settings, separator, user */}
        <div className="mt-auto">
          {/* Settings Menu */}
          <SettingsMenu collapsed={false} onClick={() => setIsOpen(false)} />

          {/* Separator above user section */}
          <div className="px-5">
            <div className="h-px bg-fg/20" />
          </div>

          {/* User section */}
          <div className="p-3">
            <div className="flex items-center gap-3 px-2 py-2 mb-3">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-7 h-7 rounded-full"
                  decoding="async"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-elevated flex items-center justify-center">
                  <span className="font-mono text-sm text-muted">
                    {user?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-fg font-body truncate flex-1">{user?.username}</span>
            </div>
            <Button
              variant="danger"
              onClick={handleLogout}
              className="flex items-center rounded-xl transition-all duration-150 cursor-pointer px-3 py-2 w-full text-foreground"
            >
              <span className="mr-auto text-sm">log out</span>
              <SignOutIcon size={18} weight="duotone" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
