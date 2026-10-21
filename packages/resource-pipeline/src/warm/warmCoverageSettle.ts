/**
 * Pure coverage-cursor rules for warm quote/align/prepare batches.
 * Only finished work and true empty/already-present cached outcomes advance
 * the relation. blocked (OL USFM missing) and noop must not mark covered
 * so a later UHB/UGNT download can retry.
 */

import type { WarmJobOutcome } from './warmTypes'

export function countsTowardWarmCoverage(outcome: WarmJobOutcome): boolean {
  return outcome === 'finished' || outcome === 'cached'
}

export type CoverageSettleState = {
  stamp: string
  succeeded: number
  incomplete: number
  remaining: Set<string>
}

export function createCoverageSettleState(stamp: string): CoverageSettleState {
  return { stamp, succeeded: 0, incomplete: 0, remaining: new Set() }
}

export function applyCoverageOutcome(
  state: CoverageSettleState,
  jobKey: string,
  outcome: WarmJobOutcome
): { shouldMark: boolean; succeeded: number } {
  state.remaining.delete(jobKey)
  if (countsTowardWarmCoverage(outcome)) {
    state.succeeded += 1
  } else {
    state.incomplete += 1
  }
  if (state.remaining.size > 0) {
    return { shouldMark: false, succeeded: state.succeeded }
  }
  return {
    shouldMark: state.incomplete === 0 && state.succeeded >= 1,
    succeeded: state.succeeded,
  }
}
