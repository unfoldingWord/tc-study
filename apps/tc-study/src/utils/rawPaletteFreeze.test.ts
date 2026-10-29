/**
 * ARCH-FREEZE (non-behavioral): raw Tailwind palette classes ratchet.
 * Colours come from the tC4 tokens in index.css (bg-surface, text-fg, accent, …), not from
 * Tailwind's palette (gray-500, blue-600, bg-white, …). Each screen PR of the restyle lowers the
 * baseline; at 0 it becomes a ban. See docs/TC4_STYLE_AND_BRAND.md §6.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..')

/** Measured when the ratchet landed; lower it as screens move to tokens, never raise it. */
const RAW_PALETTE_BASELINE = 707

/** Dev-only paths that are not part of the product and are not restyled. */
const DEV_ALLOWLIST = [
  'components/test/',
  'components/examples/',
  'components/dev/',
  'components/WorkerTestPanel.tsx',
]

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITY = 'bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder'
/** Any variant prefix (hover:, dark:, md:…) is allowed by the leading class boundary; /NN opacity too. */
const RAW_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITY})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d{1,3})?(?![\\w-])`,
  'g'
)

async function countRawPalette(): Promise<{ count: number; scanned: number }> {
  let count = 0
  let scanned = 0
  const glob = new Glob('**/*.{ts,tsx}')
  for await (const path of glob.scan(SRC)) {
    const rel = path.replace(/\\/g, '/')
    if (rel.includes('.test.') || rel.includes('.spec.') || rel.includes('__tests__')) continue
    if (rel.includes('node_modules')) continue
    if (DEV_ALLOWLIST.some((prefix) => rel.startsWith(prefix))) continue
    scanned++
    count += readFileSync(join(SRC, path), 'utf8').match(RAW_CLASS)?.length ?? 0
  }
  return { count, scanned }
}

describe('rawPaletteFreeze', () => {
  test('the class pattern finds palette classes with variants and opacity, and skips tokens', () => {
    const sample =
      'bg-gray-50 hover:text-blue-600 dark:border-red-500/40 bg-white text-black/50 ' +
      'bg-surface text-fg border-border bg-accent-soft text-fg-muted my-gray-500-thing'
    expect(sample.match(RAW_CLASS)).toEqual([
      'bg-gray-50',
      'text-blue-600',
      'border-red-500/40',
      'bg-white',
      'text-black/50',
    ])
  })

  test(`prod src raw palette classes stay ≤ ${RAW_PALETTE_BASELINE}`, async () => {
    const { count, scanned } = await countRawPalette()
    expect(scanned).toBeGreaterThan(500)
    expect(count).toBeLessThanOrEqual(RAW_PALETTE_BASELINE)
  })
})
