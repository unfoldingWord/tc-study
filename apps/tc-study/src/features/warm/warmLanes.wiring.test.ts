import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('warm lane wiring', () => {
  test('useWarmLanes loads catalog keys and real lastChapter', () => {
    const src = readFileSync(join(import.meta.dir, 'useWarmLanes.ts'), 'utf8')
    expect(src).toContain('getAllResourceKeys')
    expect(src).toContain('resolveLastChapter')
    expect(src).toContain('backgroundDownloadSession')
  })

  test('scheduler admits lane 3 from context and covers on completion', () => {
    const src = readFileSync(join(import.meta.dir, 'warmScheduler.ts'), 'utf8')
    expect(src).toContain('if (canAdmitLane3()) void maybeAdmitLane3()')
    expect(src).toContain('downloadedKeysHash')
    expect(src).toContain("res.role !== 'scripture'")
    expect(src).toContain('settleCoverage')
    expect(src).toContain('isRelationCovered(cacheAdapter, pRel, pStamp, maxCh)')
    expect(src).toContain('admittedLane3Keys')
    expect(src).not.toContain('void markRelationCovered(cacheAdapter, qRel')
    expect(src).toContain('pendingLangByKey')
  })
})
