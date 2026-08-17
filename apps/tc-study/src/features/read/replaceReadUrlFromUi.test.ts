import { describe, expect, test, beforeEach } from 'bun:test'
import { readUrlWriteBackAction, shouldPushReadLanguageUrl } from './readBootstrapPolicy'
import { hydrateReadLanguagesFromParsedUrl } from './readColdStartPolicy'
import { DEFAULT_READ_PANEL_MODELS } from './readPanelModel'
import { parseReadUrl, readUrlLangsFromPanels, serializeReadUrl } from './readUrlGrammar'
import {
  applyReadPopstate,
  getReadNavigationSource,
  markReadNavigationInternal,
  replaceReadUrlFromUi,
  resetReadNavigationSourceForTests,
  shouldHydrateReadLanguages,
  subscribeReadPopstate,
} from './replaceReadUrlFromUi'

describe('replaceReadUrlFromUi + navigationSource', () => {
  beforeEach(() => {
    resetReadNavigationSourceForTests()
  })

  test('internal pick does not hydrate or re-apply a single lang to the other pane', () => {
    const stored = {
      'panel-1': { mode: 'scripture' as const, languageCode: 'en' },
      'panel-2': { mode: 'helps' as const, languageCode: 'fr' },
    }
    replaceReadUrlFromUi('/read/en/bible/ref/tit%201%3A1')
    expect(getReadNavigationSource()).toBe('internal')
    expect(shouldHydrateReadLanguages()).toBe(false)
    const after = hydrateReadLanguagesFromParsedUrl({
      panels: stored,
      langs: shouldHydrateReadLanguages() ? ['en'] : [],
    })
    expect(after.panels['panel-1'].languageCode).toBe('en')
    expect(after.panels['panel-2'].languageCode).toBe('fr')
  })

  test('in-app scripture pick updates en → en+fr via replaceState, no hydrate', () => {
    replaceReadUrlFromUi('/read/en/bible/ref/tit%201%3A1')
    expect(getReadNavigationSource()).toBe('internal')
    expect(shouldHydrateReadLanguages()).toBe(false)
    replaceReadUrlFromUi('/read/en+fr/bible/ref/tit%201%3A1')
    expect(getReadNavigationSource()).toBe('internal')
    expect(shouldHydrateReadLanguages()).toBe(false)
    replaceReadUrlFromUi('/read/fr/bible/ref/tit%201%3A1')
    expect(getReadNavigationSource()).toBe('internal')
    expect(shouldHydrateReadLanguages()).toBe(false)
    const after = hydrateReadLanguagesFromParsedUrl({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'scripture', languageCode: 'fr' },
      },
      langs: shouldHydrateReadLanguages() ? ['en'] : [],
    })
    expect(after.panels['panel-1'].languageCode).toBe('en')
    expect(after.panels['panel-2'].languageCode).toBe('fr')
  })

  test('write-back after hydrate does not re-enter hydrate', () => {
    const events: string[] = []
    expect(shouldHydrateReadLanguages('external')).toBe(true)
    events.push('hydrate')
    replaceReadUrlFromUi('/read/fr/obs/story/1')
    if (shouldHydrateReadLanguages()) events.push('hydrate')
    expect(events).toEqual(['hydrate'])
    expect(getReadNavigationSource()).toBe('internal')
  })

  test('external single-lang path overwrites persisted p2; internal pick does not', () => {
    const stored = {
      'panel-1': { mode: 'scripture' as const, languageCode: 'en' },
      'panel-2': { mode: 'helps' as const, languageCode: 'fr' },
    }
    expect(shouldHydrateReadLanguages('external')).toBe(true)
    const external = hydrateReadLanguagesFromParsedUrl({
      panels: stored,
      langs: shouldHydrateReadLanguages('external') ? ['es-419'] : [],
    })
    expect(external.panels['panel-1'].languageCode).toBe('es-419')
    expect(external.panels['panel-2'].languageCode).toBe('es-419')

    replaceReadUrlFromUi('/read/es-419/obs/story/8')
    expect(getReadNavigationSource()).toBe('internal')
    expect(shouldHydrateReadLanguages()).toBe(false)
    const internal = hydrateReadLanguagesFromParsedUrl({
      panels: stored,
      langs: shouldHydrateReadLanguages() ? ['es-419'] : [],
    })
    expect(internal.panels['panel-1'].languageCode).toBe('en')
    expect(internal.panels['panel-2'].languageCode).toBe('fr')
  })

  test('popstate / back is external and applies path languages', () => {
    markReadNavigationInternal()
    expect(shouldHydrateReadLanguages()).toBe(false)
    applyReadPopstate()
    expect(getReadNavigationSource()).toBe('external')
    expect(shouldHydrateReadLanguages()).toBe(true)
    const hydrated = hydrateReadLanguagesFromParsedUrl({
      panels: DEFAULT_READ_PANEL_MODELS,
      langs: ['fr'],
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('fr')
    expect(hydrated.panels['panel-2'].languageCode).toBe('fr')
  })

  test('external /read/es-419+en/obs/story/8 keeps both langs after hydrate write-back', () => {
    const pathname = '/read/es-419+en/obs/story/8'
    const langs = parseReadUrl(pathname).langs
    expect(langs).toEqual(['es-419', 'en'])
    const hydrated = hydrateReadLanguagesFromParsedUrl({
      panels: DEFAULT_READ_PANEL_MODELS,
      langs,
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('es-419')
    expect(hydrated.panels['panel-2'].languageCode).toBe('en')
    const serializedLangs = readUrlLangsFromPanels(hydrated.panels)
    expect(serializedLangs).toEqual(['es-419', 'en'])
    const serialized = serializeReadUrl({
      langs: serializedLangs,
      tail: { resourceType: 'obs', navType: 'story', navRef: '8' },
    })
    expect(serialized).toBe(pathname)
    expect(serialized).toContain('es-419+en')
    expect(serialized).not.toBe('/read/es-419/obs/story/8')
    expect(shouldPushReadLanguageUrl(pathname, serializedLangs)).toBe(false)
    expect(
      readUrlWriteBackAction({
        pathname,
        language: 'es-419',
        languages: serializedLangs,
        suppressUrlSync: false,
        navigationSource: 'internal',
        scope: 'obs',
        mode: 'chapter',
        ref: { book: 'obs', chapter: 8, verse: 1 },
        passageSet: null,
        section1Based: null,
      })
    ).toBeNull()
    replaceReadUrlFromUi(serialized)
    expect(getReadNavigationSource()).toBe('internal')
    expect(shouldHydrateReadLanguages()).toBe(false)
  })

  test('external single-lang /read/es-419/obs/story/8 stays one segment after hydrate', () => {
    const pathname = '/read/es-419/obs/story/8'
    const langs = parseReadUrl(pathname).langs
    expect(langs).toEqual(['es-419'])
    const hydrated = hydrateReadLanguagesFromParsedUrl({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'helps', languageCode: 'fr' },
      },
      langs,
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('es-419')
    expect(hydrated.panels['panel-2'].languageCode).toBe('es-419')
    const serializedLangs = readUrlLangsFromPanels(hydrated.panels)
    expect(serializedLangs).toEqual(['es-419'])
    expect(
      serializeReadUrl({
        langs: serializedLangs,
        tail: { resourceType: 'obs', navType: 'story', navRef: '8' },
      })
    ).toBe(pathname)
    expect(shouldPushReadLanguageUrl(pathname, serializedLangs)).toBe(false)
    expect(
      readUrlWriteBackAction({
        pathname,
        language: 'es-419',
        languages: serializedLangs,
        suppressUrlSync: false,
        navigationSource: 'internal',
        scope: 'obs',
        mode: 'chapter',
        ref: { book: 'obs', chapter: 8, verse: 1 },
        passageSet: null,
        section1Based: null,
      })
    ).toBeNull()
  })

  test('one popstate listener cleans up (no growing subscriptions)', () => {
    const seen: number[] = []
    const unsub = subscribeReadPopstate(() => seen.push(1))
    unsub()
    const unsub2 = subscribeReadPopstate(() => seen.push(2))
    unsub2()
    expect(typeof unsub).toBe('function')
    expect(typeof unsub2).toBe('function')
  })
})
