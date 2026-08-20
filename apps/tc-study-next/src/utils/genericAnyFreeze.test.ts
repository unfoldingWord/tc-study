/**
 * ARCH-FREEZE (non-behavioral): generic `any` forms that evade `: any` / `as any` scans.
 * Covers Map/Record/useState`<any>` and `as unknown as` ladders in prod src.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/** Baseline after Round 4 freeze-hole close (ratchet down only). */
const GENERIC_ANY_BASELINE = 15
const AS_UNKNOWN_AS_BASELINE = 11

const GENERIC_ANY_RE =
  /\b(?:Map|Record|Set|WeakMap|WeakSet|Array|Promise|Partial|Required|Readonly|useState|useRef|useMemo|useCallback)\s*<\s*[^>]*\bany\b/g
const AS_UNKNOWN_AS_RE = /\bas unknown as\b/g

async function countMatches(re: RegExp): Promise<number> {
  const glob = new Glob('**/*.{ts,tsx}')
  let count = 0
  for await (const path of glob.scan(ROOT)) {
    const rel = path.replace(/\\/g, '/')
    if (rel.includes('.test.') || rel.includes('__tests__')) continue
    if (rel.includes('node_modules')) continue
    // Snapshot backup of pre-Epic-21 Read — do not count duplicated freeze patterns.
    if (rel.includes('read-v1')) continue
    const src = readFileSync(join(ROOT, path), 'utf8')
    const matches = src.match(re)
    if (matches) count += matches.length
  }
  return count
}

describe('genericAnyFreeze', () => {
  test(`prod src Map/Record/useState generic any stays ≤ ${GENERIC_ANY_BASELINE}`, async () => {
    const count = await countMatches(GENERIC_ANY_RE)
    expect(count).toBeLessThanOrEqual(GENERIC_ANY_BASELINE)
  })

  test(`prod src "as unknown as" stays ≤ ${AS_UNKNOWN_AS_BASELINE}`, async () => {
    const count = await countMatches(AS_UNKNOWN_AS_RE)
    expect(count).toBeLessThanOrEqual(AS_UNKNOWN_AS_BASELINE)
  })
})
