import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { alignRelationId, helpsAlignKey, quoteRelationId } from '../helps/helpsAlignCache'
import { helpsQuoteKey } from '../helps/helpsQuoteCache'
import { SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { UHB_RESOURCE_KEY } from '../scripture/originalLanguageSpecs'
import { markRelationCovered, readWarmCoverage } from './warmCoverage'
import { runWarmGc } from './warmGc'
import { resolveWarmStamps, type WarmStampResolvers } from './warmStamps'

const TN = 'owner/en/tn'
const ULT = 'owner/en/ult'
const OL = UHB_RESOURCE_KEY

const RUT_V90 = '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7'
const RUT_V91 = '77777777771f9e2b7c4d5e6f708192a3b4c5d6e7'
const JON = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

function row(tag: string, blobs: Record<string, string>) {
  return {
    language: 'en',
    release: { tag_name: tag, published_at: `2026-${tag === 'v91' ? '02' : '01'}-01T00:00:00Z` },
    contentMetadata: { bookBlobs: blobs, bookBlobsRef: tag },
  }
}

function catalogWithTn(tn: ReturnType<typeof row>) {
  const rows: Record<string, unknown> = {
    [TN]: tn,
    [ULT]: row('v40', { rut: RUT_V90, jon: JON }),
    [OL]: row('v2', { rut: RUT_V90, jon: JON }),
  }
  return { async getResourceMetadata(key: string) { return rows[key] ?? null } }
}

function stampsFor(tn: ReturnType<typeof row>) {
  return resolveWarmStamps({ catalog: catalogWithTn(tn), stampKeys: [TN, ULT] })
}

function createFakeAdapter() {
  const store = new Map<string, unknown>()
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
    async delete(key: string) {
      store.delete(key)
    },
    async getByPrefix(prefix: string) {
      return [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, entry]) => ({ key, entry }))
    },
  }
}

type Cache = ReturnType<typeof createFakeAdapter>

/** What a warm job writes for one book: a quote row, an align row and their coverage, under the stamps given. */
async function writeBookRows(
  cache: Cache,
  book: string,
  s: { helps: string; ol: string; target: string }
): Promise<{ quote: string; align: string }> {
  const quote = helpsQuoteKey({ helpsKey: TN, helpsStamp: s.helps, olKey: OL, olStamp: s.ol, book, chapter: 1 })
  const align = helpsAlignKey({
    helpsKey: TN,
    helpsStamp: s.helps,
    olKey: OL,
    olStamp: s.ol,
    targetKey: ULT,
    targetStamp: s.target,
    book,
    chapter: 1,
  })
  await cache.set(quote, { ok: 1 })
  await cache.set(align, { ok: 1 })
  await markRelationCovered(cache, quoteRelationId({ helpsKey: TN, olKey: OL, book }), `${s.helps}|${s.ol}`, 4)
  await markRelationCovered(
    cache,
    alignRelationId({ helpsKey: TN, olKey: OL, targetKey: ULT, book }),
    `${s.helps}|${s.ol}|${s.target}`,
    4
  )
  return { quote, align }
}

function bookStamps(stamps: WarmStampResolvers, book: string) {
  return {
    helps: stamps.helpsStampOf(TN, book)!,
    ol: stamps.olStampOf(OL, book),
    target: stamps.targetStampOf(ULT, book)!,
  }
}

function gc(cache: Cache, stamps: WarmStampResolvers) {
  return runWarmGc({
    cache,
    sourceResourceId: ULT,
    textLanguageCode: 'en',
    helpsLanguageCode: 'en',
    currentBook: 'rut',
    stamps,
  })
}

describe('warm GC per book', () => {
  test("a new release that leaves Ruth unchanged keeps Ruth's derived rows", async () => {
    const cache = createFakeAdapter()
    const v90 = await stampsFor(row('v90', { rut: RUT_V90, jon: JON }))
    const ruth = await writeBookRows(cache, 'rut', bookStamps(v90, 'rut'))

    const v91 = await stampsFor(row('v91', { rut: RUT_V90, jon: JON }))
    const result = await gc(cache, v91)

    expect(result.deleted).toBe(0)
    expect(cache.store.has(ruth.quote)).toBe(true)
    expect(cache.store.has(ruth.align)).toBe(true)
    const coverage = await readWarmCoverage(cache)
    expect(coverage[quoteRelationId({ helpsKey: TN, olKey: OL, book: 'rut' })]).toBeDefined()
    expect(coverage[alignRelationId({ helpsKey: TN, olKey: OL, targetKey: ULT, book: 'rut' })]).toBeDefined()
  })

  test("a new release that changed Ruth collects Ruth's rows, and only Ruth's", async () => {
    const cache = createFakeAdapter()
    const v90 = await stampsFor(row('v90', { rut: RUT_V90, jon: JON }))
    const ruth = await writeBookRows(cache, 'rut', bookStamps(v90, 'rut'))
    const jonah = await writeBookRows(cache, 'jon', bookStamps(v90, 'jon'))

    const v91 = await stampsFor(row('v91', { rut: RUT_V91, jon: JON }))
    const result = await gc(cache, v91)

    expect(result.deleted).toBe(2)
    expect(cache.store.has(ruth.quote)).toBe(false)
    expect(cache.store.has(ruth.align)).toBe(false)
    expect(cache.store.has(jonah.quote)).toBe(true)
    expect(cache.store.has(jonah.align)).toBe(true)
    const coverage = await readWarmCoverage(cache)
    expect(coverage[quoteRelationId({ helpsKey: TN, olKey: OL, book: 'rut' })]).toBeUndefined()
    expect(coverage[alignRelationId({ helpsKey: TN, olKey: OL, targetKey: ULT, book: 'rut' })]).toBeUndefined()
    expect(coverage[quoteRelationId({ helpsKey: TN, olKey: OL, book: 'jon' })]).toBeDefined()
    expect(coverage[alignRelationId({ helpsKey: TN, olKey: OL, targetKey: ULT, book: 'jon' })]).toBeDefined()
  })

  test('release-stamped keys from before per-book stamps are collected once', async () => {
    const cache = createFakeAdapter()
    const tn = row('v90', { rut: RUT_V90, jon: JON })
    // What the release-stamped code wrote: each resource's release stamp, whatever the book.
    const release = {
      helps: resourceContentStamp(tn),
      ol: `${resourceContentStamp(row('v2', {}))}+${USJ_PROCESSING_VERSION}`,
      target: `${resourceContentStamp(row('v40', {}))}+${SCRIPTURE_PREPARE_VERSION}`,
    }
    const old = await writeBookRows(cache, 'rut', release)

    const stamps = await stampsFor(tn)
    expect((await gc(cache, stamps)).deleted).toBe(2)
    expect(cache.store.has(old.quote)).toBe(false)
    expect(cache.store.has(old.align)).toBe(false)
    expect(await readWarmCoverage(cache)).toEqual({})

    // Rebuilt under the book's stamps, the rows stay through the next collection.
    const rebuilt = await writeBookRows(cache, 'rut', bookStamps(stamps, 'rut'))
    expect((await gc(cache, stamps)).deleted).toBe(0)
    expect(cache.store.has(rebuilt.quote)).toBe(true)
    expect(cache.store.has(rebuilt.align)).toBe(true)
  })

  test('an original that could not be read collects nothing by its stamp', async () => {
    const cache = createFakeAdapter()
    const v90 = await stampsFor(row('v90', { rut: RUT_V90, jon: JON }))
    const ruth = await writeBookRows(cache, 'rut', bookStamps(v90, 'rut'))
    const blind: WarmStampResolvers = { ...v90, olStampOf: () => 'nostamp' }
    expect((await gc(cache, blind)).deleted).toBe(0)
    expect(cache.store.has(ruth.quote)).toBe(true)
  })
})
