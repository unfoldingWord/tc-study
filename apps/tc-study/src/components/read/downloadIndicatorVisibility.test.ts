import { describe, expect, test } from 'bun:test'
import type { DownloadProgress } from '../../hooks/useBackgroundDownload'
import {
  downloadFailureCount,
  formatDownloadCurrentItemLabel,
  shouldShowDownloadIndicator,
} from './downloadIndicatorVisibility'

function progress(partial: Partial<DownloadProgress>): DownloadProgress {
  return {
    currentResource: null,
    currentResourceProgress: 0,
    totalResources: 1,
    completedResources: 1,
    failedResources: 0,
    overallProgress: 100,
    tasks: [],
    ...partial,
  }
}

describe('shouldShowDownloadIndicator', () => {
  test('shows while downloading even with empty leftover progress', () => {
    expect(
      shouldShowDownloadIndicator({
        isDownloading: true,
        progress: progress({
          completedResources: 0,
          overallProgress: 0,
        }),
      })
    ).toBe(true)
    expect(shouldShowDownloadIndicator({ isDownloading: true })).toBe(true)
  })

  test('shows while queued with nothing yet marked downloading', () => {
    expect(
      shouldShowDownloadIndicator({
        isDownloading: false,
        queue: ['unfoldingWord/en/ult'],
      })
    ).toBe(true)
  })

  test('hides idle complete success leftover', () => {
    expect(
      shouldShowDownloadIndicator({
        isDownloading: false,
        progress: progress({
          completedResources: 4,
          totalResources: 4,
          overallProgress: 100,
        }),
      })
    ).toBe(false)
    expect(shouldShowDownloadIndicator({ isDownloading: false })).toBe(false)
    expect(
      shouldShowDownloadIndicator({
        isDownloading: false,
        progress: null,
        queue: [],
        error: null,
      })
    ).toBe(false)
  })

  test('keeps failed leftover visible until a later run clears it', () => {
    expect(
      shouldShowDownloadIndicator({
        isDownloading: false,
        progress: progress({
          completedResources: 3,
          totalResources: 4,
          failedResources: 1,
          overallProgress: 75,
        }),
      })
    ).toBe(true)
    expect(
      shouldShowDownloadIndicator({
        isDownloading: false,
        error: 'Worker error',
      })
    ).toBe(true)
  })

  test('failedIngredients win when ingredient totals are tracked', () => {
    const snapshot = progress({
      totalIngredients: 10,
      completedIngredients: 9,
      failedIngredients: 1,
      failedResources: 0,
    })
    expect(downloadFailureCount(snapshot)).toBe(1)
    expect(
      shouldShowDownloadIndicator({ isDownloading: false, progress: snapshot })
    ).toBe(true)
  })
})

describe('formatDownloadCurrentItemLabel', () => {
  test('current item en + ult includes language code and resource id', () => {
    const label = formatDownloadCurrentItemLabel('unfoldingWord/en/ult')
    expect(label).toContain('en')
    expect(label).toContain('ult')
    expect(label).toBe('en ult')
  })

  test('queued langs stay distinguishable (en ult vs es-419 glt)', () => {
    expect(formatDownloadCurrentItemLabel('unfoldingWord/en/ult')).toBe('en ult')
    expect(formatDownloadCurrentItemLabel('es-419_gl/es-419/glt')).toBe('es-419 glt')
  })

  test('does not invent a language from a bare resource id', () => {
    expect(formatDownloadCurrentItemLabel('ult')).toBe('ult')
  })
})
