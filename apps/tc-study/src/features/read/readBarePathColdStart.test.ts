import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldInjectCombinedHelps, findHelpsKeysAmongResources } from '../helps/combinedHelpsInjection'
import { resolveHelpsPaneNoSourcesView } from '../helps/helpsEmptyCopy'
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
import { isPanelCatalogSpinner } from './panelCatalogLoading'
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

  test('Read page requires picker on bare /read when no language is known', () => {
    const readPage = readFileSync(join(import.meta.dir, '../../pages/Read.tsx'), 'utf8')
    expect(readPage).toContain('resolveReadLanguageFromUrlOrCache')
    expect(readPage).toContain('requireLanguageInUrl = !languageCode')
    expect(readPage).toContain('initialLanguage={languageCode}')
    expect(readPage).not.toContain('requireLanguageInUrl={false}')
    expect(readPage).not.toContain('resolveColdStartReadLanguage')
  })
})
