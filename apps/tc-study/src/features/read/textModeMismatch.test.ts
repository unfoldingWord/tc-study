import { describe, expect, test } from 'bun:test'
import { emptyLanguageAvailability } from './languageAvailability'
import {
  TEXT_MODE_MISMATCH_COPY,
  applyTextModeScopeSwitch,
  navigationScopeFromReadPath,
  resolveCatalogNavigationScope,
  resolveTextModeMismatch,
  type TextModeMismatchView,
} from './textModeMismatch'

/** Frozen availability fixtures (same DoD languages as picker / helps tests). */
const AVAIL = Object.freeze({
  en: Object.freeze({ bible: true, obs: true, bibleHelps: true, obsHelps: true }),
  es: Object.freeze({ bible: true, obs: false, bibleHelps: true, obsHelps: false }),
  bho: Object.freeze({ bible: false, obs: true, bibleHelps: false, obsHelps: false }),
  hi: Object.freeze({ bible: false, obs: true, bibleHelps: false, obsHelps: true }),
  sw: Object.freeze(emptyLanguageAvailability()),
})

function mismatch(
  scope: string,
  code: keyof typeof AVAIL,
  name: string
): TextModeMismatchView | null {
  return resolveTextModeMismatch({
    navigationScope: scope,
    availability: AVAIL[code],
    languageCode: code,
    languageName: name,
  })
}

describe('resolveTextModeMismatch', () => {
  test('Bible mode + OBS-only language → mismatch, no auto switch', () => {
    const view = mismatch('scripture', 'bho', 'Bhojpuri')
    expect(view?.kind).toBe('obs-only')
    expect(view?.message).toBe(TEXT_MODE_MISMATCH_COPY.noBibleHasObs('Bhojpuri'))
    expect(view?.actionLabel).toBe(TEXT_MODE_MISMATCH_COPY.switchToStories)
    expect(view?.switchScope).toBe('obs')
  })

  test('OBS mode + Bible-only language → inverse mismatch', () => {
    const view = mismatch('obs', 'es', 'Español')
    expect(view?.kind).toBe('bible-only')
    expect(view?.message).toBe(TEXT_MODE_MISMATCH_COPY.noObsHasBible('Español'))
    expect(view?.actionLabel).toBe(TEXT_MODE_MISMATCH_COPY.switchToBible)
    expect(view?.switchScope).toBe('scripture')
  })

  test('matching content is not a mismatch (no auto switch)', () => {
    expect(mismatch('scripture', 'es', 'Español')).toBeNull()
    expect(mismatch('obs', 'bho', 'Bhojpuri')).toBeNull()
    expect(mismatch('scripture', 'en', 'English')).toBeNull()
    expect(mismatch('obs', 'en', 'English')).toBeNull()
  })

  test('neither Bible nor OBS degrades without a switch action', () => {
    const view = mismatch('scripture', 'sw', 'Swahili')
    expect(view?.kind).toBe('neither')
    expect(view?.message).toBe(TEXT_MODE_MISMATCH_COPY.neither('Swahili'))
    expect(view?.actionLabel).toBeNull()
    expect(view?.switchScope).toBeNull()
    expect(mismatch('obs', 'sw', 'Swahili')?.kind).toBe('neither')
  })

  test('unknown availability fails open (do not blank)', () => {
    expect(
      resolveTextModeMismatch({
        navigationScope: 'scripture',
        availability: undefined,
        languageCode: 'fr',
        languageName: 'Français',
      })
    ).toBeNull()
    expect(
      resolveTextModeMismatch({
        navigationScope: 'obs',
        availability: null,
        languageCode: 'fr',
        languageName: 'Français',
      })
    ).toBeNull()
  })

  test('falls back to language code when the name is blank', () => {
    const view = resolveTextModeMismatch({
      navigationScope: 'scripture',
      availability: AVAIL.bho,
      languageCode: 'bho',
      languageName: '  ',
    })
    expect(view?.message).toBe(TEXT_MODE_MISMATCH_COPY.noBibleHasObs('bho'))
  })
})

describe('resolveCatalogNavigationScope', () => {
  test('explicit BCV / Switch tap wins over a stale bible URL', () => {
    expect(
      resolveCatalogNavigationScope({
        pathname: '/read/bho/bible/ref/tit%201:1',
        storeScope: 'obs',
        explicitScope: 'obs',
      })
    ).toBe('obs')
  })

  test('language pick (no explicit scope) still reads the URL, then store', () => {
    expect(
      resolveCatalogNavigationScope({
        pathname: '/read/es/bible/ref/tit%201:1',
        storeScope: 'obs',
      })
    ).toBe('scripture')
    expect(
      resolveCatalogNavigationScope({
        pathname: '/read/es',
        storeScope: 'obs',
      })
    ).toBe('obs')
  })
})

describe('navigationScopeFromReadPath', () => {
  test('reads bible/obs from /read URLs and ignores /read-v1', () => {
    expect(navigationScopeFromReadPath('/read/bho/obs/story/1', 'scripture')).toBe('obs')
    expect(navigationScopeFromReadPath('/read/es/bible/ref/tit%201:1', 'obs')).toBe('scripture')
    expect(navigationScopeFromReadPath('/read/en', 'obs')).toBe('obs')
    expect(navigationScopeFromReadPath('/read-v1/bho/obs/story/1', 'scripture')).toBe('scripture')
  })
})

describe('applyTextModeScopeSwitch', () => {
  test('tap switches scope via existing nav APIs (OBS)', () => {
    const calls: string[] = []
    applyTextModeScopeSwitch(
      {
        setNavigationScope: (scope) => calls.push(`scope:${scope}`),
        navigateToReference: (ref) => calls.push(`ref:${ref.book}`),
      },
      'obs'
    )
    expect(calls).toEqual(['scope:obs', 'ref:obs'])
  })

  test('tap switches scope via existing nav APIs (Bible)', () => {
    const calls: string[] = []
    applyTextModeScopeSwitch(
      {
        setNavigationScope: (scope) => calls.push(`scope:${scope}`),
        navigateToReference: (ref) => calls.push(`ref:${ref.book}`),
      },
      'scripture'
    )
    expect(calls).toEqual(['scope:scripture', 'ref:tit'])
  })
})
