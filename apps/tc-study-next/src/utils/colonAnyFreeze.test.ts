/**
 * ARCH-FREEZE (non-behavioral): `: any` annotation count ratchet.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/**
 * P3 / debt hygiene freeze — `: any` annotations must not grow.
 * Baseline after 2026-08-10 Debt Tighten burn (was 93 → 1).
 * Sole remaining: asResourceViewer dual-React bridge return.
 * Companion to asAnyFreeze (`as any` = 0).
 */
const COLON_ANY_BASELINE = 1

describe('colonAnyFreeze', () => {
  test(`prod src ": any" count stays ≤ ${COLON_ANY_BASELINE}`, async () => {
    const glob = new Glob('**/*.{ts,tsx}')
    let count = 0
    for await (const path of glob.scan(ROOT)) {
      const rel = path.replace(/\\/g, '/')
      if (rel.includes('.test.') || rel.includes('__tests__')) continue
      if (rel.includes('node_modules')) continue
      const src = readFileSync(join(ROOT, path), 'utf8')
      const matches = src.match(/:\s*any\b/g)
      if (matches) count += matches.length
    }
    expect(count).toBeLessThanOrEqual(COLON_ANY_BASELINE)
  })
})
