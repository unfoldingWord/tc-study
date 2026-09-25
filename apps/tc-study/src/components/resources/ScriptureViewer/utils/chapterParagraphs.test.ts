import { describe, expect, test } from 'bun:test'
import { extractBookParagraphs, extractChapterParagraphs } from './chapterParagraphs'

function sampleUsj() {
  return {
    type: 'USJ',
    version: '3.1',
    content: [
      { type: 'book', marker: 'id', content: 'PSA' },
      { type: 'chapter', marker: 'c', number: '1', sid: 'PSA 1' },
      {
        type: 'para',
        marker: 's1',
        content: ['A heading that is not a paragraph'],
      },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '1', sid: 'PSA 1:1' },
          { type: 'char', marker: 'w', content: ['Blessed'], strong: 'H0835' },
          ' ',
          { type: 'char', marker: 'w', content: ['is'] },
          { type: 'note', marker: 'f', caller: '+', content: ['footnote body'] },
          { type: 'note', marker: 'x', caller: '-', content: ['xref body'] },
        ],
      },
      {
        type: 'para',
        marker: 'q1',
        content: [
          { type: 'verse', marker: 'v', number: '2', sid: 'PSA 1:2' },
          { type: 'char', marker: 'w', content: ['who'] },
          ' ',
          { type: 'char', marker: 'w', content: ['walks'] },
        ],
      },
      { type: 'chapter', marker: 'c', number: '2', sid: 'PSA 2' },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '1', sid: 'PSA 2:1' },
          { type: 'char', marker: 'w', content: ['Why'] },
        ],
      },
    ],
  }
}

describe('extractBookParagraphs', () => {
  test('splits on paragraph and poetry markers and keeps verse numbers', () => {
    const byChapter = extractBookParagraphs(sampleUsj())
    expect(byChapter.get(1)).toEqual(['1 Blessed is', '2 who walks'])
    expect(byChapter.get(2)).toEqual(['1 Why'])
    // Verse markers stay; chapter numbers are not injected as bare digits elsewhere.
    expect(extractChapterParagraphs(sampleUsj(), 1).join(' ')).toMatch(/\b1\b/)
  })

  test('does not include footnote or xref bodies or w attributes', () => {
    const paragraphs = extractChapterParagraphs(sampleUsj(), 1)
    expect(paragraphs.join(' ')).not.toContain('footnote')
    expect(paragraphs.join(' ')).not.toContain('xref')
    expect(paragraphs.join(' ')).not.toContain('H0835')
    expect(paragraphs[0]).toBe('1 Blessed is')
  })

  test('does not treat headings as paragraphs', () => {
    const paragraphs = extractChapterParagraphs(sampleUsj(), 1)
    expect(paragraphs.join(' ')).not.toContain('heading')
  })

  test('inserts spaces between adjacent w markers with no whitespace node', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            { type: 'char', marker: 'w', content: ['Jonás'] },
            { type: 'char', marker: 'w', content: ['había'] },
            { type: 'char', marker: 'w', content: ['bajado'] },
          ],
        },
      ],
    }
    expect(extractChapterParagraphs(usj, 1)).toEqual(['1 Jonás había bajado'])
  })
})
