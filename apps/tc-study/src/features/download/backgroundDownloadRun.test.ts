import { describe, expect, test } from 'bun:test'
import {
  STARTING_PROGRESS_PERCENT,
  advanceResourceIngredientProgress,
  computeInFlightOverallProgress,
  createInitialDownloadProgress,
  currentResourceDisplayPercent,
  displayDownloadPercent,
  downloadBlockedReason,
  isZipByteProgress,
  keysForDownloadRetry,
  inferDownloadPhase,
  mapLoaderProgressToResource,
  pulseInFlightDownloadProgress,
  shouldAcceptStartDownload,
  shouldAcceptWorkerMessage,
  shouldFailStalledDownload,
  shouldFallbackOnWorkerError,
  shouldFallbackSilentWorker,
  shouldFallbackStuckStarting,
  isWorkerIsolateFailure,
  downloadControlSnapshotEqual,
  shouldRunExtractOnThisThread,
  DOWNLOAD_WORKER_READY_TIMEOUT_MS,
  shouldRecreateWorkerBeforeStart,
  shouldSkipCompleteResourceDownload,
  skippedCompleteResourceProgress,
  applyDiscoveredIngredientTotal,
  discoveredIngredientCount,
  fallbackIngredientCount,
  displayIngredientCounts,
  growRunIngredientTotal,
  resolveRunIngredientTotal,
  totalIngredientsForResourceKeys,
  OBS_FALLBACK_INGREDIENT_COUNT,
  UHB_FALLBACK_INGREDIENT_COUNT,
  UGNT_FALLBACK_INGREDIENT_COUNT,
  DOWNLOAD_STALL_TIMEOUT_MS,
  withResourceDownloadTimeout,
} from './backgroundDownloadRun'

describe('backgroundDownloadRun', () => {
  test('skips the zip only when skipExisting and the resource is complete', () => {
    expect(shouldSkipCompleteResourceDownload(true, true)).toBe(true)
    expect(shouldSkipCompleteResourceDownload(true, false)).toBe(false)
    expect(shouldSkipCompleteResourceDownload(false, true)).toBe(false)
    const skipped = skippedCompleteResourceProgress(39, 'unfoldingWord/hbo/uhb')
    expect(skipped.loaded).toBe(39)
    expect(skipped.total).toBe(39)
    expect(skipped.message).toContain('Skipped uhb')
  })

  test('busy run rejects a new start so percent is not reset to 1%', () => {
    expect(shouldAcceptStartDownload(true)).toBe(false)
    expect(shouldAcceptStartDownload(false)).toBe(true)
  })

  test('progress-only pulses do not change the control snapshot', () => {
    const control = {
      isDownloading: true,
      queue: ['unfoldingWord/en/ult'],
      error: null as string | null,
    }
    expect(
      downloadControlSnapshotEqual(control, {
        ...control,
      })
    ).toBe(true)
    expect(
      downloadControlSnapshotEqual(control, {
        ...control,
        isDownloading: false,
      })
    ).toBe(false)
    expect(
      downloadControlSnapshotEqual(control, {
        ...control,
        queue: ['unfoldingWord/en/ult', 'unfoldingWord/en/tn'],
      })
    ).toBe(false)
  })

  test('this-thread extract only when no Worker was constructed', () => {
    expect(shouldRunExtractOnThisThread({ workerConstructed: true })).toBe(false)
    expect(shouldRunExtractOnThisThread({ workerConstructed: false })).toBe(true)
  })

  test('window/document isolate death falls back instead of failing the session', () => {
    expect(isWorkerIsolateFailure('Uncaught ReferenceError: window is not defined')).toBe(
      true
    )
    expect(isWorkerIsolateFailure('document is not defined')).toBe(true)
    expect(isWorkerIsolateFailure('Download stalled (no progress). Tap retry.')).toBe(
      false
    )
    expect(
      shouldFallbackOnWorkerError({
        isDownloading: true,
        message: 'Uncaught ReferenceError: window is not defined',
      })
    ).toBe(true)
    expect(
      shouldFallbackOnWorkerError({
        isDownloading: false,
        message: 'window is not defined',
      })
    ).toBe(false)
  })

  test('recreates the worker after an idle error so retry is not posted to a dead isolate', () => {
    expect(shouldRecreateWorkerBeforeStart({ error: 'window is not defined', isDownloading: false })).toBe(
      true
    )
    expect(shouldRecreateWorkerBeforeStart({ error: null, isDownloading: false })).toBe(false)
    expect(shouldRecreateWorkerBeforeStart({ error: 'x', isDownloading: true })).toBe(false)
  })

  test('retry keys prefer the queue, then the in-flight resource', () => {
    expect(
      keysForDownloadRetry({
        queue: ['unfoldingWord/hbo/uhb'],
        currentResource: 'unfoldingWord/hbo/uhb',
      })
    ).toEqual(['unfoldingWord/hbo/uhb'])
    expect(
      keysForDownloadRetry({
        queue: [],
        currentResource: 'unfoldingWord/hbo/uhb',
      })
    ).toEqual(['unfoldingWord/hbo/uhb'])
    expect(keysForDownloadRetry({ queue: [], currentResource: null })).toEqual([])
  })

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
    expect(progress.phase).toBe('starting')
  })

  test('UHB without listed total seeds 39 ingredients (not 0 → UI 0/1)', () => {
    const progress = createInitialDownloadProgress(['unfoldingWord/hbo/uhb'])
    expect(progress.totalIngredients).toBe(UHB_FALLBACK_INGREDIENT_COUNT)
    expect(progress.totalResources).toBe(1)
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

  test('resume pulse keeps a live run at least at the starting percent', () => {
    const mid = createInitialDownloadProgress(['a/b/c'], 10)
    mid.overallProgress = 42
    const pulsed = pulseInFlightDownloadProgress(mid, true)
    expect(pulsed?.overallProgress).toBe(42)
    expect(pulseInFlightDownloadProgress({ overallProgress: 0, currentResourceProgress: 0 }, true)?.overallProgress).toBe(
      STARTING_PROGRESS_PERCENT
    )
    expect(pulseInFlightDownloadProgress(mid, false)?.overallProgress).toBe(42)
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

  test('zip-byte percentage does not credit ingredients; extract counts written books', () => {
    const ingredients = 52
    expect(isZipByteProgress({ message: 'Downloading zip', percentage: 100 })).toBe(true)
    expect(isZipByteProgress({ message: 'Extracting frt', loaded: 0, total: ingredients })).toBe(
      false
    )

    const zipDone = mapLoaderProgressToResource({
      ingredientsCount: ingredients,
      peakCompleted: 0,
      progress: {
        loaded: 0,
        total: ingredients,
        percentage: 100,
        message: 'Downloading zip',
      },
    })
    expect(zipDone.writtenInResource).toBe(0)
    expect(zipDone.currentResourcePercent).toBe(100)

    const extractingFrt = mapLoaderProgressToResource({
      ingredientsCount: ingredients,
      peakCompleted: zipDone.writtenInResource,
      progress: {
        loaded: 0,
        total: ingredients,
        percentage: 0,
        message: 'Extracting frt',
      },
    })
    expect(extractingFrt.writtenInResource).toBe(0)
    expect(extractingFrt.currentResourcePercent).toBe(0)

    const afterBookN = mapLoaderProgressToResource({
      ingredientsCount: ingredients,
      peakCompleted: extractingFrt.writtenInResource,
      progress: {
        loaded: 7,
        total: ingredients,
        percentage: Math.round((7 / ingredients) * 100),
        message: 'Processed gen',
      },
    })
    expect(afterBookN.writtenInResource).toBe(7)
    expect(afterBookN.currentResourcePercent).toBeCloseTo((7 / ingredients) * 100)

    expect(
      advanceResourceIngredientProgress(ingredients, 0, {
        loaded: 0,
        total: ingredients,
        percentage: 100,
        message: 'Downloading zip',
      })
    ).toBe(0)
    expect(
      currentResourceDisplayPercent({
        progress: { loaded: 7, total: ingredients, message: 'Processed gen' },
        writtenInResource: 7,
        ingredientsCount: ingredients,
      })
    ).toBeCloseTo((7 / ingredients) * 100)
  })

  test('zip done of a 52-book run is not 52/52; extract of book N is N/52', () => {
    const ingredients = 52
    const zipOverall = computeInFlightOverallProgress({
      completedIngredients: 0,
      totalIngredients: ingredients,
      currentResourceIngredients: ingredients,
      currentResourcePercent: 100,
    })
    expect(zipOverall).toBeLessThan(100)
    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 0,
        total: ingredients,
        reportedOverall: zipOverall,
        currentIngredient: null,
      })
    ).toBeLessThan(100)

    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 0,
        total: ingredients,
        reportedOverall: 100,
        currentIngredient: 'frt',
      })
    ).toBe(99)

    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 7,
        total: ingredients,
        reportedOverall: Math.round((7 / ingredients) * 100),
        currentIngredient: 'gen',
      })
    ).toBe(Math.round((7 / ingredients) * 100))

    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: ingredients,
        total: ingredients,
        reportedOverall: 100,
        currentIngredient: 'frt',
      })
    ).toBe(99)

    expect(
      displayDownloadPercent({
        isDownloading: false,
        completed: ingredients,
        total: ingredients,
        reportedOverall: 100,
      })
    ).toBe(100)
  })

  test('completed cannot exceed total; 172/50 is not 100% mid-run', () => {
    const shown = displayIngredientCounts({ completed: 172, total: 50 })
    expect(shown.completed).toBeLessThanOrEqual(shown.total)
    expect(shown.total).toBe(172)
    expect(shown.completed).toBe(172)
    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 172,
        total: 50,
        reportedOverall: 100,
      })
    ).toBeLessThan(100)
    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: 238,
        total: 50,
        reportedOverall: Math.round((238 / 50) * 100),
        currentIngredient: 'ust',
      })
    ).toBe(99)
    expect(
      displayDownloadPercent({
        isDownloading: false,
        completed: 172,
        total: 172,
        reportedOverall: 100,
      })
    ).toBe(100)
  })

  test('adding a second resource raises the run total', () => {
    const uhbOnly = resolveRunIngredientTotal({
      providedTotal: 50,
      discoveredCounts: [UHB_FALLBACK_INGREDIENT_COUNT],
    })
    const uhbPlusUlt = resolveRunIngredientTotal({
      providedTotal: 50,
      discoveredCounts: [UHB_FALLBACK_INGREDIENT_COUNT, 66],
    })
    expect(uhbOnly).toBe(UHB_FALLBACK_INGREDIENT_COUNT)
    expect(uhbPlusUlt).toBe(UHB_FALLBACK_INGREDIENT_COUNT + 66)
    expect(uhbPlusUlt).toBeGreaterThan(uhbOnly)
    expect(growRunIngredientTotal(50, 1, 66)).toBe(115)
    expect(applyDiscoveredIngredientTotal(50, 105)).toBe(105)
    expect(resolveRunIngredientTotal({ providedTotal: 50, discoveredCounts: [] })).toBe(50)
  })

  test('skip-complete UHB 39 + extract ULT does not stay at /50', () => {
    const catalogEstimate = 50
    const afterMetadata = resolveRunIngredientTotal({
      providedTotal: catalogEstimate,
      discoveredCounts: [UHB_FALLBACK_INGREDIENT_COUNT, 66],
    })
    expect(afterMetadata).toBe(105)
    expect(afterMetadata).not.toBe(catalogEstimate)
    const afterSkipUh = displayIngredientCounts({
      completed: UHB_FALLBACK_INGREDIENT_COUNT,
      total: afterMetadata,
    })
    expect(afterSkipUh.completed).toBe(39)
    expect(afterSkipUh.total).toBe(105)
    expect(afterSkipUh.completed).toBeLessThan(afterSkipUh.total)
    expect(
      displayDownloadPercent({
        isDownloading: true,
        completed: UHB_FALLBACK_INGREDIENT_COUNT,
        total: afterMetadata,
        currentIngredient: 'ult',
      })
    ).toBeLessThan(100)
  })

  test('UHB without catalog ingredients is 39 books, not 0/1', () => {
    expect(fallbackIngredientCount('unfoldingWord/hbo/uhb')).toBe(
      UHB_FALLBACK_INGREDIENT_COUNT
    )
    expect(fallbackIngredientCount('unfoldingWord/hbo/uhb', 0)).toBe(
      UHB_FALLBACK_INGREDIENT_COUNT
    )
    expect(fallbackIngredientCount('unfoldingWord/hbo/uhb', 39)).toBe(39)
    expect(fallbackIngredientCount('unfoldingWord/el-x-koine/ugnt')).toBe(
      UGNT_FALLBACK_INGREDIENT_COUNT
    )
    expect(fallbackIngredientCount('unfoldingWord/en/ult')).toBe(1)
    expect(fallbackIngredientCount('unfoldingWord/en/ult', 66)).toBe(66)
    expect(totalIngredientsForResourceKeys(['unfoldingWord/hbo/uhb'])).toBe(39)
    expect(
      totalIngredientsForResourceKeys(['unfoldingWord/hbo/uhb'], {
        'unfoldingWord/hbo/uhb': 1,
      })
    ).toBe(1)
  })

  test('OBS directory-only catalog is 50 stories, not 0/1', () => {
    expect(fallbackIngredientCount('unfoldingWord/en/obs')).toBe(
      OBS_FALLBACK_INGREDIENT_COUNT
    )
    expect(fallbackIngredientCount('unfoldingWord/en/obs', 0)).toBe(
      OBS_FALLBACK_INGREDIENT_COUNT
    )
    expect(fallbackIngredientCount('unfoldingWord/en/obs', 1)).toBe(
      OBS_FALLBACK_INGREDIENT_COUNT
    )
    expect(fallbackIngredientCount('unfoldingWord/en/obs', 50)).toBe(50)
    expect(
      discoveredIngredientCount('unfoldingWord/en/obs', [
        { identifier: 'obs', path: './content' },
      ])
    ).toBe(50)
    expect(
      discoveredIngredientCount('unfoldingWord/en/obs', [
        { identifier: '1' },
        { identifier: '2' },
      ])
    ).toBe(2)
    expect(
      totalIngredientsForResourceKeys(['unfoldingWord/en/obs'], {
        'unfoldingWord/en/obs': 1,
      })
    ).toBe(50)
    expect(
      createInitialDownloadProgress(['unfoldingWord/en/obs'], 1).totalIngredients
    ).toBe(50)
    expect(
      createInitialDownloadProgress(['unfoldingWord/en/obs']).totalIngredients
    ).toBe(50)
  })

  test('silent worker with no messages falls back instead of sitting at 1%', () => {
    const started = 1_000
    expect(
      shouldFallbackSilentWorker({
        isDownloading: true,
        workerMessageCount: 0,
        startedAt: started,
        now: started + 5_000,
        readyMs: 12_000,
      })
    ).toBe(false)
    expect(
      shouldFallbackSilentWorker({
        isDownloading: true,
        workerMessageCount: 0,
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
      })
    ).toBe(true)
    expect(
      shouldFallbackSilentWorker({
        isDownloading: true,
        workerMessageCount: 1,
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
      })
    ).toBe(false)
    expect(
      shouldFallbackSilentWorker({
        isDownloading: true,
        workerMessageCount: 0,
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
        workerAlive: true,
      })
    ).toBe(false)
  })

  test('ready without progress falls back instead of sitting at starting', () => {
    const started = 1_000
    expect(
      shouldFallbackStuckStarting({
        isDownloading: true,
        workerProgressCount: 0,
        phase: 'starting',
        startedAt: started,
        now: started + 5_000,
      })
    ).toBe(false)
    expect(
      shouldFallbackStuckStarting({
        isDownloading: true,
        workerProgressCount: 0,
        phase: 'starting',
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
      })
    ).toBe(true)
    expect(
      shouldFallbackStuckStarting({
        isDownloading: true,
        workerProgressCount: 0,
        phase: 'init',
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
      })
    ).toBe(true)
    expect(
      shouldFallbackStuckStarting({
        isDownloading: true,
        workerProgressCount: 1,
        phase: 'starting',
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
      })
    ).toBe(false)
    expect(
      shouldFallbackStuckStarting({
        isDownloading: true,
        workerProgressCount: 0,
        phase: 'checking',
        startedAt: started,
        now: started + DOWNLOAD_WORKER_READY_TIMEOUT_MS,
      })
    ).toBe(false)
  })

  test('silent worker death after the 1% pulse marks the session failed', () => {
    const started = 1_000
    expect(
      shouldFailStalledDownload({
        isDownloading: true,
        lastProgressAt: started,
        now: started + 60_000,
        stallMs: 120_000,
      })
    ).toBe(false)
    expect(
      shouldFailStalledDownload({
        isDownloading: true,
        lastProgressAt: started,
        now: started + 120_000,
        stallMs: 120_000,
      })
    ).toBe(true)
    expect(
      shouldFailStalledDownload({
        isDownloading: false,
        lastProgressAt: started,
        now: started + DOWNLOAD_STALL_TIMEOUT_MS,
      })
    ).toBe(false)
    expect(
      shouldFailStalledDownload({
        isDownloading: true,
        lastProgressAt: 0,
        now: started + DOWNLOAD_STALL_TIMEOUT_MS,
      })
    ).toBe(false)
  })

  test('inferDownloadPhase maps loader messages and explicit phases', () => {
    expect(inferDownloadPhase({ isDownloading: false })).toBe('idle')
    expect(inferDownloadPhase({ isDownloading: false, error: 'x' })).toBe('error')
    expect(inferDownloadPhase({ isDownloading: true, phase: 'metadata' })).toBe('metadata')
    expect(
      inferDownloadPhase({ isDownloading: true, currentIngredient: 'Downloading zip' })
    ).toBe('downloading')
    expect(
      inferDownloadPhase({ isDownloading: true, message: 'Extracting gen' })
    ).toBe('extracting')
  })

  test('downloadBlockedReason surfaces quiet phases before full stall', () => {
    const now = 1_000_000
    expect(
      downloadBlockedReason({
        isDownloading: true,
        phase: 'checking',
        lastActivityAt: now - 20_000,
        now,
      })
    ).toBe('quiet 20s · checking')
    expect(
      downloadBlockedReason({
        isDownloading: true,
        lastActivityAt: now - DOWNLOAD_STALL_TIMEOUT_MS,
        now,
      })
    ).toContain('stalled')
    expect(
      downloadBlockedReason({
        isDownloading: true,
        lastActivityAt: now - 5_000,
        now,
      })
    ).toBeNull()
  })
})
