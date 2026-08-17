import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyObsContentLoadFailure,
  obsContentLoadKey,
  obsMetadataRevision,
} from './obsContentLoad'

const KEY = 'Door43-Catalog/tr/obs'
const MISS = new Error(`Resource not found: ${KEY}`)

describe('OBS content load retry (first-open catalog race)', () => {
  test('metadata missing then added changes load key so stories retry', () => {
    const before = obsContentLoadKey(KEY, 1, 1, 'obs', obsMetadataRevision({}, KEY))
    expect(before).toBe(`${KEY}|obs|1|1|`)

    const afterAdd = obsContentLoadKey(
      KEY,
      1,
      1,
      'obs',
      obsMetadataRevision(
        {
          [`${KEY}#2`]: { contentMetadata: { ingredients: [{ identifier: '01' }] } },
        },
        KEY
      )
    )
    expect(afterAdd).toBe(`${KEY}|obs|1|1|contentMetadata`)
    expect(afterAdd).not.toBe(before)

    const miss = applyObsContentLoadFailure(MISS, false)
    expect(miss.error).toBeNull()
    expect(miss.isLoading).toBe(true)
    expect(miss.retryWhenMetadataArrives).toBe(true)

    const recoveredKey = obsContentLoadKey(
      KEY,
      1,
      1,
      'obs',
      obsMetadataRevision({ [KEY]: { contentMetadata: { ingredients: [{ identifier: '01' }] } } }, KEY)
    )
    expect(recoveredKey).not.toBe(before)
    expect(applyObsContentLoadFailure(MISS, false).error).toBeNull()
  })

  test('hard miss after retries keeps the existing error chrome', () => {
    const hard = applyObsContentLoadFailure(MISS, true)
    expect(hard.retryWhenMetadataArrives).toBe(false)
    expect(hard.error).toMatch(/Resource not found/)
    expect(hard.isLoading).toBe(false)
  })

  test('useObsStories retries when the metadata revision lands', () => {
    const src = readFileSync(join(import.meta.dir, 'useObsStories.ts'), 'utf8')
    expect(src).toContain('obsContentLoadKey')
    expect(src).toContain('obsMetadataRevision')
    expect(src).toContain('applyObsContentLoadFailure')
    expect(src).toContain('loadKey')
    expect(src).toContain('allowHardMiss')
    expect(src).toContain('getResourceMetadata(resourceKey)')
  })
})
