export const TAG_COLORS = [
  {
    name: 'orange' as const,
    bg: 'light:bg-orange-500/15 bg-orange-500/20',
    text: 'light:text-orange-600 text-orange-300',
    border: 'light:border-orange-500/25 border-orange-500/30',
  },
  {
    name: 'sky' as const,
    bg: 'light:bg-sky-500/15 bg-sky-500/20',
    text: 'light:text-sky-600 text-sky-300',
    border: 'light:border-sky-500/25 border-sky-500/30',
  },
  {
    name: 'emerald' as const,
    bg: 'light:bg-emerald-500/15 bg-emerald-500/20',
    text: 'light:text-emerald-600 text-emerald-300',
    border: 'light:border-emerald-500/25 border-emerald-500/30',
  },
  {
    name: 'amber' as const,
    bg: 'light:bg-amber-500/15 bg-amber-500/20',
    text: 'light:text-amber-700 text-amber-300',
    border: 'light:border-amber-500/25 border-amber-500/30',
  },
  {
    name: 'violet' as const,
    bg: 'light:bg-violet-500/15 bg-violet-500/20',
    text: 'light:text-violet-600 text-violet-300',
    border: 'light:border-violet-500/25 border-violet-500/30',
  },
] as const;

/** djb2 hash — deterministic, fast, good distribution for short strings */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Returns color classes for a tag string.
 * If explicitColor is provided, uses that color; otherwise uses hash-based fallback.
 */
export function getTagColorClasses(
  tag: string,
  explicitColor?: string | null
): (typeof TAG_COLORS)[number] {
  if (explicitColor) {
    const found = TAG_COLORS.find((c) => c.name === explicitColor);
    if (found) return found;
  }
  return TAG_COLORS[djb2(tag.toLowerCase()) % TAG_COLORS.length];
}
