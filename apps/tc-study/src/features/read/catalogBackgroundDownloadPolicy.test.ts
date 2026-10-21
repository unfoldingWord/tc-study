import { describe, expect, test } from 'bun:test'
import {
  CATALOG_KEYS_TIMEOUT,
  COMPLETE_CHECK_TIMEOUT,
  expectedResourcesSignature,
  filterUncheckedResourceKeys,
  findMissingExpectedResources,
  isExpectedDownloadMonitorTimeout,
  keysToEnqueueForDownload,
  narrowExpectedToCataloged,
  raceWithTimeout,
  shouldResetDownloadTracking,
  shouldWalkUiIdbDuringExtract,
} from './catalogBackgroundDownloadPolicy'

describe('catalogBackgroundDownloadPolicy', () => {
  test('monitor timeouts are expected, not console-error / enqueue', () => {
    expect(isExpectedDownloadMonitorTimeout(new Error(COMPLETE_CHECK_TIMEOUT))).toBe(true)
    expect(isExpectedDownloadMonitorTimeout(new Error(CATALOG_KEYS_TIMEOUT))).toBe(true)
    expect(isExpectedDownloadMonitorTimeout(new Error('IDB transaction inactive'))).toBe(false)
  })

  test('raceWithTimeout clears the timer so a late reject is not unhandled', async () => {
    const result = await raceWithTimeout(Promise.resolve('ok'), 20, COMPLETE_CHECK_TIMEOUT)
    expect(result).toBe('ok')
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  test('raceWithTimeout rejects with the timeout message', async () => {
    await expect(
      raceWithTimeout(new Promise(() => {}), 10, COMPLETE_CHECK_TIMEOUT)
    ).rejects.toThrow(COMPLETE_CHECK_TIMEOUT)
  })

  test('UI IDB walks skip while extract is writing', () => {
    expect(shouldWalkUiIdbDuringExtract(true)).toBe(false)
    expect(shouldWalkUiIdbDuringExtract(false)).toBe(true)
  })

  test('language switch / deep-link scope resets download tracking', () => {
    expect(shouldResetDownloadTracking('', 'en')).toBe(true)
    expect(shouldResetDownloadTracking('en', 'es-419')).toBe(true)
    expect(shouldResetDownloadTracking('es-419', 'es-419')).toBe(false)
    expect(shouldResetDownloadTracking('en', '')).toBe(false)
  })

  test('filling an empty pane language does not reset in-flight tracking', () => {
    expect(shouldResetDownloadTracking('en|', 'en|en')).toBe(false)
    expect(shouldResetDownloadTracking('|en', 'es|en')).toBe(false)
    expect(shouldResetDownloadTracking('en|en', 'es|en')).toBe(true)
    expect(shouldResetDownloadTracking('bho|en', 'bho|es')).toBe(true)
  })

  test('expected signature is order-independent (monitor wait key)', () => {
    expect(expectedResourcesSignature(['a/b/c', 'd/e/f'])).toBe(
      expectedResourcesSignature(['d/e/f', 'a/b/c'])
    )
  })

  test('prior downloading keys would block re-queue without reset', () => {
    const processed = new Set<string>()
    const downloading = new Set(['unfoldingWord/en/ult', 'unfoldingWord/en/tn'])
    const unchecked = filterUncheckedResourceKeys(
      ['unfoldingWord/en/ult', 'es-419_gl/es-419/glt'],
      processed,
      downloading
    )
    // Without reset, switching back toward English leaves ult stuck "downloading"
    expect(unchecked).toEqual(['es-419_gl/es-419/glt'])
  })

  test('two panel languages enqueue together; leftover catalog languages do not', () => {
    const expected = [
      'es-419_gl/es-419/glt',
      'unfoldingWord/el-x-koine/ugnt',
      'unfoldingWord/en/tn',
      'unfoldingWord/en/twl',
      'unfoldingWord/en/ta',
      'unfoldingWord/en/tw',
    ]
    const catalog = [...expected, 'unfoldingWord/fr/ult', 'unfoldingWord/hi/tn']
    const queued = keysToEnqueueForDownload(catalog, expected)
    expect(queued).toEqual(expected)
    expect(queued).toContain('es-419_gl/es-419/glt')
    expect(queued).toContain('unfoldingWord/en/tn')
    expect(queued).not.toContain('unfoldingWord/fr/ult')
    expect(queued).not.toContain('unfoldingWord/hi/tn')
  })

  test('empty expected falls back to catalog keys (manual download path)', () => {
    const catalog = ['unfoldingWord/en/ult', 'unfoldingWord/en/tn']
    expect(keysToEnqueueForDownload(catalog, [])).toEqual(catalog)
    expect(keysToEnqueueForDownload(catalog, null)).toEqual(catalog)
  })

  test('English expected still pulls cataloged UHB for OT quote-build', () => {
    const expected = ['unfoldingWord/en/ult', 'unfoldingWord/en/tn']
    const catalog = [...expected, 'unfoldingWord/hbo/uhb', 'unfoldingWord/fr/ult']
    const queued = keysToEnqueueForDownload(catalog, expected)
    expect(queued).toContain('unfoldingWord/en/ult')
    expect(queued).toContain('unfoldingWord/en/tn')
    expect(queued).toContain('unfoldingWord/hbo/uhb')
    expect(queued).not.toContain('unfoldingWord/fr/ult')
  })

  test('narrowExpectedToCataloged drops keys that never got metadata', () => {
    const expected = [
      'es-419_gl/es-419/glt',
      'es-419_gl/es-419/broken',
      'unfoldingWord/el-x-koine/ugnt',
    ]
    const cataloged = ['es-419_gl/es-419/glt', 'unfoldingWord/el-x-koine/ugnt']
    expect(narrowExpectedToCataloged(expected, cataloged)).toEqual([
      'es-419_gl/es-419/glt',
      'unfoldingWord/el-x-koine/ugnt',
    ])
    expect(findMissingExpectedResources(expected, cataloged)).toEqual([
      'es-419_gl/es-419/broken',
    ])
  })
})
