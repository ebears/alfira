# Shared UI Primitives — Extraction Candidates

Follow-up to the card unification refactoring (PR #562).

## VirtualListFooter

The sentinel + loading dots + error retry block is identically duplicated in
`VirtualSongList.tsx`, `VirtualPlaylistList.tsx`, and `VirtualRequestList.tsx`.

Extract a `<VirtualListFooter sentinelRef onRetry isFetching isError />` component.

## ErrorBanner

The `bg-danger/10 border border-danger/20 text-danger` pattern appears in 3 pages:

| File | Usage |
|------|-------|
| `RequestsPage.tsx` | action error |
| `SetupWizard.tsx` | setup error |
| `PermissionsPage.tsx` | load error + save error |

Extract an `<ErrorBanner message={string} />` component.

## Spinner

`w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin` appears
in 5 files: ProtectedRoute, AddSongModal, OverrideModal, QuickAddModal, SetupWizard.

Extract a `<Spinner />` atom.

## SongArtwork (debatable)

`scale-[1.33] object-cover loading="lazy" decoding="async"` image pattern in 6 places
but wrapper sizes/shapes vary. Needs design thought first.

## Prompt for fresh context

```
Read .pi/pending/extraction-candidates.md for the planned extractions.

After the card unification refactoring, extract VirtualListFooter, ErrorBanner,
and Spinner as shared components. Plan it out.
```
