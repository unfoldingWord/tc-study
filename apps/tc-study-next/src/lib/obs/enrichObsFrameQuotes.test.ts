import { describe, expect, test } from 'bun:test'
import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'
import { enrichObsFrameQuoteEntries } from './enrichObsFrameQuotes'

function makeEntry(quote: string, occurrence: number, sourceId = 's1'): ObsFrameQuoteEntry {
  return { sourceId, kind: 'tn', quote, occurrence }
}

describe('enrichObsFrameQuoteEntries', () => {
  test('single-part, occurrence 1 → sets startWord/endWord', () => {
    const text = 'God created the world.'
    const entries = [makeEntry('created', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.startWord).toBe(1)
    expect(result[0]!.endWord).toBe(1)
    expect(result[0]!.wordRanges).toEqual([{ startWord: 1, endWord: 1 }])
  })

  test('single-part, multi-word quote → correct word range', () => {
    const text = 'In the beginning God created the heavens.'
    const entries = [makeEntry('the beginning', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.wordRanges).toEqual([{ startWord: 1, endWord: 2 }])
  })

  test('honors occurrence — Nth match', () => {
    const text = 'God said God rested.'
    const entries = [makeEntry('God', 2)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    // Second "God" is word index 2
    expect(result[0]!.startWord).toBe(2)
    expect(result[0]!.endWord).toBe(2)
  })

  test('occurrence out of range → entry unchanged (no wordRanges)', () => {
    const text = 'God created.'
    const entries = [makeEntry('God', 5)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.wordRanges).toBeUndefined()
    expect(result[0]!.startWord).toBeUndefined()
  })

  test('occurrence -1 → all matches', () => {
    const text = 'God said God rested and God slept.'
    const entries = [makeEntry('God', -1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.wordRanges).toHaveLength(3)
  })

  test('multi-part & quote → one range per part', () => {
    const text = 'The Lord God spoke and the earth trembled.'
    const entries = [makeEntry('Lord & earth', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.wordRanges).toHaveLength(2)
    expect(result[0]!.wordRanges![0]!.startWord).toBe(1) // "Lord"
    expect(result[0]!.wordRanges![1]!.startWord).toBe(6) // "earth"
  })

  test('multi-part … quote → one range per part', () => {
    const text = 'He went home and ate dinner.'
    const entries = [makeEntry('went … dinner', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.wordRanges).toHaveLength(2)
  })

  test('startWord/endWord mirror wordRanges[0]', () => {
    const text = 'God said God rested.'
    const entries = [makeEntry('God & rested', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    const wr = result[0]!.wordRanges!
    expect(result[0]!.startWord).toBe(wr[0]!.startWord)
    expect(result[0]!.endWord).toBe(wr[0]!.endWord)
  })

  test('part not in frame text → entry unchanged', () => {
    const text = 'God created the world.'
    const entries = [makeEntry('God & Zzzz', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.wordRanges).toBeUndefined()
  })

  test('case-insensitive matching', () => {
    const text = 'God Created the world.'
    const entries = [makeEntry('created', 1)]
    const result = enrichObsFrameQuoteEntries(text, entries)
    expect(result[0]!.startWord).toBe(1)
  })

  test('empty entries → returns same array', () => {
    const result = enrichObsFrameQuoteEntries('some text', [])
    expect(result).toEqual([])
  })

  test('empty frameText → entries unchanged', () => {
    const entries = [makeEntry('word', 1)]
    const result = enrichObsFrameQuoteEntries('', entries)
    expect(result[0]!.wordRanges).toBeUndefined()
  })
})
