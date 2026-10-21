import { describe, expect, test } from 'bun:test'
import {
  applyCoverageOutcome,
  countsTowardWarmCoverage,
  createCoverageSettleState,
} from './warmCoverageSettle'

describe('warmCoverageSettle', () => {
  test('only finished and cached count toward coverage', () => {
    expect(countsTowardWarmCoverage('finished')).toBe(true)
    expect(countsTowardWarmCoverage('cached')).toBe(true)
    expect(countsTowardWarmCoverage('blocked')).toBe(false)
    expect(countsTowardWarmCoverage('noop')).toBe(false)
  })

  test('marks the relation when every job finished or cached', () => {
    const state = createCoverageSettleState('s1')
    state.remaining.add('q:1')
    state.remaining.add('q:2')
    expect(applyCoverageOutcome(state, 'q:1', 'finished').shouldMark).toBe(false)
    const done = applyCoverageOutcome(state, 'q:2', 'cached')
    expect(done.shouldMark).toBe(true)
    expect(done.succeeded).toBe(2)
  })

  test('does not mark on blocked (OL USFM missing)', () => {
    const state = createCoverageSettleState('s1')
    state.remaining.add('q:1')
    state.remaining.add('q:2')
    applyCoverageOutcome(state, 'q:1', 'finished')
    const done = applyCoverageOutcome(state, 'q:2', 'blocked')
    expect(done.shouldMark).toBe(false)
    expect(done.succeeded).toBe(1)
  })

  test('does not mark on missing-OL noop', () => {
    const state = createCoverageSettleState('s1')
    state.remaining.add('q:1')
    const done = applyCoverageOutcome(state, 'q:1', 'noop')
    expect(done.shouldMark).toBe(false)
    expect(done.succeeded).toBe(0)
  })

  test('mixed cached + blocked must not mark so a later UHB download can retry', () => {
    const state = createCoverageSettleState('s1')
    for (const key of ['q:1', 'q:2', 'q:3']) state.remaining.add(key)
    applyCoverageOutcome(state, 'q:1', 'cached')
    applyCoverageOutcome(state, 'q:2', 'blocked')
    const done = applyCoverageOutcome(state, 'q:3', 'blocked')
    expect(done.shouldMark).toBe(false)
  })
})
