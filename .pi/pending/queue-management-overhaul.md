# Queue Management Overhaul

Requires new server-side API endpoints + bot logic (not just UI).

## New API endpoints needed

- `DELETE /api/player/queue/:songId` — remove a specific song from the queue
- `POST /api/player/queue/:songId/promote` — move to priority queue ("Play Next")
- `PATCH /api/player/queue/reorder` — reorder songs (drag-and-drop)

## UI work

- Context menu on individual queue items (Remove, Play Next, Skip To)
- Reorder support (drag-and-drop or move-up/move-down controls)

## Prompt for fresh context

```
Read .pi/pending/queue-management-overhaul.md for the planned feature.

The queue panel (packages/web/src/components/QueuePanel.tsx) needs a functional
overhaul: ability to remove individual songs from the queue, promote to priority,
and reorder. This requires new API routes + bot-side queue manipulation.
Plan it out.
```
