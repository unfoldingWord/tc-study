import { describe, expect, test } from 'bun:test'
import {
  expectedResourcesSignature,
  filterUncheckedResourceKeys,
  findMissingExpectedResources,
  keysToEnqueueForDownload,
  narrowExpectedToCataloged,
  shouldResetDownloadTracking,
} from './catalogBackgroundDownloadPolicy'

describe('catalogBackgroundDownloadPolicy', () => {
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
