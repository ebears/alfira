# Installation Guide

This guide covers everything you need to set up Alfira for both development and production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Discord Application Setup](#discord-application-setup)
- [Configuration](#configuration)
- [Development Setup](#development-setup)
- [Production Setup](#production-setup)
- [Setup Wizard](#setup-wizard)
- [Upgrading](#upgrading)

---

## Prerequisites

### For Production

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | 20.10+ | With Docker Compose plugin |
| Reverse Proxy | Any | Caddy (recommended), Nginx, Traefik, etc. |
| Domain (optional) | — | For HTTPS/TLS termination |

### For Development

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | 20.10+ | With Docker Compose plugin |
| Git | Any | For cloning the repository |

No local Node.js installation needed — Docker handles everything.

---

## Setup

Alfira uses pre-built Docker images from the GitHub Container Registry.

```bash
# 1. Copy docker-compose.prod.yml and .env.example from this repo to the folder you want the bot to live.
curl -o docker-compose.prod.yml https://raw.githubusercontent.com/ebears/alfira/main/docker-compose.prod.yml
curl -o .env.example https://raw.githubusercontent.com/ebears/alfira/main/.env.example

# 2. Rename docker-compose.prod.yml to docker-compose.yml and .env.example to .env.
cp docker-compose.prod.yml docker-compose.yml
cp .env.example .env

# 3. Configure the .env  with your values
nano .env  # or micro, zed, code, vim, etc.

# 4. Start the stack - web UI at http://localhost:8180
docker compose up -d
```

### Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord application client ID | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | Discord application client secret | `abc123...` |
| `DISCORD_BOT_TOKEN` | Discord bot token | `MTAwMC4...` |
| `DISCORD_REDIRECT_URI` | OAuth2 redirect URI | `https://your-domain.com/auth/callback` |
| `JWT_SECRET` | Secret for signing JWT tokens | `your-secure-random-string` |

> **Security:** Use a strong, random `JWT_SECRET`. Generate one with: `openssl rand -hex 32`

#### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | Set automatically in Docker |
| `GUILD_ID` | Pre-seed Discord server ID (for existing deployments) | — |
| `ADMIN_ROLE_IDS` | Pre-seed admin role IDs (for existing deployments) | — |
| `VOICE_IDLE_TIMEOUT_MINUTES` | Override idle timeout (can also be set via wizard/settings) | `5` |
| `LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error`, `fatal` | `info` |
| `LOG_FORMAT` | Set to `json` for machine-readable structured logging | — |
| `NO_COLOR` | Set to any value to disable colored log output | — |
| `JWT_EXPIRES_IN` | JWT refresh token expiration (e.g., `30d`, `7d`, `24h`) | `30d` |
| `ENABLED_SOURCES` | Comma-separated list of music sources to enable by default | `youtube,soundcloud` |
| `SPOTIFY_CLIENT_ID` | Spotify API client ID (from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)) | — |
| `SPOTIFY_CLIENT_SECRET` | Spotify API client secret | — |
| `APPLE_MUSIC_MEDIA_API_TOKEN` | Apple Music developer token (set to `token_here` for auto-fetch, or provide a JWT) | — |
| `TIDAL_TOKEN` | Tidal authentication token | — |
| `GOOGLE_DRIVE_COOKIES` | Cookie header for accessing private Google Drive files | — |

> **Note:** `GUILD_ID` and `ADMIN_ROLE_IDS` are **not required** for new installs — these are configured through the in-app setup wizard. They're only needed for existing deployments migrating from an earlier version.

> **Music sources:** Spotify, Apple Music, and Tidal require credentials to work. Without them, these sources cannot be enabled — their checkboxes will show a warning in the setup wizard and admin settings. YouTube, SoundCloud, and Google Drive work out of the box.

### Reverse Proxy

For use with a reverse proxy, change `DISCORD_REDIRECT_URI` to point to your custom domain:

| Variable | Local | Reverse Proxy |
|----------|-------------|---------|
| `DISCORD_REDIRECT_URI` | `http://localhost:3001/auth/callback` | `https://your-domain.com/auth/callback` |

> **Important:** Ensure your redirect URL in the Discord Developer Portal also uses the custom domain.

### Discord Application Setup

#### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **"New Application"**.
3. Give it a name (e.g., "Alfira") and click **Create**.
4. Note your **Application ID** — this is your `DISCORD_CLIENT_ID`.

#### 2. Create a Bot User

1. Navigate to **Bot** in the left sidebar.
2. Click **"Add Bot"**, then confirm.
3. Click **"Reset Token"** to generate a bot token.
4. Copy the token — this is your `DISCORD_BOT_TOKEN`. You won't be able to see it again!
5. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent**
   - **Server Members Intent** (required for admin role detection)
6. Click **"Save Changes"**.

#### 3. Configure OAuth2

1. Navigate to **OAuth2** → **General**.
2. Copy the **Client secret** — this is your `DISCORD_CLIENT_SECRET`.
3. Add your redirect URL:
   - Local: `http://localhost:3001/auth/callback`
   - Reverse Proxy: `https://your-domain.com/auth/callback`
4. Click **"Save Changes"**.

#### 4. Invite the Bot to Your Server

You can invite the bot during the setup wizard (it shows an invite link), or manually:

1. Navigate to **OAuth2** → **URL Generator**.
2. Under **Scopes**, check:
   - `bot`
3. Under **Bot Permissions**, check:
   - `Connect`
   - `Speak`
   - `View Channels`
   - `Send Messages`
4. Copy the generated URL, open it in your browser, and authorize the bot for your server.

---

## Setup Wizard

After starting Alfira and logging in for the first time, you'll be guided through a setup wizard that configures:

1. **Discord Server** — Choose which server Alfira operates in
2. **Music Sources** — Choose which music platforms to enable (YouTube, SoundCloud, Spotify, Apple Music, Tidal, Google Drive)
3. **Admin Roles** — Select which Discord roles can manage the bot
4. **Notification Channel** — (Optional) Channel where Alfira posts idle-leave messages
5. **Idle Timeout** — Minutes before the bot auto-leaves an empty voice channel
6. **Public URL** — (Optional) Your public-facing URL

All of these settings can be changed later from the **Settings → Admin** page.

> **Note:** If you're upgrading from a previous version that used `GUILD_ID` and `ADMIN_ROLE_IDS` in `.env`, those values are automatically migrated — you won't see the wizard.

---

## Upgrading

Pull the latest images and restart:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Database migrations run automatically on startup. If you encounter issues:

```bash
docker compose -f docker-compose.prod.yml logs -f alfira
```

---

For more information, see:

- **[Troubleshooting](troubleshooting.md)** — Common issues and solutions
