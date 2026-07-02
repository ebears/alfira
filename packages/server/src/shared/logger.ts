type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

const currentLevel: number =
  LEVELS[(process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info'] ?? LEVELS.info;

const useJson = process.env.LOG_FORMAT === 'json';
const noColor = process.env.NO_COLOR !== undefined || process.env.NODE_ENV === 'production';

// ANSI escape codes — zero-dependency color support.
// Respects https://no-color.org/ and production mode.
const C = noColor
  ? { dim: '', red: '', yellow: '', bold: '', reset: '' }
  : { dim: '\x1b[2m', red: '\x1b[31m', yellow: '\x1b[33m', bold: '\x1b[1m', reset: '\x1b[0m' };

const COLORS: Record<LogLevel, string> = {
  debug: C.dim,
  info: '',
  warn: C.yellow,
  error: C.red,
  fatal: `${C.bold}${C.red}`,
};

type LogArg = unknown;

function formatMeta(meta: Record<string, unknown>): string {
  const pairs = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${C.dim}${k}=${typeof v === 'string' ? v : JSON.stringify(v)}${C.reset}`)
    .join(' ');
  return pairs;
}

function log(level: LogLevel, first: LogArg, second?: string): void {
  if (LEVELS[level] < currentLevel) return;

  const msg: string = typeof first === 'string' ? first : (second ?? '');
  const meta: Record<string, unknown> | undefined =
    typeof first === 'object' && first !== null && !(first instanceof Error)
      ? (first as Record<string, unknown>)
      : first instanceof Error
        ? { err: first.message, stack: first.stack }
        : undefined;

  if (useJson) {
    const entry = JSON.stringify({
      level,
      time: new Date().toISOString(),
      ...meta,
      msg,
    });
    if (level === 'error' || level === 'fatal') {
      console.error(entry);
    } else {
      console.log(entry);
    }
    return;
  }

  const color = COLORS[level];
  const parts = [`${color}${LABELS[level]}${C.reset}`, msg];
  if (meta) {
    const metaStr = formatMeta(meta);
    if (metaStr) parts.push(metaStr);
  }

  if (level === 'error' || level === 'fatal') {
    console.error(parts.join('  '));
  } else {
    console.log(parts.join('  '));
  }
}

export const logger = {
  debug: (obj: LogArg, msg?: string) => log('debug', obj, msg),
  info: (obj: LogArg, msg?: string) => log('info', obj, msg),
  warn: (obj: LogArg, msg?: string) => log('warn', obj, msg),
  error: (obj: LogArg, msg?: string) => log('error', obj, msg),
  fatal: (obj: LogArg, msg?: string) => log('fatal', obj, msg),
};
