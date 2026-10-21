#!/usr/bin/env bash
# Builds what the pack commands (prepare-language, mcp-views, publish-language) read compiled. dist/ is not in git,
# and requireFreshBuilds (packages/resource-pipeline/cli/freshBuilds.ts) stops with code 3 when one is missing or
# older than its src, so a fresh clone must run this after checkout. Only the workspace packages that command
# follows through its dependencies and whose package.json `main` points to dist/ are listed, each after the ones
# it imports; the rest are read from src/. If requireFreshBuilds' roots change, change this list with them.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

bun install --frozen-lockfile

for pkg in \
  resource-catalog \
  resource-cache \
  catalog-manager \
  resource-parsers \
  language-pack \
  cache-adapter-indexeddb \
  translation-notes-loader \
  translation-words-links-loader
do
  echo "==> building packages/$pkg"
  (cd "packages/$pkg" && bun run build)
done
