import { describe, expect, test } from 'bun:test'
import {
  advanceResourceIngredientProgress,
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

  test('zip-byte percentage advances and does not regress when extraction starts', () => {
    const ingredients = 66
    const afterZip = advanceResourceIngredientProgress(ingredients, 0, {
      loaded: 0,
      total: ingredients,
      percentage: 50,
    })
    expect(afterZip).toBe(33)

    const afterFirstBook = advanceResourceIngredientProgress(ingredients, afterZip, {
      loaded: 1,
      total: ingredients,
      percentage: Math.round((1 / ingredients) * 100),
    })
    expect(afterFirstBook).toBe(33)

    const afterHalfBooks = advanceResourceIngredientProgress(ingredients, afterFirstBook, {
      loaded: 40,
      total: ingredients,
      percentage: Math.round((40 / ingredients) * 100),
    })
    expect(afterHalfBooks).toBe(40)
  })
})
