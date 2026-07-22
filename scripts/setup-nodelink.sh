#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-time setup: clone NodeLink at the pinned commit and build it locally.
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
NODELINK_COMMIT="e524ed7f38c01e0fc8f031134c86ee87e0bc7ffa"

echo "→ Cloning NodeLink (commit ${NODELINK_COMMIT:0:7})..."
if [ -d "$NODELINK_DIR" ]; then
  echo "  .nodelink/ already exists — skipping clone."
else
  git init "$NODELINK_DIR"
  cd "$NODELINK_DIR"
  git remote add origin "$NODELINK_REPO"
  git fetch --depth 1 origin "$NODELINK_COMMIT"
  git checkout FETCH_HEAD
fi

cd "$NODELINK_DIR"

echo "→ Installing dependencies..."
bun install

echo "→ Building NodeLink..."
bun run build

# Copy our custom NodeLink config into the cloned repo
echo "→ Copying NodeLink config..."
cp "$PROJECT_ROOT/nodelink-config/config.js" "$NODELINK_DIR/config.js"

echo "✓ NodeLink is ready at .nodelink/"
echo "  You can now run: bun dev"
