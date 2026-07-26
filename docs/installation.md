# Installation Guide

This guide covers everything you need to set up Alfira for both development and production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Networking & Access](#networking--access)
- [First Run: What to Expect](#first-run-what-to-expect)
- [Discord Application Setup](#discord-application-setup)
- [Configuration](#configuration)
- [Development Setup](#development-setup)
- [Production Setup](#production-setup)
- [Setup Wizard](#setup-wizard)
- [Upgrading](#upgrading)
- [Backup & Restore](#backup--restore)
- [Custom Port](#custom-port)
- [Health Check](#health-check)

---

## Prerequisites

### For Production

| Requirement            | Version | Notes                                    |
| ---------------------- | ------- | ---------------------------------------- |
| Docker                 | 20.10+  | With Docker Compose plugin               |
| Reverse proxy + domain | Any     | Only needed for remote multi-user access |

### For Development

| Requirement | Version | Notes                                 |
| ----------- | ------- | ------------------------------------- |
| Bun         | 1.3+    | For local development                 |
| Docker      | 20.10+  | With Docker Compose plugin (optional) |
| Git         | Any     | For cloning the repository            |

---

## First Run: What to Expect

After starting Alfira for the first time:

1. **Open the web UI** at `http://localhost:3001` (or your configured URL).
2. **Log in with Discord** — click the login button, authorize the application, and you'll be redirected back to the web UI.
3. **Complete the setup wizard** — choose your Discord server, enable music sources, pick admin roles, and configure playback settings. See [Setup Wizard](#setup-wizard) for details.
4. **Start using Alfira** — after setup, you'll land on the Songs page. Import tracks by pasting URLs, create playlists, and control playback from the Now Playing bar.

> **Note:** If you're upgrading from a previous version that used `GUILD_ID` and `ADMIN_ROLE_IDS` in `.env`, those values are automatically migrated — you won't see the wizard and will land directly on the Songs page.

## Networking & Access

Alfira's web UI is how you browse your library, manage playlists, and control playback. The bot itself is outbound-only — it connects to Discord's gateway, no incoming ports needed. The networking requirements are purely about who can reach the web UI.

| Who uses the web UI                    | What you need                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Just you, same machine                 | Nothing extra — `localhost` works out of the box                              |
| You, from other devices on your LAN    | Use your machine's LAN IP as the redirect URI                                 |
| Multiple people, from outside your LAN | A domain, reverse proxy, and TLS (or a tunnel service like Cloudflare Tunnel) |

### Local & LAN Access

If you're the only one using the web UI — or accessing it from other devices on your home network — no reverse proxy or domain is needed.

- **Same machine:** Set `DISCORD_REDIRECT_URI` to `http://localhost:3001/auth/callback`
- **LAN access:** Set it to `http://<your-lan-ip>:3001/auth/callback` (e.g., `http://192.168.1.100:3001/auth/callback`)

Add the matching URL to your Discord application's redirect URIs in the Developer Portal. Discord allows `localhost` and LAN IPs without TLS.

### Remote Access (for sharing the web UI with others)

If you want other people to use the web UI from outside your network, you'll need a public-facing HTTPS URL. The standard approach is a reverse proxy with automatic TLS:

**Caddy** (recommended) — handles TLS certificates via Let's Encrypt with minimal configuration:

```
your-domain.com {
    reverse_proxy localhost:3001
}
```

**Cloudflare Tunnel** — if you don't have a domain, Cloudflare Tunnel (`cloudflared`) gives you a public HTTPS URL without DNS or TLS configuration:

```bash
cloudflared tunnel create alfira
cloudflared tunnel route dns alfira alfira.example.com  # or skip for a *.cfargotunnel.com URL
cloudflared tunnel run --url localhost:3001 alfira
```

Use the resulting URL as your `DISCORD_REDIRECT_URI`.

---

## Development Setup

Two options — local development (fast, recommended for active development) or Docker (full production-like stack).

### Option 1: Local Development (recommended)

Runs the server directly with hot reload via `bun --watch`. No Docker needed for the server.

```bash
# 1. Clone and install dependencies
git clone https://github.com/ebears/alfira.git
cd alfira
bun install

# 2. Configure environment
cp .env.example .env
nano .env  # fill in required values (see table below)

# 3. One-time NodeLink setup
bun setup:nodelink

# 4. Start the dev server — web UI at http://localhost:3001
bun dev
```

**What `bun setup:nodelink` does:** Clones the [NodeLink](https://github.com/PerformanC/NodeLink) audio server at a pinned commit into `.nodelink/`, installs its dependencies, builds it, and copies the project's custom config (`nodelink-config/config.ts`) into place. This only needs to be run once — the resulting `.nodelink/` directory is excluded from git. NodeLink is spawned automatically as a child process when the dev server starts.

The server auto-restarts on file changes. For web/frontend changes during a session, run `bun run web:build` in another terminal and refresh.

### Option 2: Docker Development

Builds and runs the full stack in Docker — identical to production.

```bash
# 1. Clone and configure (same as above)
git clone https://github.com/ebears/alfira.git
cd alfira
cp .env.example .env
nano .env

# 2. Start the full Docker stack
bun dev:docker
```

---

## Production Setup

Alfira uses pre-built Docker images from the GitHub Container Registry. Images are multi-arch (`linux/amd64`, `linux/arm64`) and run on x86-64 and ARM64 hosts (including Raspberry Pi 4/5).

```bash
# 1. Grab the compose file and example env
curl -o docker-compose.yml https://raw.githubusercontent.com/ebears/alfira/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/ebears/alfira/main/.env.example

# 2. Configure .env with your values
nano .env  # or micro, zed, code, vim, etc.

# 3. Create the data directory with proper permissions
#    The container runs as UID 1001 (non-root). This directory
#    holds your SQLite database — back it up regularly.
mkdir -p data
chmod 755 data

# 4. Start the stack — web UI at http://localhost:3001
docker compose up -d
```

> **Note:** If you're on a system where the `data/` directory was created by a previous `docker compose up` with root ownership, fix it with: `sudo chown -R 1001:1001 data/`

### Environment Variables

#### Required

| Variable                | Description                       | Example                               |
| ----------------------- | --------------------------------- | ------------------------------------- |
| `DISCORD_CLIENT_ID`     | Discord application client ID     | `123456789012345678`                  |
| `DISCORD_CLIENT_SECRET` | Discord application client secret | `abc123...`                           |
| `DISCORD_BOT_TOKEN`     | Discord bot token                 | `MTAwMC4...`                          |
| `DISCORD_REDIRECT_URI`  | OAuth2 redirect URI               | `http://localhost:3001/auth/callback` |
| `JWT_SECRET`            | Secret for signing JWT tokens     | `your-secure-random-string`           |

> **Security:** Use a strong, random `JWT_SECRET`. Generate one with: `openssl rand -hex 32`

#### Optional

| Variable                      | Description                                                                                         | Default                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`                | SQLite database path                                                                                | `data/alfira.db` (local), `/data/alfira.db` (Docker) |
| `GUILD_ID`                    | Pre-seed Discord server ID (for existing deployments)                                               | —                                                    |
| `ADMIN_ROLE_IDS`              | Pre-seed admin role IDs (for existing deployments)                                                  | —                                                    |
| `VOICE_IDLE_TIMEOUT_MINUTES`  | Override idle timeout (can also be set via wizard/settings)                                         | `5`                                                  |
| `LOG_LEVEL`                   | Log verbosity: `debug`, `info`, `warn`, `error`, `fatal`                                            | `info`                                               |
| `LOG_FORMAT`                  | Set to `json` for machine-readable structured logging                                               | —                                                    |
| `NO_COLOR`                    | Set to any value to disable colored log output                                                      | —                                                    |
| `JWT_EXPIRES_IN`              | JWT refresh token expiration (e.g., `30d`, `7d`, `24h`)                                             | `30d`                                                |
| `ENABLED_SOURCES`             | Comma-separated list of music sources to enable by default                                          | `youtube,soundcloud`                                 |
| `SPOTIFY_CLIENT_ID`           | Spotify API client ID (from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)) | —                                                    |
| `SPOTIFY_CLIENT_SECRET`       | Spotify API client secret                                                                           | —                                                    |
| `APPLE_MUSIC_MEDIA_API_TOKEN` | Apple Music developer token (set to `token_here` for auto-fetch, or provide a JWT)                  | —                                                    |
| `TIDAL_TOKEN`                 | Tidal authentication token                                                                          | —                                                    |
| `GOOGLE_DRIVE_COOKIES`        | Cookie header for accessing private Google Drive files                                              | —                                                    |

> **Note:** `GUILD_ID` and `ADMIN_ROLE_IDS` are **not required** for new installs — these are configured through the in-app setup wizard. They're only needed for existing deployments migrating from an earlier version.

> **Music sources:** Spotify, Apple Music, and Tidal require credentials to work. Without them, these sources cannot be enabled — their checkboxes will show a warning in the setup wizard and admin settings. YouTube, SoundCloud, and Google Drive work out of the box.

### Configuring Your Redirect URI

Set `DISCORD_REDIRECT_URI` based on how you'll access the web UI:

| Access                 | Redirect URI                                             |
| ---------------------- | -------------------------------------------------------- |
| Same machine           | `http://localhost:3001/auth/callback`                    |
| LAN                    | `http://192.168.1.100:3001/auth/callback`                |
| Remote (reverse proxy) | `https://your-domain.com/auth/callback`                  |
| Remote (tunnel)        | `https://your-tunnel-url.cfargotunnel.com/auth/callback` |

> **Important:** The redirect URI you set here must match exactly what you add in the Discord Developer Portal under OAuth2 → Redirects. If you changed the exposed port in docker-compose.yml, use that port.

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
3. Add your redirect URL (see [Configuring Your Redirect URI](#configuring-your-redirect-uri) above):
   - Same machine: `http://localhost:3001/auth/callback`
   - LAN: `http://<your-lan-ip>:3001/auth/callback`
   - Remote: `https://your-domain.com/auth/callback`
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
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. If you encounter issues:

```bash
docker compose logs -f alfira
```

### Upgrade checklist

1. **Check the [changelog](https://github.com/ebears/alfira/blob/main/CHANGELOG.md)** for breaking changes between your version and the latest.
2. **Back up your database** before upgrading (see [Backup & Restore](#backup--restore)).
3. **Review new optional env vars** in `.env.example` — new features may require additional configuration.

---

## Backup & Restore

All Alfira data (song library, playlists, tags, settings) lives in a single SQLite file at `./data/alfira.db`. Backing up is as simple as copying that file.

### Backup

```bash
# While Alfira is running (SQLite handles this safely for reads)
cp ./data/alfira.db ./backups/alfira-$(date +%Y-%m-%d).db
```

For automated daily backups, add a cron job:

```bash
0 3 * * * cp /path/to/alfira/data/alfira.db /path/to/backups/alfira-$(date +\%Y-\%m-\%d).db
```

### Restore

```bash
# 1. Stop Alfira
docker compose down

# 2. Replace the database file
cp ./backups/alfira-2026-01-01.db ./data/alfira.db
chmod 644 ./data/alfira.db

# 3. Start again
docker compose up -d
```

> **Note:** The database file must be readable and writable by UID 1001 (the `nodejs` user inside the container).

---

## Custom Port

By default, Alfira's web UI is exposed on port 3001. To use a different port, edit the port mapping in `docker-compose.yml`:

```yaml
ports:
  - 8080:3001 # host:container — change 8080 to your preferred port
```

Then update your `DISCORD_REDIRECT_URI` to match:

```env
DISCORD_REDIRECT_URI=http://localhost:8080/auth/callback
```

Apply the changes:

```bash
docker compose up -d
```

> The container-internal port (right side of the colon) must stay `3001`. Only change the host port (left side).

---

## Health Check

Alfira exposes a `/health` endpoint that returns `200 OK` when the server is running. You can use this for monitoring or reverse proxy health checks:

```bash
curl http://localhost:3001/health
```

The Docker health check uses this endpoint automatically — `docker compose ps` will show the container as `healthy` when everything is working. If the container shows `unhealthy`, check the logs:

```bash
docker compose logs alfira
```

---

For more information, see:

- **[Troubleshooting](troubleshooting.md)** — Common issues and solutions
- **[Tech Stack](tech-stack.md)** — Architecture and project structure
- **[Development Choices](development-choices.md)** — Why each technology was chosen
- **[oxlint Setup](oxlint-setup.md)** — Linter and formatter configuration for IDE integration
