---
name: alfira-audio
description: NodeLink/Lavalink audio pipeline, GuildPlayer state machine, voice connection flow, track lifecycle events, and REST commands for player control. Use when working on lib/lavalink.ts, GuildPlayer.ts, lib/voice.ts, PlaybackCursor.ts, lib/applyNodeLinkFilter.ts, or any audio/playback feature.
---

# Alfira Audio Pipeline

## NodeLink

NodeLink is a Lavalink v4-compatible audio server. It runs as a child process, not a separate Docker container — spawned from `index.ts::startNodeLink()`.

- **Internal URL:** `http://127.0.0.1:2333`
- **Auth header:** `Authorization: nodelink-internal`
- **Ready check:** Polls `GET /v4/info` every 500ms until 200

## LavalinkSocket (`packages/server/src/lib/lavalink.ts`)

A singleton EventEmitter class managing the WebSocket connection to NodeLink.

### Connection lifecycle

```
connect(url, auth, userId)
  → _doConnect()
    → new WebSocket(url, { headers: { Authorization, User-Id, Client-Name: "Alfira" } })
    → on 'ready' opcode → resolves connect promise, stores sessionId
    → on close → schedule exponential backoff reconnect (1s base, 30s max)
    → disconnect() → sets intentionalClose flag, clears timers
```

### WebSocket opcodes

| Opcode | Handler |
|--------|---------|
| `ready` | Stores `sessionId`, resolves connect promise |
| `playerUpdate` | Updates per-guild `connected` state |
| `event: TrackStartEvent` | Sets guild `playing = true` |
| `event: TrackEndEvent` | Sets guild `playing = false`, emits `trackEnd` event with reason |
| `event: TrackExceptionEvent` | Sets guild `playing = false`, emits `trackError` event |
| `event: WebSocketClosedEvent` | Sets guild `connected = false`, `playing = false`, emits `socketClosed` |

### TrackEnd reasons

`'finished' | 'loadFailed' | 'stopped' | 'replaced' | 'cleanup' | 'gapless'`

### Guild state tracking

Each guild tracks `{ connected: boolean, playing: boolean }`. Available via:
- `lavalink.isGuildConnected(guildId)`
- `lavalink.isGuildPlaying(guildId)`
- `lavalink.markConnected(guildId, connected)`
- `lavalink.markPlaying(guildId, playing)`

### Event subscription pattern

```typescript
// Subscribe to track end for a specific guild
const unsubscribe = lavalink.onTrackEnd(guildId, (reason) => {
  // reason is typed TrackEndReason
});
// Later: unsubscribe();
```

Similarly: `onTrackError(guildId, handler)`, `onSocketClosed(guildId, handler)`.

## GuildPlayer (`packages/server/src/GuildPlayer.ts`)

Per-guild audio player state machine. Manages:
- Queue (array of `QueuedSong`)
- Current song + playback position
- Loop mode (`off` | `song` | `queue`)
- Volume control
- Play/pause/stop/skip/seek
- Filter application (equalizer, compressor)

### Key patterns

- **Player lookup:** `getPlayer(guildId)` from `startDiscord.ts`, returns `GuildPlayer | undefined`
- **Guard helpers:** `requirePlayer()` and `requirePlaying()` from `lib/player.ts` — return `{ ok, player }` or `{ ok, response }` for route handlers
- **State broadcast:** GuildPlayer calls `emitPlayerUpdate(state)` directly, not through the WebSocket

## Voice Connection Flow

Voice connections use Discord's gateway forwarded to NodeLink's REST API:

1. Discord sends `VOICE_STATE_UPDATE` → bot joins channel
2. Discord sends `VOICE_SERVER_UPDATE` → provides voice server endpoint + token
3. Forward both to NodeLink REST: `PATCH /v4/sessions/{sessionId}/players/{guildId}` with `voice` payload

See `lib/voice.ts` for the voice connection helpers.

## NodeLink REST Commands

Player control is done via NodeLink's REST API (not WebSocket):

- **Play:** `PUT /v4/sessions/{sessionId}/players/{guildId}?noReplace=true` with track data
- **Stop:** `DELETE /v4/sessions/{sessionId}/players/{guildId}`
- **Pause:** `PATCH /v4/sessions/{sessionId}/players/{guildId}` with `paused: true`
- **Resume:** `PATCH ...` with `paused: false`
- **Seek:** `PATCH ...` with `position: ms`
- **Volume:** `PATCH ...` with `volume: 0-1000`
- **Filters:** `PATCH ...` with `filters` object

## Filters

Filter application is in `lib/applyNodeLinkFilter.ts`. Supports:
- **Equalizer:** 15-band (0-14), each band 0-100 (midpoint 50), mapped to NodeLink's ±0.25 range
- **Compressor:** Threshold (-60 to 0 dB), ratio (1-20), attack (0-100ms), release (10-1000ms), gain (0-24 dB)

Filters are applied by building the filter object and sending `PATCH /v4/sessions/{sessionId}/players/{guildId}`.

## PlaybackCursor (`packages/server/src/PlaybackCursor.ts`)

Manages queue position tracking for loop modes and shuffle. Handles forward/backward navigation through the queue with loop wrapping.
