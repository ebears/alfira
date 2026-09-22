#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Setup/update: clone NodeLink at the pinned commit, freeze its dependencies,
# and build it. Used by local dev (`bun setup:nodelink`) AND the Docker image
# (Dockerfile dev stage) so both paths are identical.
#
# Pins (single sources of truth):
#   .nodelink-version    NodeLink commit SHA
#   .nodelink-bun.lock   exact dependency versions (vendored bun.lock)
#
# Safe to re-run: an existing checkout is moved to the pinned commit and
# rebuilt — that's how you pick up a version bump.
#
# When bumping the NodeLink pin, regenerate the vendored lockfile too:
#   rm -rf .nodelink && bun setup:nodelink
#   cp .nodelink/bun.lock .nodelink-bun.lock
#
# Usage:
#   bun setup:nodelink
#   NODELINK_DIR=/usr/local/nodelink bash scripts/setup-nodelink.sh   (Docker)
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODELINK_DIR="${NODELINK_DIR:-$PROJECT_ROOT/.nodelink}"
NODELINK_REPO="https://github.com/PerformanC/NodeLink.git"
NODELINK_COMMIT="$(grep -Ev '^\s*(#|$)' "$PROJECT_ROOT/.nodelink-version" | head -1)"

echo "→ Setting up NodeLink (commit ${NODELINK_COMMIT:0:7})..."
if [ ! -d "$NODELINK_DIR" ]; then
  git init "$NODELINK_DIR"
  git -C "$NODELINK_DIR" remote add origin "$NODELINK_REPO"
fi

cd "$NODELINK_DIR"
git fetch --depth 1 origin "$NODELINK_COMMIT"
git checkout --force FETCH_HEAD

# --- Freeze dependencies --------------------------------------------------
# NodeLink's own dependency specs float (github: refs and ^ ranges), so an
# unfrozen install resolves whatever is current — and NodeLink additionally
# runs `bun add` at every boot ("dependency auto-updater"), mutating
# node_modules outside our pin. To keep builds deterministic we:
#   1. install from the vendored lockfile (--frozen-lockfile), and
#   2. remove the auto-updater call (grep-guarded so an upstream reshape of
#      the file fails loudly here instead of silently un-patching).
echo "→ Freezing NodeLink dependencies..."
cp "$PROJECT_ROOT/.nodelink-bun.lock" "$NODELINK_DIR/bun.lock"

INDEX_FILE="$NODELINK_DIR/src/index.ts"
if ! grep -q '^  checkDependencyUpdates,$' "$INDEX_FILE" ||
  ! grep -q 'await checkDependencyUpdates()' "$INDEX_FILE"; then
  echo "✗ NodeLink src/index.ts does not match the expected shape:" >&2
  echo "    checkDependencyUpdates import/call not found." >&2
  echo "    The auto-updater patch in scripts/setup-nodelink.sh needs" >&2
  echo "    updating for this NodeLink version." >&2
  exit 1
fi
sed -i '/^  checkDependencyUpdates,$/d' "$INDEX_FILE"
sed -i \
  's/^\( *\)await checkDependencyUpdates()$/\1\/\/ Disabled by Alfira setup: deterministic builds (see scripts\/setup-nodelink.sh)/' \
  "$INDEX_FILE"

echo "→ Installing dependencies..."
if ! bun install --frozen-lockfile; then
  echo "✗ Frozen install failed — NodeLink's package.json likely changed." >&2
  echo "  Regenerate .nodelink-bun.lock (see header of this script)." >&2
  exit 1
fi

echo "→ Building NodeLink..."
bun run build

# Copy our custom NodeLink config into the cloned repo
echo "→ Copying NodeLink config..."
cp "$PROJECT_ROOT/nodelink.config.ts" "$NODELINK_DIR/config.ts"

echo "✓ NodeLink is ready at $NODELINK_DIR (commit ${NODELINK_COMMIT:0:7})"
echo "  You can now run: bun dev"
