import { describe, expect, test } from 'bun:test'
import { resourceContentStamp } from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY } from '../scripture/originalLanguageSpecs'
import { mergeWarmStamps, resolveWarmStamps } from './warmStamps'

const RUT_SHA = '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7'
const JON_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

function row(tag: string, blobs: Record<string, string>, language = 'en') {
  return {
    language,
    release: { tag_name: tag, published_at: '2026-01-01T00:00:00Z' },
    contentMetadata: { bookBlobs: blobs, bookBlobsRef: tag },
  }
}

function catalogOf(rows: Record<string, unknown>, failing: string[] = []) {
  return {
    async getResourceMetadata(key: string) {
      if (failing.includes(key)) throw new Error(`no row for ${key}`)
      return rows[key] ?? null
    },
  }
}

const TN = 'owner/en/tn'
const ULT = 'owner/en/ult'

describe('warm stamps per book', () => {
  test('a helps resource stamps each book by its blob, and a book with no blob by its release', async () => {
    const tn = row('v90', { rut: RUT_SHA })
    const bags = await resolveWarmStamps({ catalog: catalogOf({ [TN]: tn }), stampKeys: [TN] })
    expect(bags.helpsStampOf(TN, 'rut')).toBe('g3d230a0aca')
    expect(bags.helpsStampOf(TN, 'RUT')).toBe('g3d230a0aca')
    expect(bags.helpsStampOf(TN, 'gen')).toBe(resourceContentStamp(tn))
  })

  test('a scripture stamps each book by its blob plus the prepare version, and knows its language', async () => {
    const ult = row('v40', { jon: JON_SHA }, 'en')
    const bags = await resolveWarmStamps({ catalog: catalogOf({ [ULT]: ult }), stampKeys: [ULT] })
    expect(bags.targetStampOf(ULT, 'jon')).toBe(`ga1b2c3d4e5+${SCRIPTURE_PREPARE_VERSION}`)
    expect(bags.targetStampOf(ULT, 'gen')).toBe(`${resourceContentStamp(ult)}+${SCRIPTURE_PREPARE_VERSION}`)
    expect(bags.textLanguageByTarget[ULT]).toBe('en')
  })

  test('a key that was not read in a role has no stamp in it', async () => {
    const bags = await resolveWarmStamps({
      catalog: catalogOf({ [TN]: row('v90', {}), [ULT]: row('v40', {}) }),
      stampKeys: [TN, ULT],
    })
    expect(bags.helpsStampOf(ULT, 'rut')).toBeUndefined()
    expect(bags.targetStampOf(TN, 'rut')).toBeUndefined()
    expect(bags.helpsStampOf('owner/en/twl', 'rut')).toBeUndefined()
  })

  test('the originals stamp each book by its blob plus the USJ version; one that cannot be read is nostamp', async () => {
    const uhb = row('v2.1.30', { rut: RUT_SHA }, 'hbo')
    const bags = await resolveWarmStamps({
      catalog: catalogOf({ [UHB_RESOURCE_KEY]: uhb }, [UGNT_RESOURCE_KEY]),
      stampKeys: [],
    })
    expect(bags.olStampOf(UHB_RESOURCE_KEY, 'rut')).toBe(`g3d230a0aca+${USJ_PROCESSING_VERSION}`)
    expect(bags.olStampOf(UHB_RESOURCE_KEY, 'jon')).toBe(`${resourceContentStamp(uhb)}+${USJ_PROCESSING_VERSION}`)
    expect(bags.olStampOf(UGNT_RESOURCE_KEY, 'mat')).toBe('nostamp')
    expect(bags.olStampOf('someone/else/ol', 'rut')).toBe('nostamp')
  })

  test('an original with no catalog row stamps as an empty release, as the quote hooks do', async () => {
    const bags = await resolveWarmStamps({ catalog: catalogOf({}), stampKeys: [] })
    expect(bags.olStampOf(UHB_RESOURCE_KEY, 'rut')).toBe(`nostamp+${USJ_PROCESSING_VERSION}`)
  })

  test('merged stamps from two screens: the later one wins, and each fills what the other lacks', async () => {
    const first = await resolveWarmStamps({
      catalog: catalogOf({ [TN]: row('v90', { rut: RUT_SHA }), [UHB_RESOURCE_KEY]: row('v1', { rut: RUT_SHA }) }),
      stampKeys: [TN],
    })
    const second = await resolveWarmStamps({
      catalog: catalogOf({ [TN]: row('v91', { rut: JON_SHA }), [ULT]: row('v40', { rut: RUT_SHA }) }, [
        UHB_RESOURCE_KEY,
      ]),
      stampKeys: [TN, ULT],
    })
    const merged = mergeWarmStamps([first, undefined, second])
    expect(merged.helpsStampOf(TN, 'rut')).toBe('ga1b2c3d4e5')
    expect(merged.targetStampOf(ULT, 'rut')).toBe(`g3d230a0aca+${SCRIPTURE_PREPARE_VERSION}`)
    // The second screen could not read UHB, so the first one's stamp stands.
    expect(merged.olStampOf(UHB_RESOURCE_KEY, 'rut')).toBe(`g3d230a0aca+${USJ_PROCESSING_VERSION}`)
    expect(merged.olStampOf('someone/else/ol', 'mat')).toBe('nostamp')
  })
})
