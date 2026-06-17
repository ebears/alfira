<h1 align="center">Alfira</h1>
<p align="center">
  <img width="299" height="299" src="https://raw.githubusercontent.com/ebears/alfira/main/.github/logo.png" alt="Alfira Logo">
</p>

<p align="center">
  <a href="https://github.com/ebears/alfira"><img src="https://img.shields.io/badge/status-experimental%20%7C%20pre--release-orange" alt="Status: Experimental | Pre-release"></a>
  <a href="https://github.com/ebears/alfira/actions/workflows/docker-build.yml"><img src="https://github.com/ebears/alfira/actions/workflows/docker-build.yml/badge.svg" alt="GitHub Actions"></a>
</p>

<p align="center">
  <a href="https://bun.com/"><img src="https://img.shields.io/badge/Bun%20-F472B6?logo=bun&logoColor=white" alt="Bun"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React%20-61DAFB?logo=react&logoColor=black" alt="React"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind%20-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://github.com/drizzle-team/drizzle-orm"><img src="https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle"></a>
  <a href="https://github.com/tiramisulabs/seyfert"><img src="https://img.shields.io/badge/Seyfert%20-2D7553?logo=discord&logoColor=white" alt="Seyfert"></a>
  <a href="https://github.com/PerformanC/NodeLink"><img src="https://img.shields.io/badge/NodeLink%20-63B64C?logo=apple%20music&logoColor=white" alt="NodeLink"></a>
  <a href="https://github.com/Ganyu-Studios/Hoshimi"><img src="https://img.shields.io/badge/Hoshimi%20-353139?logo=typescript&logoColor=white" alt="Hoshimi"></a>
</p>

## Features

**Alfira** is a self-hosted Discord music bot with a web UI for library management and playback control. It's like a personal Spotify for Discord servers: users build and share a combined library. A single bot instance is scoped to one Discord server (not a few or hundreds).

### Music Library

- **YouTube import** — Paste links to build a shared library. Full playlists are expanded automatically and duplicates are detected.
- **Metadata editing** — Customize title, artist, album, and cover artwork for any song.
- **Tag system** — Organize songs with color-coded tags. Tags autocomplete as you type and are canonicalized so `rock` and `Rock` stay together.
- **Playlists** — Create and manage private or public playlists from your library.
- **Search & filter** — Find songs by title, artist, album, or tags.

### Playback

- **Discord voice** — Play, pause, seek, and skip from the library or any playlist.
- **Loop & shuffle** — Loop a song or the full queue; shuffle and restore the original order.
- **Per-song volume** — Boost or cut volume for individual songs, from -100% to +200%.
- **Equalizer & compressor** — A 15-band graphical EQ and compressor, saved at the server level.

### Queue Management

- **Up Next** — Add songs to a priority queue that plays immediately after the current track.
- **Quick add** — Paste a YouTube link straight into the queue without saving to the library.
- **Override** — Replace the entire queue with a new YouTube URL and start playing instantly.
- **Load playlist** — Queue an entire playlist from the library.

### Web UI

- **Responsive** — Works on desktop and mobile.
- **Themes** — Auto, light, and dark mode plus a palette of accent colors.
- **Virtual scrolling** — Handles large libraries without slowing down.
- **Now playing bar** — Persistent playback controls with a seekable progress bar.
- **PWA** — Install as a standalone app.

### Authentication

- **Discord OAuth2** — Sign in with Discord; guild membership required.
- **Admin roles** — Gate settings, the tag editor, and audio controls behind Discord role IDs.

### Real-Time Updates

- **WebSocket sync** — Queue state, playback position, and song metadata update across all clients in real time.
- **Live events** — Songs and playlists added, changed, or removed propagate instantly to every connected user.

## Screenshots

<p align="center">
  <img src=".github/screenshots/songs-page.png" width="900" alt="Songs page">
</p>

<details>
  <summary>Click to see more screenshots</summary>
  <p align="center">
    <img src=".github/screenshots/playlists-page.png" width="450" alt="Playlists page">
    <img src=".github/screenshots/playlist-details.png" width="450" alt="Playlist details">
    <br>
    <img src=".github/screenshots/login.png" width="450" alt="Login">
    <img src=".github/screenshots/settings-page.png" width="450" alt="Settings page">
    <br>
    <img src=".github/screenshots/theme-example-1.png" width="300" alt="Theme example 1">
    <img src=".github/screenshots/theme-example-2.png" width="300" alt="Theme example 2">
    <img src=".github/screenshots/theme-example-3.png" width="300" alt="Theme example 3">
    <img src=".github/screenshots/theme-example-4.png" width="300" alt="Theme example 4">
    <img src=".github/screenshots/theme-example-5.png" width="300" alt="Theme example 5">
    <img src=".github/screenshots/theme-example-6.png" width="300" alt="Theme example 6">
  </p>
</details>

---

<p align="center">
  <img width="256" src="https://raw.githubusercontent.com/ebears/alfira/main/.github/icon.png">
</p>

<h2 align="center">Quick Start with Docker</h2>

```bash
# 1. Copy docker-compose.prod.yml and .env.example from this repo to the folder you want the bot to live.
curl -o docker-compose.prod.yml https://raw.githubusercontent.com/ebears/alfira/main/docker-compose.prod.yml
curl -o .env.example https://raw.githubusercontent.com/ebears/alfira/main/.env.example

# 2. Rename docker-compose.prod.yml to docker-compose.yml and .env.example to .env.
cp docker-compose.prod.yml docker-compose.yml
cp .env.example .env

# 3. Configure the .env.
nano .env  # or micro, zed, code, vim, etc.

# 4. Start the stack - web UI at http://localhost:8180
docker compose up -d
```

See the **[Full Installation Guide](docs/installation.md)** for full details.

---

## Documentation

| Document | Description |
|----------|-------------|
| **[Installation Guide](docs/installation.md)** | Setup, environment variables, Docker commands, development workflow |
| **[Tech Stack](docs/tech-stack.md)** | Technology stack and project structure |
| **[Biome Setup](docs/biome-setup.md)** | Editor setup for Biome linting and formatting |
| **[Troubleshooting](docs/troubleshooting.md)** | Common issues and solutions |

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
