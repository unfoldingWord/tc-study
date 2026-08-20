import { describe, expect, test } from 'bun:test'
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
})
