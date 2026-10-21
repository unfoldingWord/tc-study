/**
 * Packs are filed by a compatibility key made of every processing version (PACK_VERSIONS): a phone only opens packs
 * whose key it knows. A builder change that alters the rows but not a version would put new rows in an old folder and
 * no phone would ever fetch the fix. This test keeps a hash of the quote and align rows and of the prepared
 * chapters (full and light) of a fixed sample (Ruth 4:5, with its Q footnote) next to the key it was made under, and fails when the hash moves and the key does not.
 */

import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PACK_FORMAT_VERSION, compatKeyOf } from '@bt-synergy/language-pack'
import { buildQuoteTokens } from '../helps/quoteTokens/buildQuoteTokens'
import { readCachedQuoteTokens, toCachedQuoteTokens, writeCachedQuoteTokens } from '../helps/helpsQuoteCache'
import { compactFromAlignResult } from '../helps/reconstructAlignFromPositions'
import { buildFullChapter, buildLightChapter } from '../scripture/scripturePreparer'
import { DYA3, UT23, alignWarm, link, ruth } from '../helps/ketivQere.fixtures'
import { PACK_VERSIONS } from './packVersions'

const SAMPLE_FILE = join(import.meta.dir, 'sample-output.json')

// A single-part row (a word-list link) beside the two multi-part, qere-quoting notes.
const TWL1 = link('twl1', 'הַ⁠שָּׂדֶ֖ה')
const LINKS = [UT23, DYA3, TWL1]

// Fields that differ from one run to the next; none of the rows below has one today, the filter keeps it so.
const VOLATILE = new Set(['createdAt', 'updatedAt', 'expiresAt', 'timestamp', 'cachedAt'])

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && !VOLATILE.has(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sampleRows() {
  const { uhb, glt, original } = await ruth()

  // Quote rows go through the cache as the app writes and reads them.
  const store = new Map<string, unknown>()
  const cache = {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
  }
  const where = { helpsKey: 'sample/tn', helpsStamp: 's', olKey: 'sample/uhb', olStamp: 's', book: 'rut', chapter: 4 }
  const built = Object.fromEntries(
    LINKS.map((l) => [l.id, toCachedQuoteTokens(buildQuoteTokens({ link: l, originalChapters: [original], bookCode: 'RUT' }))])
  )
  await writeCachedQuoteTokens(cache, where, built)
  const quote = await readCachedQuoteTokens(cache, where)

  // The prepared tier is what an app reads without rebuilding (Servos): its shape is guarded by the same key.
  const prepared = {
    uhb: { full: buildFullChapter(uhb.viewModel, 4), light: buildLightChapter(uhb.viewModel, 4) },
    glt: { full: buildFullChapter(glt.viewModel, 4), light: buildLightChapter(glt.viewModel, 4) },
  }

  const align: Record<string, Record<string, unknown>> = {}
  for (const [target, viewModel, language] of [
    ['uhb', uhb.viewModel, 'hbo'],
    ['glt', glt.viewModel, 'es-419'],
  ] as const) {
    const rows: Record<string, unknown> = {}
    for (const r of alignWarm(LINKS, original, viewModel, language)) {
      rows[r.id] = compactFromAlignResult({
        alignedTokens: r.alignedTokens,
        quoteTokens: (quote?.[r.id] ?? []) as never,
        bookCode: 'rut',
        chapter: 4,
        verse: 5,
        occurrence: '1',
      })
    }
    align[target] = rows
  }
  return { quote, align, prepared }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

describe('the pack output of a fixed sample', () => {
  test('is the same on every run', async () => {
    const first = stableJson(await sampleRows())
    const second = stableJson(await sampleRows())
    expect(second).toBe(first)
  })

  test('only changes together with a pack version', async () => {
    const compat = compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)
    const hash = sha256(stableJson(await sampleRows()))

    if (process.env.UPDATE_SAMPLE === '1') {
      writeFileSync(SAMPLE_FILE, JSON.stringify({ compat, hash }, null, 2) + '\n')
      return
    }

    expect(existsSync(SAMPLE_FILE)).toBe(true)
    const stored = JSON.parse(readFileSync(SAMPLE_FILE, 'utf8')) as { compat: string; hash: string }
    const refresh = '`UPDATE_SAMPLE=1 bun test src/language/sampleOutput.test.ts` in packages/resource-pipeline and commit sample-output.json'
    // A bumped version is expected; the stored sample must follow it, or the guard would be off from then on.
    if (stored.compat !== compat) {
      throw new Error(`the pack compatibility key changed (${stored.compat} → ${compat}): run ${refresh}`)
    }
    if (stored.hash !== hash) {
      throw new Error(
        'pack output changed without a version bump: bump the version that covers the change (USJ_PROCESSING_VERSION, ' +
          'SCRIPTURE_PREPARE_SCHEMA, HELPS_QUOTE_VERSION, HELPS_ALIGN_VERSION or HELPS_TEXT_VERSION), then run ' +
          `${refresh}. Running UPDATE_SAMPLE=1 without a bump defeats this check.`
      )
    }
  })
})
