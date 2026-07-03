# Troubleshooting

Common issues and solutions for Alfira.

## Bot Issues

### Bot not joining voice channels

**Symptoms:** Bot doesn't appear in voice channel when using the Play button.

**Solutions:**
1. Ensure the bot has the required permissions (Connect, Speak).
2. Check that the voice channel allows bot access.
3. Verify `DISCORD_BOT_TOKEN` is correct.
4. Check API logs: `docker compose logs alfira`

### Audio not playing

**Symptoms:** Bot joins but no audio is heard.

**Solutions:**
1. Ensure the NodeLink service is running (it starts automatically inside the alfira container).
2. Check API logs for NodeLink connection errors: `docker compose logs alfira`
3. Look for `[NodeLink]` prefix in logs to see NodeLink startup status.
4. Try a different video/URL to isolate the issue.

## Authentication Issues

### OAuth2 login fails

**Symptoms:** "Invalid redirect_uri" error during Discord login.

**Solutions:**
1. Verify `DISCORD_REDIRECT_URI` matches exactly in:
   - Discord Developer Portal → OAuth2 → Redirects
   - Your `.env` file
2. Ensure you're using `https://` in production.

### "Request Song" button not visible

**Symptoms:** Logged in but the "+ Request Song" button is missing from the Songs page.

**Solutions:**
1. **Re-login** — The button is visible to all authenticated users. If you can't see it, your session may be expired. Log out and back in.
2. **Check your internet connection** — The UI relies on the API being reachable.

### Admin features missing (approve/deny requests, manage playlists)

**Symptoms:** Logged in but can't approve/deny requests, can't edit/delete songs, can't access admin settings.

**Solutions:**
1. **Check admin role configuration** — Go to **Settings → Admin** and verify the correct roles are selected under "Admin Roles". Save changes if needed.
2. **Enable Server Members Intent** — Go to Discord Developer Portal → Bot → Privileged Gateway Intents → enable **Server Members Intent** → Save Changes.
3. **Re-login** — Admin status is cached in the JWT token. Log out and log back in after fixing the above.
4. **Check logs** — Run `docker compose logs alfira | grep -i admin` to verify the bot detects your admin status.

### "undefined command does not have 'run' callback" / Slash commands not working

**Symptoms:** Trying `/play`, `/skip`, `/leave`, etc. in Discord gives "The application did not respond" or similar errors.

**Cause:** Alfira **removed Discord slash commands in April 2026** — all playback control is now done exclusively through the **web UI**. However, Discord may still have the old commands cached/registered.

**Solutions:**
1. **Use the web UI instead** — Play/pause/skip/seek via the Now Playing bar, Play buttons on songs/playlists, or queue management (Up Next, Quick Add, Override).
2. **Restart the container** — Stale commands are now automatically unregistered on **every server startup**:
   ```bash
   docker compose restart alfira
   ```
3. **Manual unregister (if needed)** — Run this to clean up without a full restart:
   ```bash
   bun run discord:unregister-commands
   ```
   (Requires `.env` with `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `GUILD_ID`)
4. **Wait for Discord cache** — After unregistering, commands disappear from Discord's menu immediately for guild commands (global commands can take up to 1 hour).

## Music Source Issues

### Spotify / Apple Music / Tidal tracks won't load

**Symptoms:** Pasting a Spotify, Apple Music, or Tidal URL returns "Could not fetch track info" or similar error.

**Cause:** These sources require API credentials that aren't configured.

**Solutions:**
1. Add the required credentials to your `.env` file (see [Installation Guide](installation.md#optional)).
2. Restart Alfira after adding credentials: `docker compose restart alfira`
3. Verify the source is enabled in **Settings → Admin → Music Sources**.

### "That URL doesn't look right" error

**Symptoms:** Pasting a valid URL from a supported source but getting a validation error.

**Solutions:**
1. Check that the source is enabled in **Settings → Admin → Music Sources**.
2. The error message lists which sources are currently enabled — check those match what you expect.
3. Ensure the URL is a direct track/playlist link (not a search results page).

## Database Issues

### Connection errors

**Symptoms:** API crashes with "database not found" or permission errors.

**Solutions:**
1. Ensure the alfira container is running: `docker compose ps`
2. Check API logs: `docker compose logs alfira`
3. Verify the `/data` volume is properly mounted and writable.
4. For fresh database, delete the volume: `docker compose down -v` then `docker compose up --build`

## Resetting Everything

**Warning:** This will delete all your data (playlists, songs, etc.).

```bash
# Stop and remove everything, including database
docker compose down -v

# Rebuild from scratch
docker compose up --build
```

## Getting Help

1. Check the logs: `docker compose logs -f alfira`
2. Search existing [GitHub Issues](https://github.com/ebears/alfira/issues).
3. Open a new issue with:
   - Docker version
   - Relevant log output
   - Steps to reproduce