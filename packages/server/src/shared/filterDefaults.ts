// ---------------------------------------------------------------------------
// Canonical filter default values.
//
// These are the single source of truth for filter defaults. They are used by
// every filter route GET handler (null-coalesce fallback) and by the web UI
// section components (initial useState values).
//
// When adding a new filter field, add its default value here FIRST, then
// reference it from the route and the component.
// ---------------------------------------------------------------------------

export const DEFAULT_COMPRESSOR = {
  enabled: false,
  threshold: -6,
  ratio: 4,
  attack: 5,
  release: 50,
  gain: 3,
} as const;

export const DEFAULT_EQUALIZER_BANDS = Object.freeze(Array.from({ length: 15 }, () => 50));

export const DEFAULT_EQUALIZER = {
  enabled: true,
} as const;

export const DEFAULT_KARAOKE = {
  enabled: false,
  level: 1,
  monoLevel: 1,
  filterBand: 220,
  filterWidth: 100,
} as const;

export const DEFAULT_TIMESCALE = {
  enabled: false,
  speed: 1,
  pitch: 1,
  rate: 1,
} as const;

export const DEFAULT_TREMOLO = {
  enabled: false,
  frequency: 2,
  depth: 0.5,
} as const;

export const DEFAULT_VIBRATO = {
  enabled: false,
  frequency: 2,
  depth: 0.5,
} as const;

export const DEFAULT_ROTATION = {
  enabled: false,
  rotationHz: 0,
} as const;

export const DEFAULT_DISTORTION = {
  enabled: false,
  sinOffset: 0,
  sinScale: 1,
  cosOffset: 0,
  cosScale: 1,
  tanOffset: 0,
  tanScale: 1,
  offset: 0,
  scale: 1,
} as const;

export const DEFAULT_CHANNEL_MIX = {
  enabled: false,
  leftToLeft: 1,
  leftToRight: 0,
  rightToLeft: 0,
  rightToRight: 1,
} as const;

export const DEFAULT_LOW_PASS = {
  enabled: false,
  smoothing: 20,
} as const;
