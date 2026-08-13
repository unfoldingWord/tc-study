#!/usr/bin/env node
/**
 * Match Cloudflare deploy post-processing: drop large preloaded JSON from dist.
 * Used by e2e-webserver, deploy.sh, and CI so previewed/tested artifact ≈ shipped dist.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const dir = path.join(ROOT, 'dist', 'preloaded')

if (!fs.existsSync(dir)) {
  process.exit(0)
}

let removed = 0
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.json')) continue
  fs.unlinkSync(path.join(dir, name))
  removed += 1
}
if (removed > 0) {
  console.log(`[strip-preloaded] removed ${removed} JSON file(s) from dist/preloaded`)
}
