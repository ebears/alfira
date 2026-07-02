import {
  MusicNotesIcon,
  PlaylistIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TagIcon,
} from '@phosphor-icons/react';

export const NAV_ITEMS = [
  { to: '/songs', label: 'Songs', icon: MusicNotesIcon },
  { to: '/playlists', label: 'Playlists', icon: PlaylistIcon },
];

export const ADMIN_NAV_ITEMS = [
  { to: '/audio', label: 'Audio', icon: SlidersHorizontalIcon },
  { to: '/tags', label: 'Tags', icon: TagIcon },
  { to: '/permissions', label: 'Permissions', icon: ShieldCheckIcon },
];
