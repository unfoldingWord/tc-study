import { describe, expect, test } from 'bun:test'
import { emptyLanguageAvailability } from './languageAvailability'
import {
  applyTextLanguagePickNavigation,
  catalogScopeAfterTextLanguagePick,
  resolveTextLanguagePickNavigation,
  type TextLanguagePickDecision,
} from './textLanguagePickNavigation'

const AVAIL = Object.freeze({
  en: Object.freeze({ bible: true, obs: true, bibleHelps: true, obsHelps: true }),
  es: Object.freeze({ bible: true, obs: false, bibleHelps: true, obsHelps: false }),
  bho: Object.freeze({ bible: false, obs: true, bibleHelps: false, obsHelps: false }),
  sw: Object.freeze(emptyLanguageAvailability()),
})

function pick(
  scope: string,
  code: keyof typeof AVAIL,
  explicitScope?: string
): TextLanguagePickDecision {
  return resolveTextLanguagePickNavigation({
    availability: AVAIL[code],
    currentScope: scope,
    explicitScope,
  })
}

function navLog() {
  const calls: string[] = []
  return {
    calls,
    nav: {
      setNavigationScope: (scope: 'scripture' | 'obs') => calls.push(`scope:${scope}`),
      navigateToReference: (ref: { book: string; chapter: number; verse: number }) =>
        calls.push(`ref:${ref.book} ${ref.chapter}:${ref.verse}`),
    },
  }
}

describe('resolveTextLanguagePickNavigation', () => {
  test('OBS-only pick while on Exodus → switch to OBS (default 1:1)', () => {
    const decision = pick('scripture', 'bho')
    expect(decision).toEqual({ action: 'switch', scope: 'obs' })
    const { calls, nav } = navLog()
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual(['scope:obs', 'ref:obs 1:1'])
  })

  test('OBS-only pick while on OBS 3:2 → stay on OBS (keep current ref)', () => {
    const decision = pick('obs', 'bho')
    expect(decision).toEqual({ action: 'keep' })
    const { calls, nav } = navLog()
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual([])
  })

  test('Bible-only pick while on OBS → switch to default scripture', () => {
    const decision = pick('obs', 'es')
    expect(decision).toEqual({ action: 'switch', scope: 'scripture' })
    const { calls, nav } = navLog()
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual(['scope:scripture', 'ref:tit 1:1'])
  })

  test('Bible-only pick while on John 3:16 → stay scripture (keep current ref)', () => {
    const decision = pick('scripture', 'es')
    expect(decision).toEqual({ action: 'keep' })
    const { calls, nav } = navLog()
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual([])
  })

  test('both-types language keeps current mode (Bible and OBS)', () => {
    expect(pick('scripture', 'en')).toEqual({ action: 'keep' })
    expect(pick('obs', 'en')).toEqual({ action: 'keep' })
  })

  test('neither-type language keeps current mode (mismatch empty still applies)', () => {
    expect(pick('scripture', 'sw')).toEqual({ action: 'keep' })
    expect(pick('obs', 'sw')).toEqual({ action: 'keep' })
  })

  test('explicit Switch / BCV scope is never overridden', () => {
    expect(pick('scripture', 'bho', 'scripture')).toEqual({ action: 'keep' })
    expect(pick('obs', 'es', 'obs')).toEqual({ action: 'keep' })
    expect(pick('scripture', 'bho', 'obs')).toEqual({ action: 'keep' })
  })

  test('unknown availability fails open (do not switch)', () => {
    expect(
      resolveTextLanguagePickNavigation({
        availability: undefined,
        currentScope: 'scripture',
      })
    ).toEqual({ action: 'keep' })
    expect(
      resolveTextLanguagePickNavigation({
        availability: null,
        currentScope: 'obs',
      })
    ).toEqual({ action: 'keep' })
  })
})

describe('catalogScopeAfterTextLanguagePick', () => {
  test('switch replaces the URL/catalog scope; keep preserves it', () => {
    expect(catalogScopeAfterTextLanguagePick('scripture', { action: 'switch', scope: 'obs' })).toBe(
      'obs'
    )
    expect(catalogScopeAfterTextLanguagePick('obs', { action: 'keep' })).toBe('obs')
  })
})
