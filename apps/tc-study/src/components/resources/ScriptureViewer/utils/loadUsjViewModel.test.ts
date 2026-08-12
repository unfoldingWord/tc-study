import { describe, expect, test } from 'bun:test'
import {
  viewModelFromProcessedScripture,
  usjTokensFromProcessedVerse,
  type ProcessedScripture,
} from '@bt-synergy/scripture-loader'
import { loadUsjViewModel } from './loadUsjViewModel'

function stubProcessed(): ProcessedScripture {
  return {
    book: 'Titus',
    bookCode: 'tit',
    metadata: {
      bookCode: 'tit',
      bookName: 'Titus',
      processingDate: '',
      processingDuration: 0,
      version: '2.0.0-usj',
      hasAlignments: true,
      hasSections: false,
      hasWordTokens: true,
      totalChapters: 1,
      totalVerses: 1,
      totalParagraphs: 0,
      chapterVerseMap: { 1: 1 },
      statistics: {
        totalChapters: 1,
        totalVerses: 1,
        totalParagraphs: 0,
        totalSections: 0,
        totalAlignments: 1,
        totalWordTokens: 1,
      },
    },
    chapters: [
      {
        number: 1,
        verseCount: 1,
        paragraphCount: 0,
        paragraphs: [],
        verses: [
          {
            number: 1,
            text: 'Paul',
            reference: 'tit 1:1',
            wordTokens: [
              {
                uniqueId: 'x',
                content: 'Paul',
                occurrence: 1,
                totalOccurrences: 1,
                verseRef: 'tit 1:1',
                position: { start: 0, end: 4 },
                type: 'word',
                isHighlightable: true,
                alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('loadUsjViewModel', () => {
  test('uses loadViewModel when available', async () => {
    const vm = viewModelFromProcessedScripture(stubProcessed())
    const result = await loadUsjViewModel(
      {
        loadViewModel: async () => vm,
        loadScriptureResult: async () => {
          throw new Error('should not call loadScriptureResult')
        },
      },
      'unfoldingWord/en/ult',
      'tit'
    )
    expect(result.chapters[0]!.verses[0]!.tokens[0]!.semanticId).toBe('tit 1:1:Paul:1')
  })

  test('falls back to loadScriptureResult.viewModel', async () => {
    const vm = viewModelFromProcessedScripture(stubProcessed())
    const result = await loadUsjViewModel(
      {
        loadScriptureResult: async () => ({
          viewModel: vm,
          scripture: stubProcessed(),
          fromUsjCache: true,
        }),
      },
      'unfoldingWord/en/ult',
      'tit'
    )
    expect(result.chapters[0]!.verses[0]!.tokens[0]!.alignedOriginalWordIds).toEqual([
      'tit 1:1:Παῦλος:1',
    ])
  })

  test('throws when no USJ-capable scripture loader', async () => {
    await expect(loadUsjViewModel(null, 'unfoldingWord/en/ult', 'tit')).rejects.toThrow(
      /loadViewModel required/
    )
  })
})

describe('viewModelFromProcessedScripture helpers', () => {
  test('skips non-word tokens', () => {
    const verse = stubProcessed().chapters[0]!.verses[0]!
    verse.wordTokens!.push({
      uniqueId: 'p',
      content: ',',
      occurrence: 1,
      totalOccurrences: 1,
      verseRef: 'tit 1:1',
      position: { start: 4, end: 5 },
      type: 'punctuation',
      isHighlightable: false,
    })
    expect(usjTokensFromProcessedVerse(verse)).toHaveLength(1)
  })
})
