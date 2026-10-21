import { describe, expect, test } from 'bun:test'
import {
  buildTocTitleIndex,
  getCachedTocTitleIndex,
  lookupTocTitle,
  resetTocTitleIndexCache,
} from './tocTitleIndex'

describe('tocTitleIndex', () => {
  test('indexes by identifier, path, and trailing two segments', () => {
    const index = buildTocTitleIndex([
      {
        identifier: 'bible/kt/grace',
        path: 'bible/kt/grace.md',
        title: 'Grace',
      },
      {
        identifier: 'translate/figs-metaphor',
        title: 'Metaphor',
      },
    ])
    expect(lookupTocTitle(index, 'bible/kt/grace')).toBe('Grace')
    expect(lookupTocTitle(index, 'kt/grace')).toBe('Grace')
    expect(lookupTocTitle(index, 'bible/kt/grace.md')).toBe('Grace')
    expect(lookupTocTitle(index, 'translate/figs-metaphor')).toBe('Metaphor')
  })

  test('memoizes per resourceKey@stamp', () => {
    resetTocTitleIndexCache()
    const ingredients = [{ identifier: 'a/b', title: 'Title' }]
    const a = getCachedTocTitleIndex('owner/en/tw', 'v1', ingredients)
    const b = getCachedTocTitleIndex('owner/en/tw', 'v1', ingredients)
    expect(a).toBe(b)
    const c = getCachedTocTitleIndex('owner/en/tw', 'v2', ingredients)
    expect(c).not.toBe(a)
  })

  test('returns null for empty ingredients', () => {
    expect(getCachedTocTitleIndex('k', 'v', [])).toBeNull()
    expect(getCachedTocTitleIndex('k', 'v', null)).toBeNull()
  })
})
