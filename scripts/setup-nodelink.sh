#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Setup/update: clone NodeLink at the pinned commit and build it locally.
#
# The pin lives in .nodelink-version (single source of truth, shared with the
# Dockerfile). Safe to re-run: an existing .nodelink/ checkout is moved to the
# pinned commit and rebuilt — that's how you pick up a version bump.
#
# This is only needed for local development with `bun dev` (non-Docker).
# Docker builds handle NodeLink internally in the Dockerfile.
#
# Usage:
#   bun setup:nodelink
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODELINK_DIR="$PROJECT_ROOT/.nodelink"
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

echo "→ Installing dependencies..."
bun install

echo "→ Building NodeLink..."
bun run build

# Copy our custom NodeLink config into the cloned repo
echo "→ Copying NodeLink config..."
cp "$PROJECT_ROOT/nodelink.config.ts" "$NODELINK_DIR/config.ts"

echo "✓ NodeLink is ready at .nodelink/ (commit ${NODELINK_COMMIT:0:7})"
echo "  You can now run: bun dev"
