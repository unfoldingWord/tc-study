import { describe, expect, test } from 'bun:test'
import {
  STARTING_PROGRESS_PERCENT,
  advanceResourceIngredientProgress,
  computeInFlightOverallProgress,
  createInitialDownloadProgress,
  displayDownloadPercent,
  shouldAcceptWorkerMessage,
  withResourceDownloadTimeout,
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

  test('resource timeout rejects so a hung zip cannot freeze the queue', async () => {
    const hung = new Promise<void>(() => {})
    await expect(withResourceDownloadTimeout(hung, 20, 'unfoldingWord/en/tw')).rejects.toThrow(
      /timed out after 20ms: unfoldingWord\/en\/tw/
    )
  })

  test('resource timeout does not reject work that finishes in time', async () => {
    await expect(withResourceDownloadTimeout(Promise.resolve('ok'), 200, 'a/b/c')).resolves.toBe(
      'ok'
    )
  })

  test('initial progress seeds totals with a starting pulse, not 0%', () => {
    const progress = createInitialDownloadProgress(['a/b/c', 'd/e/f'], 40)
    expect(progress.overallProgress).toBe(STARTING_PROGRESS_PERCENT)
    expect(progress.currentResource).toBe('a/b/c')
    expect(progress.totalResources).toBe(2)
    expect(progress.totalIngredients).toBe(40)
    expect(progress.completedIngredients).toBe(0)
  })

  test('in-flight zip percent moves the badge before any ingredient floors', () => {
    expect(
      computeInFlightOverallProgress({
        completedIngredients: 0,
        totalIngredients: 66,
        currentResourceIngredients: 66,
        currentResourcePercent: 1,
      })
    ).toBe(STARTING_PROGRESS_PERCENT)
    expect(
      computeInFlightOverallProgress({
        completedIngredients: 0,
        totalIngredients: 200,
        currentResourceIngredients: 200,
        currentResourcePercent: 50,
      })
    ).toBe(50)
    expect(
      computeInFlightOverallProgress({
        completedIngredients: 0,
        totalIngredients: 100,
        currentResourceIngredients: 50,
        currentResourcePercent: 50,
      })
    ).toBe(25)
  })

  test('display percent pulses 1% while downloading at 0/N and honors zip overall', () => {
    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 0,
        total: 66,
        reportedOverall: 0,
      })
    ).toBe(STARTING_PROGRESS_PERCENT)
    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 0,
        total: 66,
        reportedOverall: 12,
      })
    ).toBe(12)
    expect(
      displayDownloadPercent({
        isDownloading: false,
        completed: 0,
        total: 66,
        reportedOverall: 0,
      })
    ).toBe(0)
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
