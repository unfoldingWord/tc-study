import { describe, expect, test } from 'bun:test'
import {
  createInitialDownloadProgress,
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

  test('initial progress seeds totals without claiming completion', () => {
    const progress = createInitialDownloadProgress(['a/b/c', 'd/e/f'], 40)
    expect(progress.overallProgress).toBe(0)
    expect(progress.totalResources).toBe(2)
    expect(progress.totalIngredients).toBe(40)
    expect(progress.completedIngredients).toBe(0)
  })
})
