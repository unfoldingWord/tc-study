import { describe, expect, test } from 'bun:test'
import { resolveObsHighlightSpans } from './resolveObsHighlightSpans'
import { obsFrameHighlightFromHelpsRow } from '../../components/resources/CombinedHelpsViewer/combinedHelpsUtils'
import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'

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

  test('OBS CombinedHelps TN card click underlines the matching quote on the OBS frame', () => {
    const frameText =
      'Then Abraham sent one of his servants back to the land where his relatives lived to find a wife for his son, Isaac.'
    const highlight = obsFrameHighlightFromHelpsRow({
      id: 'obs-tn-6-1',
      reference: '6:1',
      quote: 'sent one of his servants back',
      occurrence: '1',
      kind: 'tn',
    })
    expect(highlight).toEqual({
      storyNumber: 6,
      frameNumber: 1,
      quote: 'sent one of his servants back',
      occurrence: 1,
      rowId: 'obs-tn-6-1',
      kind: 'tn',
    })
    const entries: ObsFrameQuoteEntry[] = [
      {
        sourceId: highlight!.rowId,
        kind: highlight!.kind,
        quote: highlight!.quote,
        occurrence: highlight!.occurrence,
      },
    ]
    const { spans, useWordMode } = resolveObsHighlightSpans(frameText, entries)
    expect(useWordMode).toBe(true)
    expect(spans.some((s) => s.quoteIndex === 0 && s.text.includes('sent one of his servants'))).toBe(
      true
    )
  })
})
