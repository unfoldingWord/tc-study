import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldInjectCombinedHelps, findHelpsKeysAmongResources } from '../helps/combinedHelpsInjection'
import { resolveHelpsPaneNoSourcesView } from '../helps/helpsEmptyCopy'
import { isScriptureBooksPending } from '../../components/resources/ScriptureViewer/hooks/scriptureContentLoad'
import {
  languageCodeFromReadPathname,
  resolveColdStartReadLanguage,
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
import { isPanelCatalogSpinner } from './panelCatalogLoading'
import { coldStartCatalogLoads } from './runReadPanelCatalog'

describe('bare /read cold-start', () => {
  test('no cache + /read defaults to Door43 en and requests scripture+helps catalog', () => {
    expect(languageCodeFromReadPathname('/read')).toBeNull()
    expect(languageCodeFromReadPathname('/read/')).toBeNull()
    expect(
      resolveReadLanguageFromUrlOrCache({ pathname: '/read', cachedLanguage: null })
    ).toEqual({ language: null, source: null })
    expect(resolveColdStartReadLanguage({ pathname: '/read', cachedLanguage: null })).toEqual({
      language: 'en',
      source: 'default',
    })
    expect(shouldDeferLanguageCatalogLoad('en')).toBe(false)
    const seeded = applySeedBothLanguages(DEFAULT_READ_PANEL_MODELS, 'en')
    expect(needsReadLanguagePicker(seeded)).toBe(false)
    expect(coldStartCatalogLoads(seeded)).toEqual([
      {
        textLanguageCode: 'en',
        helpsLanguageCode: 'en',
        loadTarget: 'both',
      },
    ])
    expect(
      inheritEmptyPanelLanguage({
        'panel-1': { mode: 'scripture', languageCode: null },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      })
    ).toBeNull()
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'en',
        suppressUrlSync: false,
        pathname: '/read',
      })
    ).toBe(true)
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
    const pair = findHelpsKeysAmongResources(
      [
        { key: 'unfoldingWord/eng/tn', type: 'notes' },
        { key: 'unfoldingWord/eng/twl', type: 'words-links' },
      ] as never,
      'scripture',
      { langCode: 'en' }
    )
    expect(shouldInjectCombinedHelps(pair)).toBe(true)
    expect(pair.tnKey).toBe('unfoldingWord/eng/tn')
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

  test('Read page cold-starts English in place (no picker-required defer)', () => {
    const readPage = readFileSync(join(import.meta.dir, '../../pages/Read.tsx'), 'utf8')
    expect(readPage).toContain('resolveColdStartReadLanguage')
    expect(readPage).toContain('requireLanguageInUrl={false}')
    expect(readPage).toContain('initialLanguage={languageCode}')
  })
})
