import { describe, expect, test } from 'bun:test'
import type { ProcessedWordsLinks } from '@bt-synergy/resource-parsers'
import {
  articlePathFromTwLink,
  buildWordsLinksFull,
  buildWordsLinksLight,
  twlCacheKey,
  wordsLinksPreparer,
} from './wordsLinksPreparer'
import { getRegisteredPreparerIds } from '../prepare/prepareRegistry'
import { ensurePreparersRegistered } from '../prepare/registerPreparers'

const sampleLinks: ProcessedWordsLinks = {
  bookCode: 'tit',
  bookName: 'Titus',
  links: [
    {
      reference: '1:1',
      id: 'link1',
      tags: 'kt',
      origWords: 'Παῦλος',
      occurrence: '1',
      twLink: 'rc://*/tw/dict/bible/names/paul',
    },
    {
      reference: '2:1',
      id: 'link2',
      tags: 'other',
      origWords: '',
      occurrence: '1',
      twLink: 'rc://*/tw/dict/bible/other/teach',
    },
  ],
  linksByChapter: {
    '1': [
      {
        reference: '1:1',
        id: 'link1',
        tags: 'kt',
        origWords: 'Παῦλος',
        occurrence: '1',
        twLink: 'rc://*/tw/dict/bible/names/paul',
      },
    ],
    '2': [
      {
        reference: '2:1',
        id: 'link2',
        tags: 'other',
        origWords: '',
        occurrence: '1',
        twLink: 'rc://*/tw/dict/bible/other/teach',
      },
    ],
  },
  metadata: {
    bookCode: 'tit',
    bookName: 'Titus',
    processingDate: new Date().toISOString(),
    totalLinks: 2,
    chaptersWithLinks: [1, 2],
    statistics: {
      totalLinks: 2,
      linksPerChapter: { '1': 1, '2': 1 },
      linksByCategory: { kt: 1, other: 1 },
    },
  },
}

describe('wordsLinksPreparer', () => {
  test('twlCacheKey matches TranslationWordsLinksLoader format', () => {
    expect(twlCacheKey('unfoldingWord/en/twl', 'tit')).toBe(
      'twl:unfoldingWord/en/twl:tit'
    )
  })

  test('articlePathFromTwLink extracts dict path', () => {
    expect(articlePathFromTwLink('rc://*/tw/dict/bible/names/paul')).toBe(
      'bible/names/paul'
    )
    expect(articlePathFromTwLink('')).toBe('')
    expect(articlePathFromTwLink(null)).toBe('')
  })

  test('unitsFor uses linksByChapter keys', () => {
    const source = {
      resourceKey: 'unfoldingWord/en/twl',
      bookId: 'tit',
      links: sampleLinks,
    }
    expect(wordsLinksPreparer.unitsFor(source)).toEqual([1, 2])
  })

  test('prepareLight resolves articlePath', () => {
    const source = {
      resourceKey: 'unfoldingWord/en/twl',
      bookId: 'tit',
      links: sampleLinks,
    }
    const light = buildWordsLinksLight(source, 1)
    expect(light.links).toHaveLength(1)
    expect(light.links[0]!.articlePath).toBe('bible/names/paul')
    expect(light.links[0]!.origWords).toBe('Παῦλος')
  })

  test('prepareFull includes folded quote + articlePath', () => {
    const source = {
      resourceKey: 'unfoldingWord/en/twl',
      bookId: 'tit',
      links: sampleLinks,
    }
    const full = buildWordsLinksFull(source, 1)
    expect(full.version).toBe(1)
    expect(full.links).toHaveLength(1)
    expect(full.links[0]!.quoteFolded).toBeTruthy()
    expect(full.links[0]!.articlePath).toBe('bible/names/paul')
    expect(full.links[0]!.tags).toBe('kt')
  })

  test('readSource loads twl: cache', async () => {
    const store = new Map<string, unknown>()
    store.set('twl:unfoldingWord/en/twl:tit', sampleLinks)
    const source = await wordsLinksPreparer.readSource(
      {
        cacheAdapter: {
          get: async (k) => store.get(k),
          set: async (k, v) => {
            store.set(k, v)
          },
        },
      },
      'unfoldingWord/en/twl',
      'tit'
    )
    expect(source?.links.links).toHaveLength(2)
  })

  test('ensurePreparersRegistered includes words-links', () => {
    const ids = ensurePreparersRegistered()
    expect(ids).toContain('words-links')
    expect(ids).toContain('notes')
    expect(ids).toContain('scripture')
    expect(getRegisteredPreparerIds()).toContain('words-links')
  })
})
