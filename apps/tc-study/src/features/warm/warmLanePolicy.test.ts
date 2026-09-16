import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LANE3_ADMIT_COOLDOWN_MS,
  LANE3_MAX_PENDING,
  canAdmitBackgroundLanes,
  helpsLane1Ready,
  scriptureLane1Ready,
  warmLaneBlockedReason,
} from './warmLanePolicy'

describe('warmLanePolicy', () => {
  test('warmLaneBlockedReason names the gate', () => {
    expect(warmLaneBlockedReason({ lane1Drained: false, lane: 2 })).toBe('lane1-busy')
    expect(
      warmLaneBlockedReason({ lane1Drained: true, scrollUnsettled: true, lane: 2 })
    ).toBe('scroll-unsettled')
    expect(
      warmLaneBlockedReason({
        lane1Drained: true,
        pendingJobKeys: LANE3_MAX_PENDING,
        lane: 3,
      })
    ).toBe(`pending>=${LANE3_MAX_PENDING}`)
    expect(warmLaneBlockedReason({ lane1Drained: true, lane: 2 })).toBeNull()
  })

  test('lane 2/3 are not admitted while lane1Drained is false', () => {
    expect(
      canAdmitBackgroundLanes({ lane1Drained: false, scrollUnsettled: false, lane: 2 })
    ).toBe(false)
    expect(
      canAdmitBackgroundLanes({ lane1Drained: false, scrollUnsettled: false, lane: 3 })
    ).toBe(false)
    expect(
      canAdmitBackgroundLanes({ lane1Drained: true, scrollUnsettled: false, lane: 2 })
    ).toBe(true)
  })

  test('scroll unsettled and hidden tab block background lanes', () => {
    expect(
      canAdmitBackgroundLanes({
        lane1Drained: true,
        scrollUnsettled: true,
        lane: 2,
      })
    ).toBe(false)
    expect(
      canAdmitBackgroundLanes({
        lane1Drained: true,
        documentVisible: false,
        lane: 3,
      })
    ).toBe(false)
  })

  test('lane 3 waits for pending depth and cooldown', () => {
    expect(
      canAdmitBackgroundLanes({
        lane1Drained: true,
        pendingJobKeys: LANE3_MAX_PENDING,
        lane: 3,
      })
    ).toBe(false)
    expect(
      canAdmitBackgroundLanes({
        lane1Drained: true,
        pendingJobKeys: LANE3_MAX_PENDING - 1,
        lastAdmitAt: 1000,
        now: 1000 + LANE3_ADMIT_COOLDOWN_MS - 1,
        lane: 3,
      })
    ).toBe(false)
    expect(
      canAdmitBackgroundLanes({
        lane1Drained: true,
        pendingJobKeys: 0,
        lastAdmitAt: 1000,
        now: 1000 + LANE3_ADMIT_COOLDOWN_MS,
        lane: 3,
      })
    ).toBe(true)
  })

  test('helpsLane1Ready stays false until quotes or cache-hit', () => {
    expect(
      helpsLane1Ready({ contentPending: true, quoteReady: false, cacheHit: false })
    ).toBe(false)
    expect(
      helpsLane1Ready({ contentPending: false, quoteReady: false, cacheHit: false })
    ).toBe(false)
    expect(
      helpsLane1Ready({ contentPending: false, quoteReady: true, cacheHit: false })
    ).toBe(true)
    expect(
      helpsLane1Ready({ contentPending: false, quoteReady: false, cacheHit: true })
    ).toBe(true)
    expect(
      helpsLane1Ready({ contentPending: true, quoteReady: true, cacheHit: true })
    ).toBe(false)
  })

  test('helpsLane1Ready is true when notes exist but quotes are blocked on missing OL', () => {
    expect(
      helpsLane1Ready({
        contentPending: false,
        quoteReady: false,
        cacheHit: false,
        quotesBlocked: true,
      })
    ).toBe(true)
    expect(
      helpsLane1Ready({
        contentPending: true,
        quoteReady: false,
        cacheHit: false,
        quotesBlocked: true,
      })
    ).toBe(false)
  })

  test('helpsLane1Ready drains on book-filter first paint without chapter quote settle', () => {
    expect(
      helpsLane1Ready({
        contentPending: false,
        quoteReady: false,
        cacheHit: false,
        bookFilterRowsReady: true,
      })
    ).toBe(true)
    expect(
      helpsLane1Ready({
        contentPending: true,
        quoteReady: false,
        cacheHit: false,
        bookFilterRowsReady: true,
      })
    ).toBe(false)
  })

  test('scriptureLane1Ready waits for viewModel + open chapter, not nav-only', () => {
    expect(
      scriptureLane1Ready({
        isLoading: false,
        hasViewModel: false,
        openChapterReady: false,
      })
    ).toBe(false)
    expect(
      scriptureLane1Ready({
        isLoading: false,
        hasViewModel: true,
        openChapterReady: false,
      })
    ).toBe(false)
    expect(
      scriptureLane1Ready({
        isLoading: true,
        hasViewModel: true,
        openChapterReady: true,
      })
    ).toBe(false)
    expect(
      scriptureLane1Ready({
        isLoading: false,
        hasViewModel: true,
        openChapterReady: true,
      })
    ).toBe(true)
  })

  test('scheduler and viewers wire the policy', () => {
    const scheduler = readFileSync(join(import.meta.dir, 'warmScheduler.ts'), 'utf8')
    const helps = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    const content = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/hooks/useContent.ts'
      ),
      'utf8'
    )
    expect(scheduler).toContain('canAdmitBackgroundLanes')
    expect(scheduler).toContain('LANE3_MAX_PENDING')
    expect(scheduler).toContain('LANE2_JOBS_PER_PASS')
    expect(scheduler).toContain('LANE3_ADMIT_COOLDOWN_MS')
    expect(helps).toContain('helpsLane1Ready')
    expect(helps).not.toMatch(/lane1Ready:\s*true/)
    expect(content).toContain('scriptureLane1Ready')
  })
})
