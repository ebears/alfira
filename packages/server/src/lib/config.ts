export const WEB_UI_ORIGIN = process.env.WEB_UI_ORIGIN ?? 'http://localhost:3001';

const _GUILD_ID = process.env.GUILD_ID;
if (!_GUILD_ID) {
  throw new Error('GUILD_ID environment variable is not set');
}
export const GUILD_ID = _GUILD_ID as string;
