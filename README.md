<h1 align="center">Alfira</h1>

<p align="center">
  <img width="200" src="https://raw.githubusercontent.com/ebears/alfira/main/.github/logo.png" alt="Alfira Logo">
</p>

<p align="center">
  <strong>A self-hosted Discord music bot with a web UI for library management and playback control.</strong>
</p>

<p align="center">
  <a href="https://github.com/ebears/alfira"><img src="https://img.shields.io/badge/status-experimental%20%7C%20pre--release-orange" alt="Status: Experimental | Pre-release"></a>
  <a href="https://github.com/ebears/alfira/actions/workflows/docker-build.yml"><img src="https://github.com/ebears/alfira/actions/workflows/docker-build.yml/badge.svg" alt="GitHub Actions"></a>
</p>

<p align="center">
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker"></a>
  <a href="https://bun.com/"><img src="https://img.shields.io/badge/Bun%20-F472B6?logo=bun&logoColor=white" alt="Bun"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React%20-61DAFB?logo=react&logoColor=black" alt="React"></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind%20-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS"></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite"></a>
  <a href="https://github.com/drizzle-team/drizzle-orm"><img src="https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle"></a>
  <a href="https://github.com/tiramisulabs/seyfert"><img src="https://img.shields.io/badge/Seyfert%20-2D7553?logo=discord&logoColor=white" alt="Seyfert"></a>
  <a href="https://github.com/PerformanC/NodeLink"><img src="https://img.shields.io/badge/NodeLink%20-63B64C?logo=apple%20music&logoColor=white" alt="NodeLink"></a>
</p>

## Screenshots

<p align="center">
  <img src=".github/screenshots/songs-page.png" width="900" alt="Songs page">
</p>

<details>
<summary>More screenshots</summary>

<table align="center">
  <tr>
    <td><img src=".github/screenshots/playlists-page.png" width="445" alt="Playlists page"></td>
    <td><img src=".github/screenshots/playlist-details.png" width="445" alt="Playlist details"></td>
  </tr>
  <tr>
    <td><img src=".github/screenshots/login.png" width="445" alt="Login"></td>
    <td><img src=".github/screenshots/settings-page.png" width="445" alt="Settings page"></td>
  </tr>
</table>

<br>

<p align="center"><strong>Theme examples</strong></p>

<table align="center">
  <tr>
    <td><img src=".github/screenshots/theme-example-1.png" width="296" alt="Theme example 1"></td>
    <td><img src=".github/screenshots/theme-example-2.png" width="296" alt="Theme example 2"></td>
    <td><img src=".github/screenshots/theme-example-3.png" width="296" alt="Theme example 3"></td>
  </tr>
  <tr>
    <td><img src=".github/screenshots/theme-example-4.png" width="296" alt="Theme example 4"></td>
    <td><img src=".github/screenshots/theme-example-5.png" width="296" alt="Theme example 5"></td>
    <td><img src=".github/screenshots/theme-example-6.png" width="296" alt="Theme example 6"></td>
  </tr>
</table>

</details>

## Features

- **Import songs** — Paste a YouTube link to save it to your library.
- **Playback** — Play, pause, seek, skip, loop, and shuffle. Optional server-wide equalizer and compressor.
- **Metadata editing** — Customize title, artist, album, cover art, tags, and per-song volume.
- **Playlists** — Create and manage private or public playlists from your library.
- **Search & filter** — Find songs by title, artist, album, or tags.

## Quick Start

Alfira only needs Docker.

```bash
# 1. Grab the compose file and env
curl -o docker-compose.yml https://raw.githubusercontent.com/ebears/alfira/main/docker-compose.prod.yml && curl -o .env https://raw.githubusercontent.com/ebears/alfira/main/.env.example

# 2. Edit .env with your preferred editor (vi / nano / vim / emacs / micro / code / zed)
vi .env

# 3. Start the stack — web UI at http://localhost:8180
docker compose up -d
```

See the **[Installation Guide](docs/installation.md)** for full details.

## Documentation

| Document | Description |
|----------|-------------|
| **[Installation Guide](docs/installation.md)** | Setup, environment variables, Docker commands |
| **[Philosophy](docs/philosophy.md)** | Design principles guiding the project |
| **[Tech Stack](docs/tech-stack.md)** | Technology stack and project structure |
| **[Biome Setup](docs/biome-setup.md)** | Editor setup for Biome linting and formatting |
| **[Troubleshooting](docs/troubleshooting.md)** | Common issues and solutions |

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
