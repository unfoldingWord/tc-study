import { describe, expect, test } from 'bun:test'
import { RESOURCE_STATE_KEYS } from './keys'
import { mergeObsFrameQuotesStates } from './mergeObsFrameQuotes'
import type { ObsFrameQuotesStateSignal } from './types'

function tnState(
  partial: Partial<ObsFrameQuotesStateSignal> &
    Pick<ObsFrameQuotesStateSignal, 'storyNumber' | 'frameNumber' | 'quotes'>
): ObsFrameQuotesStateSignal {
  return {
    type: 'obs-frame-quotes',
    lifecycle: 'state',
    stateKey: RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TN,
    sourceResourceId: 'tn-1',
    timestamp: 1,
    ...partial,
  }
}

function twlState(
  partial: Partial<ObsFrameQuotesStateSignal> &
    Pick<ObsFrameQuotesStateSignal, 'storyNumber' | 'frameNumber' | 'quotes'>
): ObsFrameQuotesStateSignal {
  return {
    type: 'obs-frame-quotes',
    lifecycle: 'state',
    stateKey: RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TWL,
    sourceResourceId: 'twl-1',
    timestamp: 2,
    ...partial,
  }
}

describe('mergeObsFrameQuotesStates', () => {
  test('returns null when both publishers empty', () => {
    expect(mergeObsFrameQuotesStates(null, null)).toBeNull()
  })

  test('merges TN and TWL quotes without LWW loss', () => {
    const tn = tnState({
      storyNumber: 1,
      frameNumber: 2,
      quotes: [{ sourceId: 'n1', kind: 'tn', quote: 'God', occurrence: 1 }],
      frameQuoteMap: {
        2: [{ sourceId: 'n1', kind: 'tn', quote: 'God', occurrence: 1 }],
      },
    })
    const twl = twlState({
      storyNumber: 1,
      frameNumber: 2,
      quotes: [{ sourceId: 'l1', kind: 'twl', quote: 'created', occurrence: 1 }],
      frameQuoteMap: {
        2: [{ sourceId: 'l1', kind: 'twl', quote: 'created', occurrence: 1 }],
        3: [{ sourceId: 'l2', kind: 'twl', quote: 'earth', occurrence: 1 }],
      },
    })

    const merged = mergeObsFrameQuotesStates(tn, twl)!
    expect(merged.quotes).toHaveLength(2)
    expect(merged.quotes.map((q) => q.sourceId).sort()).toEqual(['l1', 'n1'])
    expect(merged.frameQuoteMap[2]).toHaveLength(2)
    expect(merged.frameQuoteMap[3]).toHaveLength(1)
    expect(merged.hasQuotes).toBe(true)
  })

  test('single publisher still merges', () => {
    const twl = twlState({
      storyNumber: 5,
      frameNumber: 1,
      quotes: [{ sourceId: 'l1', kind: 'twl', quote: 'word', occurrence: 1 }],
    })
    const merged = mergeObsFrameQuotesStates(null, twl)!
    expect(merged.storyNumber).toBe(5)
    expect(merged.quotes).toHaveLength(1)
  })
})
