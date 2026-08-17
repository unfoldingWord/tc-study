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

function navLog(current?: { book: string; chapter: number; verse: number }) {
  const calls: string[] = []
  return {
    calls,
    nav: {
      currentReference: current,
      setNavigationScope: (scope: 'scripture' | 'obs') => calls.push(`scope:${scope}`),
      setNavigationMode: (mode: 'chapter' | 'verse') => calls.push(`mode:${mode}`),
      navigateToReference: (ref: { book: string; chapter: number; verse: number }) =>
        calls.push(`ref:${ref.book} ${ref.chapter}:${ref.verse}`),
    },
  }
}

describe('resolveTextLanguagePickNavigation', () => {
  test('OBS-only pick while on Exodus → mismatch empty, not auto OBS 1:1', () => {
    const decision = pick('scripture', 'bho')
    expect(decision).toEqual({ action: 'mismatch' })
    const { calls, nav } = navLog({ book: 'exo', chapter: 1, verse: 1 })
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual([])
  })

  test('Switch from Bible with OBS-only → OBS 1:1', () => {
    const { calls, nav } = navLog({ book: 'exo', chapter: 1, verse: 1 })
    applyTextLanguagePickNavigation(nav, { action: 'switch', scope: 'obs' })
    expect(calls).toEqual(['scope:obs', 'mode:chapter', 'ref:obs 1:1'])
  })

  test('Hausa OBS-only Switch lands on OBS story 1 chapter view', () => {
    const decision = pick('scripture', 'bho')
    expect(decision).toEqual({ action: 'mismatch' })
    const { calls, nav } = navLog({ book: 'tit', chapter: 1, verse: 1 })
    applyTextLanguagePickNavigation(nav, { action: 'switch', scope: 'obs' })
    expect(calls).toEqual(['scope:obs', 'mode:chapter', 'ref:obs 1:1'])
  })

  test('OBS-only pick while on OBS 3:2 → stay on OBS (keep current ref, no empty)', () => {
    const decision = pick('obs', 'bho')
    expect(decision).toEqual({ action: 'keep' })
    const { calls, nav } = navLog({ book: 'obs', chapter: 3, verse: 2 })
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual([])
  })

  test('Switch from Bible already on OBS ref → keep story, set chapter grain', () => {
    const { calls, nav } = navLog({ book: 'obs', chapter: 3, verse: 2 })
    applyTextLanguagePickNavigation(nav, { action: 'switch', scope: 'obs' })
    expect(calls).toEqual(['scope:obs', 'mode:chapter'])
  })

  test('Bible-only pick while on OBS → mismatch empty, not auto scripture', () => {
    const decision = pick('obs', 'es')
    expect(decision).toEqual({ action: 'mismatch' })
    const { calls, nav } = navLog({ book: 'obs', chapter: 1, verse: 1 })
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual([])
  })

  test('Switch from OBS with Bible-only → default scripture', () => {
    const { calls, nav } = navLog({ book: 'obs', chapter: 3, verse: 2 })
    applyTextLanguagePickNavigation(nav, { action: 'switch', scope: 'scripture' })
    expect(calls).toEqual(['scope:scripture', 'mode:verse', 'ref:tit 1:1'])
  })

  test('Bible-only pick while on John 3:16 → stay scripture (keep current ref)', () => {
    const decision = pick('scripture', 'es')
    expect(decision).toEqual({ action: 'keep' })
    const { calls, nav } = navLog({ book: 'jhn', chapter: 3, verse: 16 })
    applyTextLanguagePickNavigation(nav, decision)
    expect(calls).toEqual([])
  })

  test('Switch from OBS already on a Bible ref → keep it, set verse grain', () => {
    const { calls, nav } = navLog({ book: 'jhn', chapter: 3, verse: 16 })
    applyTextLanguagePickNavigation(nav, { action: 'switch', scope: 'scripture' })
    expect(calls).toEqual(['scope:scripture', 'mode:verse'])
  })

  test('both-types language keeps current mode (Bible and OBS)', () => {
    expect(pick('scripture', 'en')).toEqual({ action: 'keep' })
    expect(pick('obs', 'en')).toEqual({ action: 'keep' })
  })

  test('neither-type language stays in mode (mismatch empty, no Switch nav)', () => {
    expect(pick('scripture', 'sw')).toEqual({ action: 'mismatch' })
    expect(pick('obs', 'sw')).toEqual({ action: 'mismatch' })
    const { calls, nav } = navLog({ book: 'exo', chapter: 1, verse: 1 })
    applyTextLanguagePickNavigation(nav, pick('scripture', 'sw'))
    expect(calls).toEqual([])
  })

  test('explicit BCV into a mode the language lacks is keep (empty, no auto-jump)', () => {
    expect(pick('scripture', 'bho', 'scripture')).toEqual({ action: 'keep' })
    expect(pick('obs', 'es', 'obs')).toEqual({ action: 'keep' })
    expect(pick('scripture', 'bho', 'obs')).toEqual({ action: 'keep' })
    const { calls, nav } = navLog({ book: 'tit', chapter: 1, verse: 1 })
    applyTextLanguagePickNavigation(nav, pick('scripture', 'bho', 'scripture'))
    expect(calls).toEqual([])
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
  test('switch replaces the URL/catalog scope; keep and mismatch preserve it', () => {
    expect(catalogScopeAfterTextLanguagePick('scripture', { action: 'switch', scope: 'obs' })).toBe(
      'obs'
    )
    expect(catalogScopeAfterTextLanguagePick('obs', { action: 'keep' })).toBe('obs')
    expect(catalogScopeAfterTextLanguagePick('scripture', { action: 'mismatch' })).toBe('scripture')
  })
})
