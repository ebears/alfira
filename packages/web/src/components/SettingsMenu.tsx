import { WrenchIcon } from '@phosphor-icons/react';
import { NavLink } from 'react-router-dom';

interface SettingsMenuProps {
  collapsed?: boolean;
  onClick?: () => void;
}

export default function SettingsMenu({ collapsed = false, onClick }: SettingsMenuProps) {
  return (
    <div className={collapsed ? 'flex justify-center px-2 pb-2' : 'px-3 pb-2'}>
      <NavLink
        to='/settings'
        title={collapsed ? 'Settings' : undefined}
        onClick={onClick}
        className={({ isActive }) =>
          `flex items-center rounded-xl font-body transition-all duration-150 cursor-pointer w-full ${
            collapsed ? 'justify-center px-0 py-3' : 'px-3 py-3'
          } ${isActive ? 'btn-inherit pressed' : 'btn-inherit'}`
        }
        style={{ '--btn-surface': 'var(--color-elevated)' } as React.CSSProperties}
      >
        {!collapsed && <span className='mr-auto'>Settings</span>}
        <WrenchIcon size={22} weight='duotone' />
      </NavLink>
    </div>
  );
}
