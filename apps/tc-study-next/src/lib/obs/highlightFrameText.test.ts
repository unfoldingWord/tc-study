import { describe, expect, test } from 'bun:test'
import { computeFrameSpans } from './highlightFrameText'

describe('computeFrameSpans', () => {
  test('single match', () => {
    const text = 'In the beginning God created.'
    const spans = computeFrameSpans(text, [{ quote: 'the beginning', occurrence: 1 }])
    expect(spans).toEqual([
      { text: 'In ' },
      { text: 'the beginning', quoteIndex: 0 },
      { text: ' God created.' },
    ])
  })

  test('Nth occurrence', () => {
    const text = 'God said God rested.'
    const spans = computeFrameSpans(text, [{ quote: 'God', occurrence: 2 }])
    let pos = 0
    let found = false
    for (const s of spans) {
      if (s.quoteIndex === 0) {
        expect(pos).toBe(9)
        expect(s.text).toBe('God')
        found = true
      }
      pos += s.text.length
    }
    expect(found).toBe(true)
  })

  test('case insensitive', () => {
    const text = 'Hello World'
    const spans = computeFrameSpans(text, [{ quote: 'hello', occurrence: 1 }])
    expect(spans.some((s) => s.quoteIndex === 0 && s.text === 'Hello')).toBe(true)
  })

  test('accent insensitive match preserves display', () => {
    const text = 'Cité administrative'
    const spans = computeFrameSpans(text, [{ quote: 'cite', occurrence: 1 }])
    expect(spans.some((s) => s.quoteIndex === 0 && s.text === 'Cit\u00e9')).toBe(true)
  })

  test('no match yields plain span', () => {
    expect(computeFrameSpans('abc', [{ quote: 'zzz', occurrence: 1 }])).toEqual([{ text: 'abc' }])
  })

  test('overlap: shorter quote wins, outer quote split into fragments', () => {
    const text = 'foo bar baz'
    const spans = computeFrameSpans(text, [
      { quote: 'foo bar', occurrence: 1 }, // qi=0
      { quote: 'bar', occurrence: 1 },      // qi=1, shorter → wins in overlap region
    ])
    // "foo " should be attributed to qi=0, "bar" to qi=1
    const fooSpan = spans.find((s) => s.text === 'foo ' && s.quoteIndex === 0)
    const barSpan = spans.find((s) => s.text === 'bar' && s.quoteIndex === 1)
    expect(fooSpan).toBeDefined()
    expect(barSpan).toBeDefined()
    // "bar" span should carry qi=0 as a parentQuoteIndex so it appears active
    // when the outer "foo bar" quote is selected
    expect(barSpan!.parentQuoteIndices).toContain(0)
  })

  test('overlap: equal-length, lower quoteIndex wins', () => {
    const text = 'abc'
    const spans = computeFrameSpans(text, [
      { quote: 'abc', occurrence: 1 }, // qi=0
      { quote: 'abc', occurrence: 1 }, // qi=1
    ])
    const quoted = spans.filter((s) => s.quoteIndex !== undefined)
    expect(quoted).toHaveLength(1)
    expect(quoted[0]!.quoteIndex).toBe(0)
  })

  test('occurrence -1 highlights all non-overlapping', () => {
    const text = 'a X b X c'
    const spans = computeFrameSpans(text, [{ quote: 'X', occurrence: -1 }])
    expect(spans.filter((s) => s.quoteIndex === 0)).toHaveLength(2)
  })
})
