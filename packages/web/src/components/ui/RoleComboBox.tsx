import type React from 'react';

import { CaretDown } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface RoleOption {
  id: string;
  name: string;
  color: number;
}

// ---------------------------------------------------------------------------
// Child component — stable callbacks per role option
// ---------------------------------------------------------------------------

interface RoleOptionItemProps {
  role: RoleOption;
  index: number;
  isHighlighted: boolean;
  onSelect: (role: RoleOption) => void;
  onHighlight: (index: number) => void;
}

const RoleOptionItem = memo(function RoleOptionItem({
  role,
  index,
  isHighlighted,
  onSelect,
  onHighlight,
}: RoleOptionItemProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault(); // prevent input blur before click
      onSelect(role);
    },
    [onSelect, role]
  );

  const handleMouseEnter = useCallback(() => onHighlight(index), [onHighlight, index]);

  const dotStyle = useMemo(
    () => ({
      backgroundColor: role.color
        ? `#${role.color.toString(16).padStart(6, '0')}`
        : 'var(--color-muted)',
    }),
    [role.color]
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- combobox option, keyboard handled at list level
    <li
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
        ${isHighlighted ? 'bg-accent/10 text-fg' : 'text-fg hover:bg-surface'}
      `}
    >
      <span className='w-2.5 h-2.5 rounded-full shrink-0' style={dotStyle} />
      <span className='truncate'>{role.name}</span>
    </li>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RoleComboBoxProps {
  roles: RoleOption[];
  onSelect: (role: RoleOption) => void;
  placeholder?: string;
}

export default function RoleComboBox({
  roles,
  onSelect,
  placeholder = 'Search roles…',
}: RoleComboBoxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const normalizedQuery = query.toLowerCase().trim();
  const filtered = normalizedQuery
    ? roles.filter((r) => r.name.toLowerCase().includes(normalizedQuery))
    : roles;

  // Reset highlight when filtered list changes (query changes cause re-filter)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on query change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLLIElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const selectRole = useCallback(
    (role: RoleOption) => {
      onSelect(role);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
  }, []);

  const handleFocus = useCallback(() => setIsOpen(true), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          setIsOpen(true);
          e.preventDefault();
          return;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(
            (prev) => (prev - 1 + filtered.length) % Math.max(filtered.length, 1)
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[highlightedIndex]) {
            selectRole(filtered[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, filtered, highlightedIndex, selectRole]
  );

  const caretStyle = useMemo(
    () => (isOpen ? { transform: 'translateY(-50%) rotate(180deg)' } : undefined),
    [isOpen]
  );

  return (
    <div className='relative w-full max-w-sm'>
      <div className='relative'>
        <input
          ref={inputRef}
          type='text'
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className='w-full bg-surface border border-border rounded-lg px-3 py-2 pr-9 text-sm text-fg placeholder:text-muted
                     focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30
                     transition-colors'
        />
        <CaretDown
          size={16}
          weight='bold'
          className='absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none transition-transform'
          style={caretStyle}
        />
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          className='absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-elevated border border-border rounded-lg shadow-lg
                     text-sm'
        >
          {filtered.length === 0 ? (
            <li className='px-3 py-2 text-muted italic'>No roles found</li>
          ) : (
            filtered.map((role, i) => (
              <RoleOptionItem
                key={role.id}
                role={role}
                index={i}
                isHighlighted={i === highlightedIndex}
                onSelect={selectRole}
                onHighlight={setHighlightedIndex}
              />
            ))
          )}
        </ul>
      )}
    </div>
  );
}
