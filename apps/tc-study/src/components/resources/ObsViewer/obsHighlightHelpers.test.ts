import { describe, expect, test } from 'bun:test'
import {
  OBS_FRAME_ACTIVE_CLASS,
  isObsEntryActive,
  isObsFrameFilterActive,
  isPanel2KeyQuoteCapable,
  obsFrameChromeClass,
  obsFrameFilterFromHelpsPayload,
  obsFrameSelector,
  obsFrameVerseFilter,
  scrollObsFrameIntoView,
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

  test('card/note for 1:1 activates OBS frame 1:1 and scrolls it into view', () => {
    const fromHighlight = obsFrameFilterFromHelpsPayload({ storyNumber: 1, frameNumber: 1 })
    const fromVerseFilter = obsFrameFilterFromHelpsPayload({ chapter: 1, verse: 1 })
    expect(fromHighlight).toEqual({ chapter: 1, verse: 1 })
    expect(fromVerseFilter).toEqual({ chapter: 1, verse: 1 })
    expect(isObsFrameFilterActive(fromHighlight, 1, 1)).toBe(true)
    expect(isObsFrameFilterActive(fromHighlight, 1, 7)).toBe(false)
    expect(obsFrameChromeClass(fromHighlight, 1, 1)).toBe(OBS_FRAME_ACTIVE_CLASS)
    expect(obsFrameChromeClass(fromHighlight, 1, 7)).not.toContain('bg-highlight')

    const scrolled: string[] = []
    const frameEl = { id: 'frame-1-1' } as unknown as Element
    const root = {
      querySelector(sel: string) {
        return sel === obsFrameSelector(1, 1) ? frameEl : null
      },
    } as unknown as ParentNode
    const ok = scrollObsFrameIntoView(root, fromHighlight, (el) => {
      scrolled.push((el as { id: string }).id)
    })
    expect(ok).toBe(true)
    expect(scrolled).toEqual(['frame-1-1'])
    expect(scrollObsFrameIntoView(root, { chapter: 1, verse: 7 }, () => {
      throw new Error('must not scroll a missing frame')
    })).toBe(false)
  })

  test('verse-filter 1:7 marks only frame 1·7 active', () => {
    const filter = { chapter: 1, verse: 7 }
    expect(isObsFrameFilterActive(filter, 1, 7)).toBe(true)
    expect(isObsFrameFilterActive(filter, 1, 6)).toBe(false)
    expect(isObsFrameFilterActive(filter, 1, 8)).toBe(false)
    expect(isObsFrameFilterActive(filter, 2, 7)).toBe(false)
    expect(isObsFrameFilterActive(null, 1, 7)).toBe(false)
    expect(isObsFrameFilterActive({ chapter: 1 }, 1, 7)).toBe(false)
    expect(obsFrameChromeClass(filter, 1, 7)).toBe(OBS_FRAME_ACTIVE_CLASS)
    expect(obsFrameChromeClass(filter, 1, 6)).not.toContain('bg-highlight')
  })

  test('isPanel2KeyQuoteCapable detects tn/twl/combined', () => {
    expect(isPanel2KeyQuoteCapable(null, undefined, 'combined')).toBe(false)
    expect(isPanel2KeyQuoteCapable('combined', undefined, 'combined')).toBe(true)
    expect(isPanel2KeyQuoteCapable('o/l/obs-tn', 'obs-notes', 'combined')).toBe(true)
    expect(isPanel2KeyQuoteCapable('o/l/obs-twl', undefined, 'combined')).toBe(true)
    expect(isPanel2KeyQuoteCapable('o/l/ult', 'scripture', 'combined')).toBe(false)
  })
})
