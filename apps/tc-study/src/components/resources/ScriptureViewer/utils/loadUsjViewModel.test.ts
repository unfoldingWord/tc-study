import { describe, expect, test } from 'bun:test'
import {
  viewModelFromProcessedScripture,
  usjTokensFromProcessedVerse,
  type ProcessedScripture,
} from '@bt-synergy/scripture-loader'
import { loadUsjScripture } from './loadUsjViewModel'

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

describe('loadUsjScripture', () => {
  test('uses loadScriptureResult when available', async () => {
    const vm = viewModelFromProcessedScripture(stubProcessed())
    const scripture = stubProcessed()
    const result = await loadUsjScripture(
      {
        loadScriptureResult: async () => ({
          viewModel: vm,
          scripture,
          fromUsjCache: true,
        }),
        loadContent: async () => {
          throw new Error('should not call loadContent')
        },
      },
      { loadContent: async () => { throw new Error('no catalog') } },
      'unfoldingWord/en/ult',
      'tit'
    )
    expect(result.fromUsjCache).toBe(true)
    expect(result.viewModel.chapters[0]!.verses[0]!.tokens[0]!.semanticId).toBe(
      'tit 1:1:Paul:1'
    )
  })

  test('falls back to loadContent + viewModelFromProcessedScripture', async () => {
    const scripture = stubProcessed()
    const result = await loadUsjScripture(
      null,
      { loadContent: async () => scripture },
      'unfoldingWord/en/ult',
      'tit'
    )
    expect(result.fromUsjCache).toBe(false)
    expect(result.viewModel.chapters[0]!.verses[0]!.tokens[0]!.alignedOriginalWordIds).toEqual([
      'tit 1:1:Παῦλος:1',
    ])
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
