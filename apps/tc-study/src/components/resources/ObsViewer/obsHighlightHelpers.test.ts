import { describe, expect, test } from 'bun:test'
import {
  isObsEntryActive,
  isPanel2KeyQuoteCapable,
  obsFrameVerseFilter,
  sortedSourceIdsKey,
} from './obsHighlightHelpers'
import type { ObsFrameQuoteEntry } from '../../../signals/studioSignals'

const entry = (overrides: Partial<ObsFrameQuoteEntry> = {}): ObsFrameQuoteEntry => ({
  sourceId: 'row-1',
  quote: 'God',
  occurrence: 1,
  kind: 'tn',
  ...overrides,
})

describe('obsHighlightHelpers', () => {
  test('sortedSourceIdsKey is order-independent', () => {
    expect(sortedSourceIdsKey(['b', 'a'])).toBe(sortedSourceIdsKey(['a', 'b']))
  })

  test('isObsEntryActive matches quote/occurrence/row', () => {
    const e = entry()
    expect(
      isObsEntryActive({ quote: 'God', occurrence: 1, rowId: 'row-1', frameNumber: 2 }, e, 2)
    ).toBe(true)
    expect(
      isObsEntryActive({ quote: 'God', occurrence: 1, rowId: 'row-1', frameNumber: 3 }, e, 2)
    ).toBe(false)
  })

  test('isObsEntryActive uses overlappingSourceIds when present', () => {
    const e = entry({ sourceId: 'tn-2' })
    expect(
      isObsEntryActive({ overlappingSourceIds: ['tn-2', 'twl-1'], frameNumber: 1 }, e, 1)
    ).toBe(true)
    expect(
      isObsEntryActive({ overlappingSourceIds: ['twl-1'], frameNumber: 1 }, e, 1)
    ).toBe(false)
  })

  test('frame click maps story/frame onto the verse-filter path', () => {
    expect(obsFrameVerseFilter(1, 3)).toEqual({ chapter: 1, verse: 3 })
    expect(obsFrameVerseFilter(12, 1)).toEqual({ chapter: 12, verse: 1 })
  })

  test('isPanel2KeyQuoteCapable detects tn/twl/combined', () => {
    expect(isPanel2KeyQuoteCapable(null, undefined, 'combined')).toBe(false)
    expect(isPanel2KeyQuoteCapable('combined', undefined, 'combined')).toBe(true)
    expect(isPanel2KeyQuoteCapable('o/l/obs-tn', 'obs-notes', 'combined')).toBe(true)
    expect(isPanel2KeyQuoteCapable('o/l/obs-twl', undefined, 'combined')).toBe(true)
    expect(isPanel2KeyQuoteCapable('o/l/ult', 'scripture', 'combined')).toBe(false)
  })
})
