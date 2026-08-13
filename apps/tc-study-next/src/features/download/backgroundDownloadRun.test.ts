import { describe, expect, test } from 'bun:test'
import {
  createInitialDownloadProgress,
  shouldAcceptWorkerMessage,
} from './backgroundDownloadRun'

describe('backgroundDownloadRun', () => {
  test('rejects stale or missing run ids after stop invalidation', () => {
    const active = 3
    expect(shouldAcceptWorkerMessage(active, 3)).toBe(true)
    expect(shouldAcceptWorkerMessage(active, 2)).toBe(false)
    expect(shouldAcceptWorkerMessage(active, undefined)).toBe(false)
    expect(shouldAcceptWorkerMessage(active, null)).toBe(false)
    expect(shouldAcceptWorkerMessage(0, 1)).toBe(false)
    expect(shouldAcceptWorkerMessage(1, 0)).toBe(false)
  })

  test('initial progress seeds totals without claiming completion', () => {
    const progress = createInitialDownloadProgress(['a/b/c', 'd/e/f'], 40)
    expect(progress.overallProgress).toBe(0)
    expect(progress.totalResources).toBe(2)
    expect(progress.totalIngredients).toBe(40)
    expect(progress.completedIngredients).toBe(0)
  })
})
