# Installation Guide

This guide covers everything you need to set up Alfira for both development and production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Discord Application Setup](#discord-application-setup)
- [Configuration](#configuration)
- [Development Setup](#development-setup)
- [Production Setup](#production-setup)
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

#### Required (API)

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord application client ID | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | Discord application client secret | `abc123...` |
| `DISCORD_BOT_TOKEN` | Discord bot token | `MTAwMC4...` |
| `GUILD_ID` | Discord server ID | `987654321098765432` |
| `JWT_SECRET` | Secret for signing JWT tokens | `your-secure-random-string` |
| `ADMIN_ROLE_IDS` | Discord role ID(s) for admin permissions (comma-separated) | `123456789012345678` |

> **Security:** Use a strong, random `JWT_SECRET`. Generate one with: `openssl rand -hex 32`

#### Required (Bot)

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Discord bot token (same as API) | `MTAwMC4...` |
| `DISCORD_CLIENT_ID` | Discord application client ID (same as API) | `123456789012345678` |

#### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `/data/alfira.db` |
| `WEB_UI_ORIGIN` | Public URL of the web UI | `http://localhost:3001` |
| `DISCORD_REDIRECT_URI` | OAuth2 redirect URI | `http://localhost:3001/auth/callback` |
| `VOICE_IDLE_TIMEOUT_MINUTES` | Minutes before bot leaves voice channel when idle | `5` |
| `LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error`, `fatal` | `info` |
| `LOG_FORMAT` | Set to `json` for machine-readable structured logging; defaults to human-readable colored output | — |
| `NO_COLOR` | Set to any value to disable colored log output | — |

> **Note:** `DATABASE_URL` is set automatically. You typically don't need to set it manually.

### Reverse Proxy

For use with a reverse proxy, change WEB_UI_ORIGIN and DISCORD_REDIRECT_URI so they're pointing to your custom domain:

| Variable | Local | Reverse Proxy |
|----------|-------------|---------|
| `WEB_UI_ORIGIN` | `http://localhost:3001` | `https://your-domain.com` |
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
   - **Server Members Intent** (optional, for role-based features)
6. Click **"Save Changes"**.

#### 3. Configure OAuth2

1. Navigate to **OAuth2** → **General**.
2. Copy the **Client secret** — this is your `DISCORD_CLIENT_SECRET`.
3. Add your redirect URL:
   - Local: `http://localhost:3001/auth/callback`
   - Reverse Proxy: `https://your-domain.com/auth/callback`
4. Click **"Save Changes"**.

#### 4. Invite the Bot to Your Server

1. Navigate to **OAuth2** → **URL Generator**.
2. Under **Scopes**, check:
   - `bot`
3. Under **Bot Permissions**, check:
   - `Connect`
   - `Speak`
   - `Use Voice Activity`
   - `View Channels`
   - `Send Messages`
   - `Embed Links`
4. Copy the generated URL at the bottom, open it in your browser, and authorize the bot for your server.

#### 5. Get Your Guild and Role IDs

1. Enable **Developer Mode** in Discord: Settings → Advanced → Developer Mode.
2. Right-click your server icon and select **"Copy Server ID"** — this is your `GUILD_ID`.
3. Right-click the **admin role** (the role that should have permission to add songs/manage the bot) and select **"Copy Role ID"** — this is your `ADMIN_ROLE_IDS`.
   - For multiple admin roles, use comma-separated IDs: `123456789012345678,987654321098765432`
   - **Important:** Only users with this role will see the "Add Song" button and other admin features in the web UI. Non-admin users can only play existing songs from the library.

#### 6. Enable Server Members Intent (Required for Admin Detection)

The bot needs to fetch guild member roles to determine admin status. This requires the **Server Members Intent**:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → your application.
2. Navigate to **Bot** in the left sidebar.
3. Under **Privileged Gateway Intents**, enable **Server Members Intent** (in addition to Message Content Intent).
4. Click **"Save Changes"**.

> **Without this intent**, the bot cannot verify admin roles — all users will be treated as non-admin, and the "Add Song" button will not appear for anyone.

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
