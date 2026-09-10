import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('warm lane wiring', () => {
  test('useWarmLanes loads catalog keys and real lastChapter', () => {
    const src = readFileSync(join(import.meta.dir, 'useWarmLanes.ts'), 'utf8')
    expect(src).toContain('getAllResourceKeys')
    expect(src).toContain('stampsTick')
    expect(src).toContain('stampsRef')
    expect(src).toContain('resolveLastChapter')
    expect(src).toContain('backgroundDownloadSession')
    expect(src).toContain('completedResourceKeys')
    expect(src).toContain('readyOlKeys')
  })

  test('scheduler admits lane 3 from context and covers on completion', () => {
    const src = readFileSync(join(import.meta.dir, 'warmScheduler.ts'), 'utf8')
    expect(src).toContain('scheduleMaybeAdmitLane3')
    expect(src).toContain('canAdmitBackgroundLanes')
    expect(src).toContain('downloadedKeysHash')
    expect(src).toContain('collectLane2Groups')
    expect(src).toContain('collectLane3Groups')
    expect(src).toContain('settleCoverage')
    expect(src).toContain('readWarmCoverage')
    expect(src).toContain('admittedLane3Keys')
    expect(src).toContain('LANE3_JOBS_PER_PASS')
    expect(src).toContain('LANE2_JOBS_PER_PASS')
    expect(src).toContain('admittedLane2Keys')
    expect(src).toContain('olStampForBook')
    expect(src).toContain('articleIdsByKey')
    expect(src).not.toContain('void markRelationCovered(cacheAdapter, qRel')
    expect(src).not.toContain('books.slice(0, 5)')
    expect(src).not.toContain('NT_ORDER')
    expect(src).not.toMatch(/maxCh = book === bookId/)
    expect(src).toContain('pendingLangByKey')
    expect(src).toContain('shouldCancelWarmJobsForLanguage')
    expect(src).toContain('applyCoverageOutcome')
    expect(src).toContain('readyOlKeys')
  })

  test('useWarmLanes stamps both UGNT and UHB for whole-Bible fill', () => {
    const src = readFileSync(join(import.meta.dir, 'useWarmLanes.ts'), 'utf8')
    expect(src).toContain('UGNT_RESOURCE_KEY')
    expect(src).toContain('UHB_RESOURCE_KEY')
    expect(src).toContain('olStampByKey')
    expect(src).toContain('classifyWarmResource')
    expect(src).toContain('articleIdsByKey')
    expect(src).not.toContain('HELPS_CATALOG_IDS')
  })
})
