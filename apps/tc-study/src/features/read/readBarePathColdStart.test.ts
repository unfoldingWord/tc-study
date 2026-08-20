import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findConsumedKeys, shouldInjectComposition } from '../helps/compositionInjection'
import { HELPS_EMPTY_COPY, resolveHelpsPaneNoSourcesView } from '../helps/helpsEmptyCopy'
import { isHelpsCatalogKnownEmpty } from './helpsLanguagePolicy'
import { isScriptureBooksPending } from '../../components/resources/ScriptureViewer/hooks/scriptureContentLoad'
import {
  languageCodeFromReadPathname,
  resolveReadLanguageFromUrlOrCache,
  shouldDeferLanguageCatalogLoad,
  shouldWriteBackReadUrl,
} from './readBootstrapPolicy'
import { inheritEmptyPanelLanguage } from './readColdStartPolicy'
import {
  applySeedBothLanguages,
  DEFAULT_READ_PANEL_MODELS,
  needsReadLanguagePicker,
} from './readPanelModel'
import { isPanelCatalogSpinner, isReadPanelCatalogSettled } from './panelCatalogLoading'
import { resolveTextModeMismatch, TEXT_MODE_MISMATCH_COPY } from './textModeMismatch'
import { coldStartCatalogLoads } from './runReadPanelCatalog'

describe('bare /read cold-start', () => {
  test('no cache + /read does not auto-apply en/eng; picker stays required', () => {
    expect(languageCodeFromReadPathname('/read')).toBeNull()
    expect(languageCodeFromReadPathname('/read/')).toBeNull()
    expect(
      resolveReadLanguageFromUrlOrCache({ pathname: '/read', cachedLanguage: null })
    ).toEqual({ language: null, source: null })
    expect(shouldDeferLanguageCatalogLoad(null)).toBe(true)
    expect(shouldDeferLanguageCatalogLoad('')).toBe(true)
    expect(
      inheritEmptyPanelLanguage({
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      })
    ).toBeNull()
    expect(needsReadLanguagePicker(DEFAULT_READ_PANEL_MODELS)).toBe(true)
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: null,
        suppressUrlSync: false,
        pathname: '/read',
      })
    ).toBe(false)
  })

  test('cache tr + /read stays tr, not rewritten to en', () => {
    expect(
      resolveReadLanguageFromUrlOrCache({
        pathname: '/read',
        cachedLanguage: 'tr',
      })
    ).toEqual({ language: 'tr', source: 'cache' })
    expect(
      resolveReadLanguageFromUrlOrCache({
        pathname: '/read/',
        cachedLanguage: 'tr',
      })
    ).toEqual({ language: 'tr', source: 'cache' })
    const inherited = inheritEmptyPanelLanguage({
      'panel-1': { mode: 'scripture', languageCode: 'tr' },
      'panel-2': { mode: 'helps', languageCode: 'en' },
    })
    expect(inherited).toBeNull()
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'tr',
        suppressUrlSync: false,
        pathname: '/read',
      })
    ).toBe(true)
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'en',
        suppressUrlSync: false,
        pathname: '/read/tr/bible/ref/tit%201%3A1',
      })
    ).toBe(false)
  })

  test('language known always requests scripture+helps catalog (no remount defer)', () => {
    expect(shouldDeferLanguageCatalogLoad('en')).toBe(false)
    expect(shouldDeferLanguageCatalogLoad('tr')).toBe(false)
    const seeded = applySeedBothLanguages(DEFAULT_READ_PANEL_MODELS, 'en')
    expect(needsReadLanguagePicker(seeded)).toBe(false)
    expect(coldStartCatalogLoads(seeded)).toEqual([
      {
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        loadTarget: 'both',
      },
    ])
  })

  test('OBS-only language in Bible mode is switch-to-OBS empty, not spinner', () => {
    const mismatch = resolveTextModeMismatch({
      navigationScope: 'scripture',
      availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
      languageCode: 'fr',
      languageName: 'French',
    })
    expect(mismatch?.kind).toBe('obs-only')
    expect(mismatch?.actionLabel).toBe(TEXT_MODE_MISMATCH_COPY.switchToStories)
    expect(mismatch?.message).toBe(TEXT_MODE_MISMATCH_COPY.noBibleHasObs('French'))

    const scriptureSettled = isReadPanelCatalogSettled({
      languageCode: 'fr',
      catalogSettled: false,
      hasKnownMismatch: true,
    })
    expect(scriptureSettled).toBe(true)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: false,
        hasMembership: false,
        catalogSettled: scriptureSettled,
      })
    ).toBe(false)

    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'fr',
        isLoading: false,
        hasResource: false,
        languageName: 'French',
        catalogSettled: true,
      })?.kind
    ).toBe('no-sources')
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'fr',
        isLoading: false,
        hasResource: false,
        catalogSettled: false,
      })
    ).toBeNull()
  })

  test('Bible mode + OBS-only language shows helps no-sources + language action, not spinner', () => {
    const availability = { bible: false, obs: true, bibleHelps: false, obsHelps: false }
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'scripture',
        availability,
      })
    ).toBe(true)

    const helpsSettled = isReadPanelCatalogSettled({
      languageCode: 'fr',
      catalogSettled: false,
      hasKnownNoHelps: true,
    })
    expect(helpsSettled).toBe(true)
    expect(
      isPanelCatalogSpinner({
        catalogLoading: false,
        hasMembership: false,
        catalogSettled: helpsSettled,
      })
    ).toBe(false)

    const view = resolveHelpsPaneNoSourcesView({
      mode: 'helps',
      languageCode: 'fr',
      isLoading: false,
      hasResource: false,
      languageName: 'French',
      catalogSettled: helpsSettled,
    })
    expect(view?.kind).toBe('no-sources')
    expect(view?.message).toBe(HELPS_EMPTY_COPY.noSources('French'))
    expect(view?.actionLabel).toBe(HELPS_EMPTY_COPY.switchToDefaultHelps('English'))
    expect(view?.actionShortLabel).toBe('English')
    expect(view?.defaultHelpsLanguageCode).toBe('en')
  })

  test('English helps catalog pending is spinner, not no-sources empty', () => {
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'en',
        isLoading: false,
        hasResource: false,
        catalogSettled: false,
      })
    ).toBeNull()
    expect(
      isPanelCatalogSpinner({
        catalogLoading: false,
        hasMembership: false,
        catalogSettled: false,
      })
    ).toBe(true)
  })

  test('English helps under eng while URL is en still injects CombinedHelps', () => {
    const found = findConsumedKeys(
      [
        { key: 'unfoldingWord/eng/tn', type: 'notes' },
        { key: 'unfoldingWord/eng/twl', type: 'words-links' },
      ] as never,
      ['notes', 'words-links'],
      { langCode: 'en' }
    )
    expect(shouldInjectComposition(found, ['notes', 'words-links'], 'any')).toBe(true)
    expect(found.notes).toBe('unfoldingWord/eng/tn')
  })

  test('scripture catalog empty then hydrated with TIT is not sticky no-content', () => {
    expect(
      isScriptureBooksPending({
        isLoadingTOC: false,
        isLoading: false,
        availableBookCount: 0,
        hasViewModel: false,
      })
    ).toBe(true)
    expect(
      isScriptureBooksPending({
        isLoadingTOC: false,
        isLoading: false,
        availableBookCount: 3,
        hasViewModel: true,
      })
    ).toBe(false)
  })

  test('Read page requires picker on bare /read when no language is known', () => {
    const readPage = readFileSync(join(import.meta.dir, '../../pages/Read.tsx'), 'utf8')
    expect(readPage).toContain('resolveReadLanguageFromUrlOrCache')
    expect(readPage).toContain('requireLanguageInUrl = !languageCode')
    expect(readPage).toContain('initialLanguage={languageCode}')
    expect(readPage).not.toContain('requireLanguageInUrl={false}')
    expect(readPage).not.toContain('resolveColdStartReadLanguage')
  })
})
