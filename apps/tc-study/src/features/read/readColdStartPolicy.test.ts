import { describe, expect, test } from 'bun:test'
import { languageCodeFromReadPathname } from './readBootstrapPolicy'
import { applyPanelLanguage, DEFAULT_READ_PANEL_MODELS } from './readPanelModel'
import {
  hydrateReadLanguagesFromHint,
  hydrateReadLanguagesFromParsedUrl,
  inheritEmptyHelpsFromSession,
  inheritEmptyPanelLanguage,
} from './readColdStartPolicy'
import { coldStartCatalogLoads } from './runReadPanelCatalog'

describe('inheritEmptyPanelLanguage', () => {
  test('p1=ha scripture, p2=undefined → p2 becomes ha (helps mode stays helps)', () => {
    const next = inheritEmptyPanelLanguage({
      'panel-1': { mode: 'scripture', languageCode: 'ha' },
      'panel-2': { mode: 'helps', languageCode: undefined },
    })
    expect(next).not.toBeNull()
    expect(next!.inheritedPanelId).toBe('panel-2')
    expect(next!.languageCode).toBe('ha')
    expect(next!.panels['panel-1']).toEqual({ mode: 'scripture', languageCode: 'ha' })
    expect(next!.panels['panel-2']).toEqual({ mode: 'helps', languageCode: 'ha' })
  })

  test('helps-only p2 does not seed empty scripture p1 (no silent English)', () => {
    expect(
      inheritEmptyPanelLanguage({
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      })
    ).toBeNull()
    expect(
      inheritEmptyPanelLanguage({
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: 'eng' },
      })
    ).toBeNull()
  })

  test('p2 scripture with language and p1 empty → p1 inherits scripture mode', () => {
    const next = inheritEmptyPanelLanguage({
      'panel-1': { mode: 'scripture', languageCode: null },
      'panel-2': { mode: 'scripture', languageCode: 'ha' },
    })
    expect(next?.inheritedPanelId).toBe('panel-1')
    expect(next?.panels['panel-1']).toEqual({ mode: 'scripture', languageCode: 'ha' })
    expect(next?.panels['panel-2']).toEqual({ mode: 'scripture', languageCode: 'ha' })
  })

  test('both empty is left for the one-picker seed, not inherit', () => {
    expect(inheritEmptyPanelLanguage(DEFAULT_READ_PANEL_MODELS)).toBeNull()
  })

  test('does not clobber a pane that already has a language', () => {
    const split = {
      'panel-1': { mode: 'scripture' as const, languageCode: 'ha' },
      'panel-2': { mode: 'helps' as const, languageCode: 'en' },
    }
    expect(inheritEmptyPanelLanguage(split)).toBeNull()
    expect(inheritEmptyPanelLanguage({
      'panel-1': { mode: 'scripture', languageCode: 'ha' },
      'panel-2': { mode: 'helps', languageCode: 'ha' },
    })).toBeNull()
  })

  test('after inherit, a later picker change on one pane leaves the other', () => {
    const inherited = inheritEmptyPanelLanguage({
      'panel-1': { mode: 'scripture', languageCode: 'ha' },
      'panel-2': { mode: 'helps', languageCode: null },
    })
    expect(inherited).not.toBeNull()
    const diverged = applyPanelLanguage(inherited!.panels, 'panel-1', 'en')
    expect(diverged['panel-1'].languageCode).toBe('en')
    expect(diverged['panel-2']).toEqual({ mode: 'helps', languageCode: 'ha' })
  })

  test('cached eng + visit /read/tr/obs/ref/1.1 applies tr to both synced panes', () => {
    const urlLang = languageCodeFromReadPathname('/read/tr/obs/ref/1.1')
    expect(urlLang).toBe('tr')
    const hydrated = hydrateReadLanguagesFromHint({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'eng' },
        'panel-2': { mode: 'helps', languageCode: 'eng' },
      },
      hintLanguage: urlLang,
    })
    expect(hydrated.appliedHintTo).toBe('panel-1')
    expect(hydrated.inheritedPanelId).toBe('panel-2')
    expect(hydrated.languageCode).toBe('tr')
    expect(hydrated.panels['panel-1'].languageCode).toBe('tr')
    expect(hydrated.panels['panel-2']).toEqual({ mode: 'helps', languageCode: 'tr' })
  })

  test('URL tr + empty panel-2 inherits tr, not a stale cached sibling', () => {
    const hydrated = hydrateReadLanguagesFromHint({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'eng' },
        'panel-2': { mode: 'helps', languageCode: null },
      },
      hintLanguage: 'tr',
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('tr')
    expect(hydrated.panels['panel-2']).toEqual({ mode: 'helps', languageCode: 'tr' })
  })

  test('URL tr does not clobber a diverged helps language', () => {
    const hydrated = hydrateReadLanguagesFromHint({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'eng' },
        'panel-2': { mode: 'helps', languageCode: 'fr' },
      },
      hintLanguage: 'tr',
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('tr')
    expect(hydrated.panels['panel-2']).toEqual({ mode: 'helps', languageCode: 'fr' })
  })

  test('cached eng and URL en are the same English — both panes canonicalize to en', () => {
    const hydrated = hydrateReadLanguagesFromHint({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'eng' },
        'panel-2': { mode: 'helps', languageCode: 'eng' },
      },
      hintLanguage: 'en',
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('en')
    expect(hydrated.panels['panel-2']).toEqual({ mode: 'helps', languageCode: 'en' })
    expect(coldStartCatalogLoads(hydrated.panels)).toEqual([
      {
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        loadTarget: 'both',
      },
    ])
  })

  test('visit /read/tr/obs/ref/1.1 with empty panel-2 inherits tr and triggers helps load', () => {
    const urlLang = languageCodeFromReadPathname('/read/tr/obs/ref/1.1')
    expect(urlLang).toBe('tr')
    const hydrated = hydrateReadLanguagesFromHint({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: undefined },
      },
      hintLanguage: urlLang,
    })
    expect(hydrated.appliedHintTo).toBe('panel-1')
    expect(hydrated.inheritedPanelId).toBe('panel-2')
    expect(hydrated.panels['panel-1'].languageCode).toBe('tr')
    expect(hydrated.panels['panel-2']).toEqual({ mode: 'helps', languageCode: 'tr' })
    const loads = coldStartCatalogLoads(hydrated.panels)
    expect(loads).toEqual([
      {
        textLanguageCode: 'tr',
        helpsLanguageCode: 'tr',
        loadTarget: 'both',
      },
    ])
  })

  test('external /read/fr/obs hydrates fr and empty other pane inherits once', () => {
    const hydrated = hydrateReadLanguagesFromParsedUrl({
      panels: DEFAULT_READ_PANEL_MODELS,
      langs: ['fr'],
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('fr')
    expect(hydrated.panels['panel-2'].languageCode).toBe('fr')
    expect(hydrated.inheritedPanelId).toBe('panel-2')
  })

  test('external /read/en/fr/bible sets p1=en and p2=fr', () => {
    const hydrated = hydrateReadLanguagesFromParsedUrl({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'ha' },
        'panel-2': { mode: 'helps', languageCode: 'tr' },
      },
      langs: ['en', 'fr'],
    })
    expect(hydrated.panels['panel-1'].languageCode).toBe('en')
    expect(hydrated.panels['panel-2'].languageCode).toBe('fr')
    expect(hydrated.inheritedPanelId).toBeNull()
  })

  test('external /read/en/bible sets both if other empty; does not overwrite stored p2', () => {
    const emptyP2 = hydrateReadLanguagesFromParsedUrl({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: null },
      },
      langs: ['en'],
    })
    expect(emptyP2.panels['panel-1'].languageCode).toBe('en')
    expect(emptyP2.panels['panel-2'].languageCode).toBe('en')

    const storedP2 = hydrateReadLanguagesFromParsedUrl({
      panels: {
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'helps', languageCode: 'fr' },
      },
      langs: ['en'],
    })
    expect(storedP2.panels['panel-1'].languageCode).toBe('en')
    expect(storedP2.panels['panel-2'].languageCode).toBe('fr')
  })

  test('session restore with p1 set and p2 empty copies helps language only', () => {
    const next = inheritEmptyHelpsFromSession({
      'panel-1': { mode: 'scripture', languageCode: 'tr' },
      'panel-2': { mode: 'helps', languageCode: null },
    })
    expect(next['panel-2'].languageCode).toBe('tr')
    expect(
      inheritEmptyHelpsFromSession({
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: 'fr' },
      })['panel-1'].languageCode
    ).toBeNull()
  })
})
