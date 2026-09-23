import { describe, expect, test } from 'bun:test'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import {
  chaptersMissingFromViewModel,
  mergeUsjScriptureViewModels,
  splitUsjContentByChapter,
} from './mergeUsjScriptureViewModels'

function chapterVm(
  chapter: number,
  word: string
): UsjScriptureViewModel {
  return {
    bookCode: 'eph',
    bookName: 'Ephesians',
    usj: {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: String(chapter), sid: `EPH ${chapter}` },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: `EPH ${chapter}:1` },
            { type: 'char', marker: 'w', content: [word] },
          ],
        },
      ],
    },
    alignmentMap: {},
    chapters: [
      {
        number: chapter,
        verses: [
          {
            number: 1,
            reference: `eph ${chapter}:1`,
            text: word,
            tokens: [
              {
                content: word,
                occurrence: 1,
                totalOccurrences: 1,
                verseRef: `eph ${chapter}:1`,
                semanticId: `eph ${chapter}:1:${word}:1`,
                foldedSemanticId: `eph ${chapter}:1:${word.toLowerCase()}:1`,
              },
            ],
          },
        ],
      },
    ],
  } as unknown as UsjScriptureViewModel
}

describe('mergeUsjScriptureViewModels', () => {
  test('reports chapters missing from a focused slice', () => {
    const focused = chapterVm(3, 'Paul')
    expect(chaptersMissingFromViewModel(focused, [3, 4, 5])).toEqual([4, 5])
    expect(chaptersMissingFromViewModel(focused, [3])).toEqual([])
  })

  test('splits USJ content on chapter markers', () => {
    const merged = mergeUsjScriptureViewModels(chapterVm(3, 'Paul'), [
      chapterVm(5, 'walk'),
      chapterVm(4, 'unity'),
    ])
    const split = splitUsjContentByChapter(merged.usj.content ?? [])
    expect([...split.byChapter.keys()]).toEqual([3, 4, 5])
    expect(merged.chapters.map((c) => c.number)).toEqual([3, 4, 5])
    expect(merged.chapters.map((c) => c.verses[0]?.text)).toEqual([
      'Paul',
      'unity',
      'walk',
    ])
  })

  test('rebuilds content in chapter order so later chapters stay reachable', () => {
    const merged = mergeUsjScriptureViewModels(chapterVm(3, 'Paul'), [
      chapterVm(5, 'walk'),
      chapterVm(4, 'unity'),
    ])
    const markers = (merged.usj.content ?? [])
      .filter(
        (node) =>
          node &&
          typeof node === 'object' &&
          (node as { type?: string }).type === 'chapter'
      )
      .map((node) => Number((node as { number: string }).number))
    expect(markers).toEqual([3, 4, 5])
  })

  test('is a no-op when extras are empty or already present', () => {
    const focused = chapterVm(3, 'Paul')
    expect(mergeUsjScriptureViewModels(focused, [])).toBe(focused)
    const again = mergeUsjScriptureViewModels(focused, [chapterVm(3, 'dup')])
    expect(again.chapters.map((c) => c.number)).toEqual([3])
    expect(again.chapters[0]?.verses[0]?.text).toBe('Paul')
  })
})
