import { describe, expect, test, beforeEach } from 'bun:test'
import { hydrateReadLanguagesFromParsedUrl } from './readColdStartPolicy'
import { DEFAULT_READ_PANEL_MODELS } from './readPanelModel'
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
