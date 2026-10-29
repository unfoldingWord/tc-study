/**
 * ARCH GUARD (non-behavioral): tC Study is a translationCore app.
 * TC stands for translationCore, never "Translation Companion"; the app is "tC Study"
 * (full name "translationCore Study"). See docs/TC4_STYLE_AND_BRAND.md §5.1.
 */
import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..')
const APP = join(SRC, '..')

/** Dev-only paths that are not part of the product (plan, Global Constraints). */
const DEV_ALLOWLIST = [
  'components/test/',
  'components/examples/',
  'components/dev/',
  'components/WorkerTestPanel.tsx',
]

/** The old name ("TC Study") and the wrong expansions of TC. */
const OFF_BRAND = [/\bTC Study\b/, /Translation Companion/, /Translation Core\b/, /BT Synergy/]

/** src holds about a thousand production files; a scan below this found the wrong folder. */
const MIN_FILES_SCANNED = 500

async function offBrandScan(): Promise<{ hits: string[]; scanned: number }> {
  const hits: string[] = []
  let scanned = 0
  const glob = new Glob('**/*.{ts,tsx}')
  for await (const path of glob.scan(SRC)) {
    const rel = path.replace(/\\/g, '/')
    if (rel.includes('.test.') || rel.includes('.spec.') || rel.includes('__tests__')) continue
    if (rel.includes('node_modules')) continue
    if (DEV_ALLOWLIST.some((prefix) => rel.startsWith(prefix))) continue
    scanned++
    const lines = readFileSync(join(SRC, path), 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      if (OFF_BRAND.some((re) => re.test(line))) hits.push(`${rel}:${i + 1}: ${line.trim()}`)
    })
  }
  return { hits, scanned }
}

describe('brandNameGuards', () => {
  test('production sources never use the old name, expand TC wrongly or say BT Synergy', async () => {
    const { hits, scanned } = await offBrandScan()
    expect(scanned).toBeGreaterThan(MIN_FILES_SCANNED)
    expect(hits).toEqual([])
  })

  test('index.html is titled tC Study, has a description and no missing favicon', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8')
    expect(html).toMatch(/<title>tC Study<\/title>/)
    expect(html).not.toContain('/vite.svg')
    const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)
    expect(description?.[1]).toContain('translationCore Study')
  })

  test('index.html links to public manifest.json, not vite-plugin webmanifest', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8')
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.json"\s*\/?>/)
    expect(html).not.toMatch(/manifest\.webmanifest/)
  })

  test('the web manifest names the app as the translationCore family does', () => {
    const manifest = JSON.parse(readFileSync(join(APP, 'public/manifest.json'), 'utf8'))
    expect(manifest.name).toBe('translationCore Study')
    expect(manifest.short_name).toBe('tC Study')
    expect(manifest.theme_color).toBe('#014263')
    expect(typeof manifest.description).toBe('string')
    expect(manifest.description.length).toBeGreaterThan(0)
  })

  test('package.json describes translationCore Study', () => {
    const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
    expect(pkg.description.startsWith('translationCore Study')).toBe(true)
  })
})
