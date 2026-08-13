import { describe, expect, test } from 'bun:test'
import {
  expectedResourcesSignature,
  filterUncheckedResourceKeys,
  findMissingExpectedResources,
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
