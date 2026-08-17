import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyScriptureContentLoadFailure,
  isScriptureBooksPending,
  scriptureContentLoadKey,
  scriptureMetadataRevision,
} from './scriptureContentLoad'

const KEY = 'es-419_gl/es-419/glt'
const MISS = new Error(
  `Scripture content not available for ${KEY}/tit: Resource metadata not found for ${KEY}.`
)

describe('scripture content load retry (language-switch race)', () => {
  test('metadata missing then added changes load key so content retries', () => {
    const before = scriptureContentLoadKey(
      KEY,
      'tit',
      scriptureMetadataRevision({}, KEY)
    )
    expect(before).toBe(`${KEY}|tit|`)

    const afterAdd = scriptureContentLoadKey(
      KEY,
      'tit',
      scriptureMetadataRevision(
        {
          [`${KEY}#2`]: { contentMetadata: { ingredients: [{ identifier: 'tit' }] } },
        },
        KEY
      )
    )
    expect(afterAdd).toBe(`${KEY}|tit|contentMetadata`)
    expect(afterAdd).not.toBe(before)

    const miss = applyScriptureContentLoadFailure(MISS, false)
    expect(miss.error).toBeNull()
    expect(miss.isLoading).toBe(true)
    expect(miss.retryWhenMetadataArrives).toBe(true)

    const recoveredKey = scriptureContentLoadKey(
      KEY,
      'tit',
      scriptureMetadataRevision(
        { [KEY]: { contentMetadata: { ingredients: [{ identifier: 'tit' }] } } },
        KEY
      )
    )
    expect(recoveredKey).not.toBe(before)
    expect(applyScriptureContentLoadFailure(MISS, false).error).toBeNull()
  })

  test('hard miss after retries keeps the existing error chrome', () => {
    const hard = applyScriptureContentLoadFailure(MISS, true)
    expect(hard.retryWhenMetadataArrives).toBe(false)
    expect(hard.error).toMatch(/Resource metadata not found/)
    expect(hard.isLoading).toBe(false)
  })

  test('empty book list after hydrate is pending, not sticky no-content', () => {
    expect(
      isScriptureBooksPending({
        isLoadingTOC: false,
        isLoading: false,
        availableBookCount: 0,
        hasViewModel: false,
      })
    ).toBe(true)
    expect(
      isScriptureBooksPending({
        isLoadingTOC: false,
        isLoading: false,
        availableBookCount: 1,
        hasViewModel: false,
      })
    ).toBe(false)
    expect(
      isScriptureBooksPending({
        isLoadingTOC: false,
        isLoading: false,
        availableBookCount: 0,
        hasViewModel: true,
      })
    ).toBe(false)
  })

  test('useContent retries when the metadata revision lands', () => {
    const src = readFileSync(join(import.meta.dir, 'useContent.ts'), 'utf8')
    expect(src).toContain('scriptureContentLoadKey')
    expect(src).toContain('scriptureMetadataRevision')
    expect(src).toContain('applyScriptureContentLoadFailure')
    expect(src).toContain('loadKey')
    expect(src).toContain('allowHardMiss')
    expect(src).toContain('getResourceMetadata(resourceKey)')
  })
})
