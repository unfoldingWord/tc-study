import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { SCRIPTURE_PREPARE_VERSION } from '@bt-synergy/resource-pipeline/scripture/scripturePreparer'
import { readHelpsBookStamps } from './helpsBookStamps'
import { resolveHelpsAlignCacheCtx, resolveHelpsQuoteCacheCtx } from './useWarmAdjacentHelpsQuotes'

const TN = 'unfoldingWord/en/tn'
const ULT = 'unfoldingWord/en/ult'
const UHB = 'unfoldingWord/hbo/uhb'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'

/** A catalog row whose release recorded a blob for Ruth only (`sha` per book, read at the release tag). */
const rowWithBlobs = (tag: string, blobs: Record<string, string>) => ({
  release: { tag_name: tag, published_at: '2026-01-01T00:00:00Z' },
  contentMetadata: { bookBlobs: blobs, bookBlobsRef: tag },
})

const CATALOG: Record<string, unknown> = {
  [TN]: rowWithBlobs('v80', { rut: '1111111111aaaa' }),
  [ULT]: rowWithBlobs('v45', { rut: '2222222222bbbb' }),
  [UHB]: rowWithBlobs('v2.1.30', { rut: '3333333333cccc' }),
  [UGNT]: rowWithBlobs('v0.34', {}),
}
const catalog = { getResourceMetadata: async (key: string) => CATALOG[key] ?? null }

describe('the helps hooks key their rows by the book’s own stamps', () => {
  test('a book with a blob gets g + its blob, for the helps, the original and the target', async () => {
    expect(await readHelpsBookStamps(catalog, { helpsKey: TN, olKey: UHB, targetKey: ULT, bookCode: 'RUT' })).toEqual({
      helpsStamp: 'g1111111111',
      olStamp: `g3333333333+${USJ_PROCESSING_VERSION}`,
      targetStamp: `g2222222222+${SCRIPTURE_PREPARE_VERSION}`,
    })
  })

  test('a book without a blob keeps the release stamp, as before', async () => {
    expect(await readHelpsBookStamps(catalog, { helpsKey: TN, olKey: UGNT, targetKey: ULT, bookCode: 'TIT' })).toEqual({
      helpsStamp: resourceContentStamp(CATALOG[TN] as never),
      olStamp: `${resourceContentStamp(CATALOG[UGNT] as never)}+${USJ_PROCESSING_VERSION}`,
      targetStamp: `${resourceContentStamp(CATALOG[ULT] as never)}+${SCRIPTURE_PREPARE_VERSION}`,
    })
  })

  test('without a target only the helps and original stamps are read', async () => {
    expect(await readHelpsBookStamps(catalog, { helpsKey: TN, olKey: UHB, bookCode: 'rut' })).toEqual({
      helpsStamp: 'g1111111111',
      olStamp: `g3333333333+${USJ_PROCESSING_VERSION}`,
    })
  })

  test('the warm-adjacent quote resolver answers per book', async () => {
    expect(await resolveHelpsQuoteCacheCtx(catalog, TN, 'RUT')).toEqual({
      helpsStamp: 'g1111111111',
      olKey: UHB,
      olStamp: `g3333333333+${USJ_PROCESSING_VERSION}`,
    })
    expect((await resolveHelpsQuoteCacheCtx(catalog, TN, 'TIT'))?.helpsStamp).toBe(resourceContentStamp(CATALOG[TN] as never))
  })

  test('the warm-adjacent align resolver answers per book', async () => {
    expect(await resolveHelpsAlignCacheCtx(catalog, TN, ULT, 'RUT')).toEqual({
      helpsStamp: 'g1111111111',
      olKey: UHB,
      olStamp: `g3333333333+${USJ_PROCESSING_VERSION}`,
      targetStamp: `g2222222222+${SCRIPTURE_PREPARE_VERSION}`,
    })
    expect((await resolveHelpsAlignCacheCtx(catalog, TN, ULT, 'TIT'))?.targetStamp).toBe(
      `${resourceContentStamp(CATALOG[ULT] as never)}+${SCRIPTURE_PREPARE_VERSION}`
    )
  })
})
