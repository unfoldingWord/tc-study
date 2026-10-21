import { describe, expect, test } from 'bun:test'
import {
  PROCESS_STEP_RING_CAPACITY,
  clearProcessSteps,
  createProcessStepRing,
  explainWarmLaneGate,
  formatProcessStepLine,
  listProcessSteps,
  pushProcessStep,
} from '../../features/debug/processStepRing'
import {
  buildCatalogDownloadSection,
  buildPrepareSection,
  buildProcessDebugModel,
  buildProcessEventLog,
  buildWarmSection,
  formatActivityAge,
} from './processDebugModel'
import type { WarmSchedulerStats } from '../../features/warm/warmScheduler'

const emptyWarm = (): WarmSchedulerStats => ({
  lane1Drained: true,
  scrollUnsettled: false,
  pendingJobKeys: 0,
  pendingJobKeySample: [],
  dedicatedWorker: true,
  lane2Blocked: null,
  lane3Blocked: null,
  context: null,
  recentOutcomes: [],
  lane1BusyOwnerSample: [],
})

describe('processStepRing', () => {
  test('caps events and lists newest last', () => {
    const ring = createProcessStepRing(3)
    pushProcessStep(ring, { worker: 'session', step: 'a', t: 1 })
    pushProcessStep(ring, { worker: 'catalog-download', step: 'b', t: 2 })
    pushProcessStep(ring, { worker: 'warm', step: 'c', t: 3 })
    pushProcessStep(ring, { worker: 'prepare', step: 'd', detail: 'x', t: 4 })
    expect(listProcessSteps(ring).map((e) => e.step)).toEqual(['b', 'c', 'd'])
    expect(listProcessSteps(ring, 2).map((e) => e.step)).toEqual(['c', 'd'])
    clearProcessSteps(ring)
    expect(listProcessSteps(ring)).toEqual([])
    expect(PROCESS_STEP_RING_CAPACITY).toBeGreaterThanOrEqual(50)
  })

  test('formats age + worker + step', () => {
    const line = formatProcessStepLine(
      { t: 1_000_000 - 12_000, worker: 'catalog-download', step: 'fetch-manifest', detail: 'ugnt' },
      1_000_000
    )
    expect(line).toContain('-12s')
    expect(line).toContain('[catalog-download]')
    expect(line).toContain('fetch-manifest')
    expect(line).toContain('ugnt')
  })

  test('explains warm lane gates', () => {
    expect(explainWarmLaneGate('lane1-busy')).toContain('lane1')
    expect(explainWarmLaneGate('pending>=8')).toContain('pending')
    expect(explainWarmLaneGate(null)).toBeNull()
  })
})

describe('formatActivityAge', () => {
  test('formats seconds and minutes', () => {
    const now = 1_000_000
    expect(formatActivityAge(now - 12_000, now)).toBe('12s')
    expect(formatActivityAge(now - 125_000, now)).toBe('2m 5s')
    expect(formatActivityAge(null, now)).toBeNull()
  })
})

describe('buildCatalogDownloadSection', () => {
  test('prefers ingredient totals and surfaces phase + blocked reason + steps', () => {
    const now = Date.now()
    const section = buildCatalogDownloadSection({
      queue: ['unfoldingWord/hbo/uhb'],
      completedResourceKeys: [],
      isDownloading: true,
      error: null,
      progress: {
        currentResource: 'unfoldingWord/hbo/uhb',
        currentResourceProgress: 1,
        totalResources: 1,
        completedResources: 0,
        failedResources: 0,
        overallProgress: 1,
        tasks: [],
        totalIngredients: 39,
        completedIngredients: 0,
        phase: 'metadata',
        currentIngredient: 'metadata',
      },
      blockedReason: 'quiet 20s · metadata',
      lastActivityAt: now - 20_000,
      recentSteps: [
        {
          t: now - 5_000,
          worker: 'catalog-download',
          step: 'fetch-manifest',
          detail: 'unfoldingWord/hbo/uhb',
        },
      ],
      now,
    })
    expect(section.badge).toContain('0/39')
    expect(section.badge).toContain('metadata')
    expect(section.active).toContain('quiet')
    expect(section.lines.some((l) => l.includes('unfoldingWord/hbo/uhb'))).toBe(true)
    expect(section.lines.some((l) => l.includes('fetch-manifest'))).toBe(true)
    expect(section.lines.some((l) => l.includes('since-progress'))).toBe(true)
  })
})

describe('buildWarmSection', () => {
  test('lists pending keys, gate explainers, and outcomes', () => {
    const now = 1_000_000
    const section = buildWarmSection({
      scheduler: {
        ...emptyWarm(),
        pendingJobKeys: 2,
        pendingJobKeySample: ['quote:a', 'align:b'],
        lane1Drained: false,
        lane2Blocked: 'lane1-busy',
        lane1BusyOwnerSample: ['helps'],
        recentOutcomes: [{ t: now - 3_000, jobKey: 'quote:a', outcome: 'finished' }],
      },
      workerQueue: {
        queueDepth: 1,
        byLane: { 1: 0, 2: 1, 3: 0 },
        currentJobKey: 'quote:a',
        currentKind: 'quote-chapter',
        currentLane: 2,
        currentResourceKey: 'unfoldingWord/en/tn',
        currentBookId: 'tit',
        pending: [
          {
            jobKey: 'align:b',
            kind: 'align-chapter',
            lane: 2,
            resourceKey: 'unfoldingWord/en/tn',
            bookId: 'tit',
            chapter: 2,
          },
        ],
      },
      now,
    })
    expect(section.badge).toContain('pending 2')
    expect(section.active).toBe('quote:a')
    expect(section.lines.some((l) => l.includes('L2/L3 gated'))).toBe(true)
    expect(section.lines.some((l) => l.includes('owners=[helps]'))).toBe(true)
    expect(section.lines.some((l) => l.includes('pend L2 align-chapter'))).toBe(true)
    expect(section.lines.some((l) => l.includes('out -3s finished'))).toBe(true)
  })
})

describe('buildPrepareSection', () => {
  test('idle when stats null', () => {
    expect(buildPrepareSection(null).badge).toBe('idle')
  })

  test('shows prepare + warm depth and outcomes', () => {
    const now = 1_000_000
    const section = buildPrepareSection(
      {
        prepareDepth: 3,
        warmDepth: 1,
        currentPrepare: {
          typeId: 'scripture',
          resourceKey: 'unfoldingWord/en/ult',
          bookId: 'tit',
          units: [1],
          priority: 'interactive',
          tier: 'both',
        },
        currentWarmJobKey: null,
        currentWarmKind: null,
        currentWarmLane: null,
        preparePending: [
          {
            typeId: 'scripture',
            resourceKey: 'unfoldingWord/en/ult',
            bookId: 'tit',
            units: [2, 3],
            priority: 'background',
            tier: 'both',
          },
        ],
        recentOutcomes: [{ t: now - 2_000, step: 'prepare-done', detail: 'ult tit' }],
      },
      now
    )
    expect(section.badge).toBe('prep 3 · warm 1')
    expect(section.active).toContain('ult')
    expect(section.lines.some((l) => l.includes('prepQ'))).toBe(true)
    expect(section.lines.some((l) => l.includes('prepare-done'))).toBe(true)
  })
})

describe('buildProcessDebugModel', () => {
  test('header uses ingredients and includes event log', () => {
    const now = 1_000_000
    const model = buildProcessDebugModel({
      queue: ['unfoldingWord/hbo/uhb'],
      completedResourceKeys: [],
      isDownloading: true,
      error: null,
      progress: {
        currentResource: 'unfoldingWord/hbo/uhb',
        currentResourceProgress: 1,
        totalResources: 1,
        completedResources: 0,
        failedResources: 0,
        overallProgress: 1,
        tasks: [],
        totalIngredients: 39,
        completedIngredients: 0,
        phase: 'downloading',
        currentIngredient: 'zip',
      },
      recentSteps: [
        { t: now - 1_000, worker: 'session', step: 'start', detail: '1 keys' },
        {
          t: now - 500,
          worker: 'catalog-download',
          step: 'download-file',
          detail: 'Downloading zip',
        },
      ],
      warm: emptyWarm(),
      warmWorkerQueue: null,
      prepare: null,
      now,
    })
    expect(model.completed).toBe(0)
    expect(model.total).toBe(39)
    expect(model.phase).toBe('downloading')
    expect(model.sections).toHaveLength(3)
    expect(model.download.queuedCount).toBe(0)
    expect(model.download.totalCount).toBe(1)
    expect(model.eventLog.length).toBe(2)
    expect(model.eventLog[1]).toContain('download-file')
  })

  test('buildProcessEventLog caps and formats', () => {
    const now = 1_000_000
    const lines = buildProcessEventLog(
      Array.from({ length: 5 }, (_, i) => ({
        t: now - (5 - i) * 1000,
        worker: 'session' as const,
        step: `s${i}`,
      })),
      now,
      3
    )
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('s2')
  })
})
