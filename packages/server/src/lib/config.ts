import { execSync } from 'node:child_process';

export const WEB_UI_ORIGIN = process.env.WEB_UI_ORIGIN ?? 'http://localhost:3001';

function resolveVersion(): string {
  const envVersion = process.env.ALFIRA_VERSION;
  // Explicit non-dev version — use as-is (e.g., v0.1.0 from Docker build arg).
  if (envVersion && envVersion !== 'dev') return envVersion;

  // Dev — try to resolve the current commit hash for traceability.
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    if (hash) return `dev (${hash})`;
  } catch {
    // git not available or not a repo — fall through to plain 'dev'.
  }

  return 'dev';
}

export const VERSION = resolveVersion();

const _GUILD_ID = process.env.GUILD_ID;
if (!_GUILD_ID) {
  throw new Error('GUILD_ID environment variable is not set');
}
export const GUILD_ID = _GUILD_ID as string;
