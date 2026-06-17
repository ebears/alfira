# Configuration Reference

This document provides a complete reference for all environment variables used by Alfira.

## Environment File

Alfira uses a single environment file at the project root: `.env`.

Copy the example file to get started:

```bash
cp .env.example .env
```

---

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord application client ID (from Developer Portal) | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | Discord application client secret | `abc123def456...` |
| `DISCORD_BOT_TOKEN` | Discord bot token | `MTAwMC4xMjM0NTY3ODkw...` |
| `GUILD_ID` | Discord server ID where the bot operates | `987654321098765432` |
| `ADMIN_ROLE_IDS` | **Required for admin features.** Discord role ID(s) that grant admin permissions (comma-separated). Users with this role can add songs, manage playlists, and use quick-add. | `123456789012345678` or `123...,456...` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `your-secure-random-string` |

> **⚠️ Critical:** `ADMIN_ROLE_IDS` is **required** for the "Add Song" button and other admin features to appear in the web UI. Without it, no one can add songs to the library. Also ensure **Server Members Intent** is enabled in the Discord Developer Portal (Bot → Privileged Gateway Intents).

### Database

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database file path | `/data/alfira.db` |

---

## Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WEB_UI_ORIGIN` | Public URL of the web UI (for CORS and redirects) | (required in production) |
| `DISCORD_REDIRECT_URI` | OAuth2 callback URL | `http://localhost:3001/auth/callback` |
| `VOICE_IDLE_TIMEOUT_MINUTES` | Minutes before bot leaves voice channel when idle | `5` |

### Production-Specific

| Variable | Description | Example |
|----------|-------------|---------|
| `WEB_UI_ORIGIN` | Public domain of the web UI | `https://alfira.example.com` |
| `DISCORD_REDIRECT_URI` | OAuth2 callback URL (must match Discord Developer Portal) | `https://alfira.example.com/auth/callback` |

---

## Database Configuration

Alfira uses SQLite for data persistence. The database is stored as a file inside the container.

### Development

In development, Docker Compose sets this automatically. The default is:

```
DATABASE_URL=/data/alfira.db
```

### Production

Docker Compose uses `DATABASE_URL` directly from your `.env` file:

```env
DATABASE_URL=/data/alfira.db
```

> **Note:** The `/data` directory is a Docker volume mount, so your database persists across container restarts.

---

## Generating Secrets

### JWT_SECRET

Generate a secure random string:

```bash
# Using openssl
openssl rand -hex 32

# Using Bun
bun -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

### Discord Tokens

Discord tokens are generated in the [Discord Developer Portal](https://discord.com/developers/applications):

1. **Client ID** — Found under "General Information"
2. **Client Secret** — Found under "OAuth2" → "General" (click "Reset Secret")
3. **Bot Token** — Found under "Bot" (click "Reset Token")

---

## Example Configurations

### Development

`.env` (project root):

```env
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_BOT_TOKEN=your-bot-token
GUILD_ID=987654321098765432
ADMIN_ROLE_IDS=123456789012345678
JWT_SECRET=dev-secret-change-in-production
# DATABASE_URL is set by Docker Compose
```

### Production

`.env` (project root):

```env
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_BOT_TOKEN=your-bot-token
GUILD_ID=987654321098765432
ADMIN_ROLE_IDS=123456789012345678
JWT_SECRET=a1b2c3d4e5f6...your-secure-64-char-hex-string
DATABASE_URL=/data/alfira.db
WEB_UI_ORIGIN=https://alfira.example.com
VOICE_IDLE_TIMEOUT_MINUTES=5
DISCORD_REDIRECT_URI=https://alfira.example.com/auth/callback
```

---

## See Also

- [Installation Guide](installation.md) — Setting up Alfira
- [Troubleshooting](troubleshooting.md) — Common issues and solutions

---

