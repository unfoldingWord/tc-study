import { describe, expect, test } from 'bun:test'
import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'
import { resolveObsHighlightSpans } from './resolveObsHighlightSpans'

function makeEntry(quote: string, occurrence = 1, sourceId = 's1'): ObsFrameQuoteEntry {
  return { sourceId, kind: 'tn', quote, occurrence }
}

describe('resolveObsHighlightSpans', () => {
  test('same-language English quote still underlines', () => {
    const { spans, useWordMode } = resolveObsHighlightSpans(
      'God created the world.',
      [makeEntry('created', 1)]
    )
    expect(useWordMode).toBe(true)
    expect(spans.some((s) => s.text === 'created' && s.quoteIndex === 0)).toBe(true)
  })

  test('English tN vs minority OBS: no substring false positive', () => {
    const bho = 'परमेश्वर ने आकाश और पृथ्वी की सृष्टि की।'
    const { spans, useWordMode, enriched } = resolveObsHighlightSpans(bho, [
      makeEntry('God created', 1),
      makeEntry('the earth', 1),
    ])
    expect(useWordMode).toBe(false)
    expect(enriched.every((e) => e.wordRanges == null)).toBe(true)
    expect(spans).toEqual([{ text: bho }])
    expect(spans.every((s) => s.quoteIndex === undefined)).toBe(true)
  })

  test('partial match: only word-matched quotes highlight; unmatched stay plain', () => {
    const text = 'God created the world and rested.'
    const { spans, useWordMode } = resolveObsHighlightSpans(text, [
      makeEntry('created', 1),
      makeEntry('zzzz-not-in-frame', 1),
    ])
    expect(useWordMode).toBe(true)
    expect(spans.some((s) => s.text === 'created' && s.quoteIndex === 0)).toBe(true)
    expect(spans.some((s) => s.quoteIndex === 1)).toBe(false)
  })
})
