import { describe, expect, test } from 'bun:test'
import {
  ingredientsFingerprint,
  ingredientsFromLoadedResource,
  loadedTocEqual,
  tocBooksEqual,
} from './useTOC'

describe('useTOC helpers (no update loop)', () => {
  test('ingredientsFromLoadedResource falls back instance → key → base', () => {
    const loaded = {
      'u/en/ult': {
        ingredients: [{ identifier: 'tit', title: 'Titus' }],
      },
    }
    expect(ingredientsFromLoadedResource(loaded, 'u/en/ult#2', 'u/en/ult')).toEqual([
      { identifier: 'tit', title: 'Titus' },
    ])
    expect(ingredientsFromLoadedResource({}, 'u/en/ult#2', 'u/en/ult')).toEqual([])
  })

  test('ingredientsFingerprint is stable for the same identifiers', () => {
    const a = {
      'u/en/ult#2': { ingredients: [{ identifier: 'tit' }, { identifier: 'mrk' }] },
    }
    const b = {
      'u/en/ult': { ingredients: [{ identifier: 'tit' }, { identifier: 'mrk' }] },
    }
    expect(ingredientsFingerprint(a, 'u/en/ult#2', 'u/en/ult')).toBe(
      ingredientsFingerprint(b, 'u/en/ult#2', 'u/en/ult')
    )
  })

  test('tocBooksEqual / loadedTocEqual skip identical TOC payloads', () => {
    const books = [
      { code: 'tit', name: 'Titus' },
      { code: 'mrk', name: 'Mark' },
    ]
    expect(tocBooksEqual(books, [{ code: 'tit', name: 'Titus' }, { code: 'mrk', name: 'Mark' }])).toBe(
      true
    )
    expect(tocBooksEqual(books, [{ code: 'tit', name: 'Titus' }])).toBe(false)
    const toc = { resourceId: 'u/en/ult#2', resourceType: 'scripture' as const, books }
    expect(loadedTocEqual(toc, { ...toc, books: [...books] })).toBe(true)
    expect(loadedTocEqual(toc, { ...toc, resourceId: 'u/en/ult' })).toBe(false)
  })
})
