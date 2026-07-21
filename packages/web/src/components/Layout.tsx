import { CaretLeftIcon, CraneTowerIcon, GuitarIcon, LinkBreakIcon } from '@phosphor-icons/react';
import { useAnimationControls } from 'motion/react';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { ADMIN_NAV_ITEMS, NAV_ITEMS } from '../constants';
import { useAdminView } from '../context/AdminViewContext';
import { useAuth } from '../context/AuthContext';
import { QueuePanelProvider, useQueuePanel } from '../context/QueuePanelContext';
import { useConnectionStatus } from '../hooks/useSocket';
import { AnimatedOutlet } from './AnimatedOutlet';
import MobileNav from './MobileNav';
import { NowPlayingBar } from './NowPlayingBar';
import QueuePanel from './QueuePanel';
import SettingsMenu from './SettingsMenu';
import UserMenu from './UserMenu';

const elevatedSurfaceStyle = { '--btn-surface': 'var(--color-elevated)' } as React.CSSProperties;

export default function Layout() {
  return (
    <QueuePanelProvider>
      <LayoutContent />
    </QueuePanelProvider>
  );
}

function LayoutContent() {
  const { user, logout } = useAuth();
  const { isAdminView, toggleAdminView } = useAdminView();
  const connectionStatus = useConnectionStatus();
  const navigate = useNavigate();

  // Admin button hint animation — occasional spin to remind admins it's clickable
  const hintControls = useAnimationControls();

  useEffect(() => {
    if (!user?.isAdmin) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (localStorage.getItem('alfira-admin-button-animation') !== 'false') {
        void hintControls.start({
          rotate: [0, 360],
          transition: { type: 'spring', stiffness: 220, damping: 10 },
        });
      }
    }, 20_000);

    return () => clearInterval(interval);
  }, [user?.isAdmin, hintControls]);

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('alfira-sidebar-collapsed');
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('alfira-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const handleLogout = useCallback(async () => {
    await logout();
    void navigate('/login');
  }, [logout, navigate]);

  const handleToggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

  const navLinkClassName = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      `flex items-center rounded-xl font-body text-md transition-all duration-150 cursor-pointer ${
        collapsed ? 'justify-center px-0 py-3' : 'px-3 py-3'
      } ${isActive ? 'btn-inherit pressed' : 'btn-inherit'}`,
    [collapsed]
  );

  const sidebarAnimate = useMemo(() => ({ width: collapsed ? 64 : 224 }), [collapsed]);
  const sidebarTransition = useMemo(
    () => ({ type: 'spring' as const, stiffness: 500, damping: 25 }),
    []
  );
  return (
    <div className='flex flex-col h-full bg-surface overflow-hidden'>
      {/* ------------------------------------------------------------------ */}
      {/* Mobile Navigation - visible on small screens */}
      {/* ------------------------------------------------------------------ */}
      <MobileNav />

      {/* ------------------------------------------------------------------ */}
      {/* Middle row: sidebar + content */}
      {/* ------------------------------------------------------------------ */}
      <div className='flex-1 flex overflow-hidden'>
        {/* ------------------------------------------------------------------ */}
        {/* Sidebar - visible on medium screens and up */}
        {/* ------------------------------------------------------------------ */}
        <m.aside
          className='hidden md:flex shrink-0 flex-col bg-elevated overflow-hidden h-full'
          animate={sidebarAnimate}
          initial={false}
          transition={sidebarTransition}
        >
          {/* Wordmark */}
          <div
            className={`flex pt-6 pb-4 ${
              collapsed ? 'flex-col items-center justify-start px-3 gap-2' : 'items-center px-5'
            }`}
          >
            {!collapsed && (
              <div className='flex items-center gap-2 min-w-0'>
                <m.button
                  type='button'
                  onClick={toggleAdminView}
                  animate={hintControls}
                  title={
                    user?.isAdmin
                      ? isAdminView
                        ? 'Switch to Member view'
                        : 'Switch to Admin view'
                      : undefined
                  }
                  className={`flex items-center justify-center w-10 h-10 shrink-0 rounded border border-accent/30 bg-accent/10 self-end transition-opacity ${
                    user?.isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  }`}
                >
                  {isAdminView ? (
                    <CraneTowerIcon size={24} weight='duotone' className='text-accent' />
                  ) : (
                    <GuitarIcon size={24} weight='duotone' className='text-accent' />
                  )}
                </m.button>
                <span className='font-display text-5xl text-accent tracking-wider'>Alfira</span>
              </div>
            )}
            {collapsed && (
              <m.button
                type='button'
                onClick={toggleAdminView}
                animate={hintControls}
                className={`w-10 h-10 flex items-center justify-center shrink-0 rounded border border-accent/30 bg-accent/10 transition-opacity ${
                  user?.isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                }`}
                title={
                  user?.isAdmin
                    ? isAdminView
                      ? 'Admin mode — click to switch'
                      : 'Member mode — click to switch'
                    : undefined
                }
              >
                {isAdminView ? (
                  <CraneTowerIcon size={24} weight='duotone' className='text-accent' />
                ) : (
                  <GuitarIcon size={24} weight='duotone' className='text-accent' />
                )}
              </m.button>
            )}
          </div>

          {/* Spacer between wordmark and nav */}
          {collapsed ? (
            <div className='flex justify-center px-2'>
              <div className='w-full h-px bg-fg/20' />
            </div>
          ) : (
            <div className='px-5'>
              <div className='h-px bg-fg/20' />
            </div>
          )}

          {/* Nav */}
          <nav className={`flex-1 ${collapsed ? 'px-2 pt-3' : 'px-3 pt-3'} space-y-2`}>
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={navLinkClassName}
                style={elevatedSurfaceStyle}
              >
                {!collapsed && <span className='mr-auto'>{label}</span>}
                <Icon size={22} weight='duotone' />
              </NavLink>
            ))}
            {isAdminView && ADMIN_NAV_ITEMS.length > 0 && (
              <>
                {/* Separator between user and admin nav items */}
                {collapsed ? (
                  <div className='flex justify-center px-2 py-1'>
                    <div className='w-6 h-px bg-fg/15' />
                  </div>
                ) : (
                  <div className='px-2 py-1'>
                    <div className='h-px bg-fg/15' />
                  </div>
                )}
                {ADMIN_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={collapsed ? label : undefined}
                    className={navLinkClassName}
                    style={elevatedSurfaceStyle}
                  >
                    {!collapsed && <span className='mr-auto'>{label}</span>}
                    <Icon size={22} weight='duotone' />
                  </NavLink>
                ))}
              </>
            )}
          </nav>

          {/* Connection status */}
          {connectionStatus !== 'connected' && (
            <div className={collapsed ? 'flex justify-center px-2 pb-2' : 'px-3 pb-2'}>
              <div
                title={connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
                className={`flex items-center rounded-xl font-body w-full select-none ${
                  collapsed ? 'justify-center px-0 py-3' : 'px-3 py-3 gap-3'
                } ${connectionStatus === 'reconnecting' ? 'text-warning' : 'text-danger'}`}
              >
                {!collapsed && (
                  <span className='mr-auto text-sm text-fg/80'>
                    {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
                  </span>
                )}
                <LinkBreakIcon
                  size={22}
                  weight='duotone'
                  className={connectionStatus === 'reconnecting' ? 'animate-pulse' : ''}
                />
              </div>
            </div>
          )}

          {/* Settings Menu */}
          <SettingsMenu collapsed={collapsed} />

          {/* Collapse toggle */}
          <div className={collapsed ? 'flex justify-center px-2 pb-4' : 'px-3 pb-4'}>
            <button
              type='button'
              onClick={handleToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`flex items-center rounded-xl font-body transition-all duration-150 cursor-pointer w-full ${
                collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2'
              } btn-inherit`}
              style={elevatedSurfaceStyle}
            >
              {!collapsed && <span className='mr-auto'>Collapse</span>}
              <CaretLeftIcon size={18} weight='duotone' className={collapsed ? 'rotate-180' : ''} />
            </button>
          </div>

          {/* Separator above user section */}
          {collapsed ? (
            <div className='flex justify-center px-2'>
              <div className='w-full h-px bg-fg/20' />
            </div>
          ) : (
            <div className='px-5'>
              <div className='h-px bg-fg/20' />
            </div>
          )}

          {/* User section */}
          {user && (
            <div className={collapsed ? 'px-2 py-3' : 'p-3'}>
              <UserMenu user={user} collapsed={collapsed} onLogout={handleLogout} />
            </div>
          )}
        </m.aside>

        {/* ------------------------------------------------------------------ */}
        {/* Main content + queue panel */}
        {/* ------------------------------------------------------------------ */}
        <QueueLayout />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Now Playing Bar — full width, in flow, at root level */}
      {/* ------------------------------------------------------------------ */}
      <NowPlayingBar />
    </div>
  );
}

function QueueLayout() {
  const { queueOpen } = useQueuePanel();

  const queuePanelAnimate = useMemo(() => ({ width: queueOpen ? 384 : 0 }), [queueOpen]);
  const queuePanelTransition = useMemo(
    () => ({ type: 'spring' as const, stiffness: 500, damping: 45 }),
    []
  );

  return (
    <>
      <div className='flex-1 flex flex-col min-w-0 pt-14 md:pt-0 overflow-hidden'>
        <main className='flex-1 flex flex-col overflow-hidden'>
          <AnimatedOutlet />
        </main>
      </div>

      {/* Desktop: right-side panel that pushes content */}
      <m.aside
        className='shrink-0 flex-col bg-elevated overflow-hidden clay-floating md:flex hidden h-full'
        animate={queuePanelAnimate}
        initial={false}
        transition={queuePanelTransition}
      >
        {queueOpen && <QueuePanel />}
      </m.aside>
    </>
  );
}
