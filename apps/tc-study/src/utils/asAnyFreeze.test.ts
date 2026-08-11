/**
 * ARCH-FREEZE (non-behavioral): static `as any` count ratchet.
 * Not a behavioral product test — see e2e/journeys and quoteTokens unit tests.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/**
 * Hygiene freeze — `as any` must not grow (currently 0 in prod src).
 * Companion ratchet for annotation form `: any` lives in colonAnyFreeze.test.ts.
 */
const AS_ANY_BASELINE = 0

describe('asAnyFreeze', () => {
  test(`prod src "as any" count stays ≤ ${AS_ANY_BASELINE}`, async () => {
    const glob = new Glob('**/*.{ts,tsx}')
    let count = 0
    for await (const path of glob.scan(ROOT)) {
      const rel = path.replace(/\\/g, '/')
      if (rel.includes('.test.') || rel.includes('__tests__')) continue
      if (rel.includes('node_modules')) continue
      const src = readFileSync(join(ROOT, path), 'utf8')
      const matches = src.match(/\bas any\b/g)
      if (matches) count += matches.length
    }
    expect(count).toBeLessThanOrEqual(AS_ANY_BASELINE)
  })
})
