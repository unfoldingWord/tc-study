import { describe, expect, test } from 'bun:test'
import { helpsFilterIdentity, scrollHelpsToTop } from './scrollHelpsToTop'

const token = {
  semanticId: 'tit-1-5-because-1',
  content: 'because',
  alignedSemanticIds: ['b', 'a'],
  timestamp: 1,
}

describe('helpsFilterIdentity', () => {
  test('ignores timestamp so rebroadcasts do not change identity', () => {
    const a = helpsFilterIdentity({
      tokenFilter: token,
      verseFilter: null,
      obsQuoteFilter: null,
    })
    const b = helpsFilterIdentity({
      tokenFilter: { ...token, timestamp: 99 },
      verseFilter: null,
      obsQuoteFilter: null,
    })
    expect(a).toBe(b)
  })

  test('aligned id order does not change identity', () => {
    const a = helpsFilterIdentity({
      tokenFilter: { ...token, alignedSemanticIds: ['a', 'b'] },
      verseFilter: null,
      obsQuoteFilter: null,
    })
    const b = helpsFilterIdentity({
      tokenFilter: { ...token, alignedSemanticIds: ['b', 'a'] },
      verseFilter: null,
      obsQuoteFilter: null,
    })
    expect(a).toBe(b)
  })

  test('new token or match set changes identity', () => {
    const base = helpsFilterIdentity({
      tokenFilter: token,
      verseFilter: null,
      obsQuoteFilter: null,
    })
    const newToken = helpsFilterIdentity({
      tokenFilter: { ...token, semanticId: 'tit-1-5-other-1', content: 'other' },
      verseFilter: null,
      obsQuoteFilter: null,
    })
    const newMatches = helpsFilterIdentity({
      tokenFilter: { ...token, alignedSemanticIds: ['a', 'c'] },
      verseFilter: null,
      obsQuoteFilter: null,
    })
    expect(newToken).not.toBe(base)
    expect(newMatches).not.toBe(base)
  })

  test('clearing the filter changes identity', () => {
    const active = helpsFilterIdentity({
      tokenFilter: token,
      verseFilter: null,
      obsQuoteFilter: null,
    })
    const cleared = helpsFilterIdentity({
      tokenFilter: null,
      verseFilter: null,
      obsQuoteFilter: null,
    })
    expect(cleared).not.toBe(active)
  })

  test('OBS quote sourceIds are the match-set identity', () => {
    const a = helpsFilterIdentity({
      tokenFilter: null,
      verseFilter: null,
      obsQuoteFilter: { quote: 'q', sourceIds: ['n2', 'n1'] },
    })
    const b = helpsFilterIdentity({
      tokenFilter: null,
      verseFilter: null,
      obsQuoteFilter: { quote: 'q', sourceIds: ['n1', 'n2'] },
    })
    const c = helpsFilterIdentity({
      tokenFilter: null,
      verseFilter: null,
      obsQuoteFilter: { quote: 'q', sourceIds: ['n1'] },
    })
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })
})

describe('scrollHelpsToTop', () => {
  test('sets scrollTop to 0', () => {
    const el = { scrollTop: 40 }
    scrollHelpsToTop(el)
    expect(el.scrollTop).toBe(0)
  })

  test('no-ops on null', () => {
    expect(() => scrollHelpsToTop(null)).not.toThrow()
  })
})
