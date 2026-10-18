/**
 * The bt-synergy packages a command line reads through their compiled `dist/` (their package.json `main`), checked
 * against their `src/`: a `dist` older than its sources means packs made with code that is no longer the code.
 * prepare-language made packs for weeks with a quote matcher compiled two months before (Ruth 1:16's «my God» found
 * inside «your God» after it was fixed in src). Stops with what to build.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PACKAGES = resolve(import.meta.dir, '..', '..')

type Manifest = { name?: string; main?: string; dependencies?: Record<string, string> }

function manifestOf(folder: string): Manifest | null {
  const file = join(PACKAGES, folder, 'package.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest) : null
}

/** The newest modification time of a folder's files. */
function newest(dir: string): number {
  let latest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    latest = Math.max(latest, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs)
  }
  return latest
}

/**
 * Every package the given ones depend on, in the workspace, followed through their dependencies; those read from a
 * `dist` older than their `src` stop the command.
 */
export function requireFreshBuilds(roots: string[]): void {
  const folders = new Map<string, string>()
  for (const folder of readdirSync(PACKAGES)) {
    const name = manifestOf(folder)?.name
    if (name) folders.set(name, folder)
  }
  const seen = new Set<string>()
  const queue = [...roots]
  const stale: string[] = []
  while (queue.length) {
    const name = queue.shift()!
    const folder = folders.get(name)
    if (seen.has(name) || !folder) continue
    seen.add(name)
    const manifest = manifestOf(folder)!
    queue.push(...Object.keys(manifest.dependencies ?? {}).filter((dep) => dep.startsWith('@bt-synergy/')))
    if (!manifest.main?.includes('dist')) continue
    const dist = join(PACKAGES, folder, manifest.main)
    const src = join(PACKAGES, folder, 'src')
    if (!existsSync(src)) continue
    if (!existsSync(dist) || newest(src) > statSync(dist).mtimeMs) stale.push(folder)
  }
  if (stale.length) {
    console.error('Estos paquetes se leen compilados y su código cambió después: compílelos antes de seguir.')
    for (const folder of stale) console.error(`  cd packages/${folder} && bun run build`)
    process.exit(3)
  }
}
