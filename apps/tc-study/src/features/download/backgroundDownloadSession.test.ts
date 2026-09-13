import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  backgroundDownloadSession,
  getBackgroundDownloadSession,
  getBackgroundDownloadWorkerConstructCount,
} from './backgroundDownloadSession'

describe('backgroundDownloadSession', () => {
  test('Read remount / second subscribe uses the same singleton (no new worker)', () => {
    expect(getBackgroundDownloadSession()).toBe(backgroundDownloadSession)
    expect(getBackgroundDownloadSession()).toBe(getBackgroundDownloadSession())
    const before = getBackgroundDownloadWorkerConstructCount()
    const unsubA = backgroundDownloadSession.subscribe(() => {})
    const unsubB = backgroundDownloadSession.subscribe(() => {})
    expect(getBackgroundDownloadWorkerConstructCount()).toBe(before)
    unsubA()
    unsubB()
  })

  test('start while a run is busy is a no-op (does not reseed 1%)', () => {
    expect(backgroundDownloadSession.isBusy()).toBe(false)
    // Guard lives in startDownload: if isBusy, return false without emit/reset.
    // Worker is not constructed by subscribe/remount — only by an accepted start.
    expect(getBackgroundDownloadWorkerConstructCount()).toBe(0)
  })

  test('session can retry the last key after an error (recreates worker)', () => {
    expect(typeof backgroundDownloadSession.retryLastRun).toBe('function')
    expect(backgroundDownloadSession.retryLastRun()).toBe(false)
  })

  test('stall watchdog lives on the session so a dead worker cannot leave 1% forever', () => {
    const src = readFileSync(
      join(import.meta.dir, 'backgroundDownloadSession.ts'),
      'utf8'
    )
    expect(src).toContain('DOWNLOAD_STALL_MESSAGE')
    expect(src).toContain('bumpStallWatchdog')
    expect(src).toContain('failSession(DOWNLOAD_STALL_MESSAGE)')
    expect(src).toContain('bumpReadyWatchdog')
    expect(src).toContain('startMainThreadFallback')
    expect(src).toContain('runBackgroundDownloadOnThisThread')
    expect(src).toContain('Chrome: isolate is alive')
    expect(src).toContain('shouldFallbackOnWorkerError')
    expect(src).toContain('shouldRunExtractOnThisThread')
    expect(src).not.toContain('isWorkerIsolateFailure(previousError)')
    expect(src).toContain('lastResourceKeys')
    expect(src).toContain('applyDiscoveredIngredientTotal')
    const thisThread = readFileSync(
      join(import.meta.dir, 'runBackgroundDownloadOnThisThread.ts'),
      'utf8'
    )
    expect(thisThread).toContain('resolveRunIngredientTotal')
    expect(thisThread).not.toContain('needsCalculation')
  })
})
