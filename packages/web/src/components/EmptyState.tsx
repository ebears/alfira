import {
  AlienIcon,
  BombIcon,
  CakeIcon,
  CatIcon,
  CookieIcon,
  GhostIcon,
  MoonIcon,
  OnigiriIcon,
  PizzaIcon,
  PlanetIcon,
  RocketLaunchIcon,
  SkullIcon,
  SmileyAngryIcon,
  SockIcon,
  SwordIcon,
  ToiletPaperIcon,
  YinYangIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

const IdleIcons = [
  AlienIcon,
  BombIcon,
  CakeIcon,
  CatIcon,
  CookieIcon,
  GhostIcon,
  MoonIcon,
  OnigiriIcon,
  PizzaIcon,
  PlanetIcon,
  RocketLaunchIcon,
  SkullIcon,
  SmileyAngryIcon,
  SockIcon,
  SwordIcon,
  ToiletPaperIcon,
  YinYangIcon,
];

let lastIndex = -1;
export function getRandomIdleIcon() {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * IdleIcons.length);
  } while (IdleIcons.length > 1 && idx === lastIndex);
  lastIndex = idx;
  return IdleIcons[idx] ?? IdleIcons[0];
}

export default function EmptyState({
  title,
  message,
  isAdmin,
  onAdd,
  addLabel,
  compact = false,
}: {
  title: string;
  message?: string;
  isAdmin?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  compact?: boolean;
}) {
  const [Icon] = useState(getRandomIdleIcon);
  return (
    <div className={`text-center ${compact ? 'py-8' : 'py-24'}`}>
      <div
        className={`bg-elevated border-border mx-auto flex items-center justify-center rounded-full border ${compact ? 'mb-2 h-10 w-10' : 'mb-3 h-12 w-12'}`}
      >
        <Icon size={compact ? 16 : 20} weight='duotone' className='text-faint' />
      </div>
      <p
        className={`font-display text-faint tracking-wider ${compact ? 'mb-1 text-xl' : 'mb-2 text-4xl'}`}
      >
        {title}
      </p>
      {message ? (
        <p className='text-faint font-mono text-xs'>{message}</p>
      ) : isAdmin ? (
        <p className='text-faint font-mono text-xs'>
          <button type='button' className='text-accent hover:underline' onClick={onAdd}>
            {addLabel}
          </button>{' '}
          to get started
        </p>
      ) : null}
    </div>
  );
}
