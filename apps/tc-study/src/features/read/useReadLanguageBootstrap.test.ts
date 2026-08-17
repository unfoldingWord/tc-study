import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useReadLanguageBootstrap (split text vs helps)', () => {
  const src = readFileSync(join(import.meta.dir, 'useReadLanguageBootstrap.ts'), 'utf8')

  test('exposes separate text and helps handlers plus split loading flags', () => {
    expect(src).toContain('handleLanguageSelected')
    expect(src).toContain('handleHelpsLanguageSelected')
    expect(src).toContain('handlePanelLanguageSelected')
    expect(src).toContain('isLoadingTextResources')
    expect(src).toContain('isLoadingHelpsResources')
    expect(src).toContain('isLoadingByPanel')
    expect(src).toContain('catalogSettledByPanel')
    expect(src).toContain('helpsLanguageCode')
  })

  test('URL stays on text language; first pick seeds both panels', () => {
    expect(src).toContain('shouldPushReadLanguageUrl')
    expect(src).toContain('pushReadLanguageUrl(navigate, resolvedCode)')
    expect(src).toContain('canSeedBothPanelLanguages')
    expect(src).toContain('seedBothLanguages(resolvedCode)')
    expect(src).toContain('inheritEmptyLanguage')
    expect(src).toContain('coldStartCatalogLoads')
    expect(src).toContain('catalogLoadForSinglePanel')
  })

  test('OBS-only / Bible-only text pick stays in mode; mismatch empty before URL write', () => {
    const handler = src.slice(src.indexOf('const handleLanguageSelected'))
    const body = handler.slice(0, handler.indexOf('const { handleSwitchTextMode'))
    expect(body).toContain('resolveTextLanguagePickNavigation')
    expect(body).toContain('applyTextLanguagePickNavigation')
    expect(body.indexOf('applyTextLanguagePickNavigation')).toBeLessThan(body.indexOf('shouldPushReadLanguageUrl'))
    expect(body.indexOf('shouldPushReadLanguageUrl')).toBeLessThan(body.indexOf('pushReadLanguageUrl'))
    expect(body.indexOf('catalogScopeAfterTextLanguagePick')).toBeLessThan(
      body.indexOf('textModeMismatchFromCache')
    )
    expect(body).toContain('textModeMismatchFromCache')
    expect(body).toContain("clearReadPanelsForLanguageSwitch(helpsLanguageCode ?? undefined, 'panel-1')")
    expect(body).toContain("catalogLoadForSinglePanel(useReadPanelStore.getState().panels, 'panel-2')")
    expect(body).toContain('markCatalogSettled')
    const mismatchAt = body.indexOf('textModeMismatchFromCache')
    const mismatchReturn = body.indexOf('return', mismatchAt)
    expect(mismatchReturn).toBeGreaterThan(mismatchAt)
    expect(mismatchReturn).toBeLessThan(body.indexOf('coldStartCatalogLoads'))
    expect(body.indexOf("catalogLoadForSinglePanel(useReadPanelStore.getState().panels, 'panel-2')")).toBeGreaterThan(
      mismatchAt
    )
    expect(body.indexOf("catalogLoadForSinglePanel(useReadPanelStore.getState().panels, 'panel-2')")).toBeLessThan(
      mismatchReturn
    )
  })

  test('helps picker path does not apply text-language pick navigation', () => {
    const helps = src.slice(src.indexOf('const handleHelpsLanguageSelected'))
    expect(helps).toContain('writePersistedHelpsLanguage')
    expect(helps).toContain("handlePanelLanguageSelected('panel-2'")
    expect(helps).not.toContain('resolveTextLanguagePickNavigation')
    expect(helps).not.toContain('applyTextLanguagePickNavigation')
    expect(helps).not.toContain('pushReadLanguageUrl')
  })

  test('per-panel language change never seeds the other panel', () => {
    const panel = src.slice(src.indexOf('const handlePanelLanguageSelected'))
    const body = panel.slice(0, panel.indexOf('const handlePanelModeSwitch'))
    expect(body).toContain('setPanelLanguage(panelId, canonicalReadLanguageCode(languageCode))')
    expect(body).toContain('catalogLoadForSinglePanel')
    expect(body).not.toContain('seedBothLanguages')
    expect(body).not.toContain('pushReadLanguageUrl')
  })

  test('empty pane inherits the other pane language then loads that pane catalog', () => {
    expect(src).toContain('inheritEmptyLanguage')
    expect(src).toContain('catalogLoadForSinglePanel')
    const handler = src.slice(src.indexOf('const handleLanguageSelected'))
    const body = handler.slice(0, handler.indexOf('const { handleSwitchTextMode'))
    expect(body.indexOf('inheritEmptyLanguage()')).toBeLessThan(body.indexOf('coldStartCatalogLoads'))
  })

  test('URL/session hydrate applies path language then inherit before catalog load', () => {
    expect(src).toContain('resolveReadLanguageFromUrlOrCache')
    expect(src).toContain('hydrateLanguagesFromHint')
    expect(src).toContain('canonicalReadLanguageCode')
    expect(src).not.toContain('resolveColdStartReadLanguage')
    expect(src).not.toContain('shouldDeferLanguageCatalogLoad')
    const urlEffect = src.slice(src.lastIndexOf('const pathname = typeof window'))
    expect(urlEffect.indexOf('hydrateLanguagesFromHint(lang)')).toBeLessThan(
      urlEffect.indexOf('handleLanguageSelected(lang)')
    )
  })

  test('cold-start catalog loads run in parallel so helps does not wait on scripture', () => {
    const handler = src.slice(src.indexOf('const handleLanguageSelected'))
    const body = handler.slice(0, handler.indexOf('const { handleSwitchTextMode'))
    expect(body).toContain('coldStartCatalogLoads')
    expect(body).toContain('Promise.all')
    expect(body).toContain('runCatalogLoad')
  })

  test('catalog load receives the resolved Bible/OBS scope', () => {
    expect(src).toContain('useReadCatalogLoad')
    expect(src).toContain('navigationScope: scope')
    const loadSrc = readFileSync(join(import.meta.dir, 'useReadCatalogLoad.ts'), 'utf8')
    expect(loadSrc).toContain('navigationScope: options.navigationScope')
    expect(loadSrc).toContain('loadReadLanguageCatalog')
    expect(loadSrc).toContain('destPanelId')
    expect(loadSrc).toContain('destPanelsForCatalogLoad')
    expect(loadSrc).toContain('isLoadingByPanel')
    expect(loadSrc).toContain('markCatalogSettled')
  })

  test('explicit switch and BCV commit go through useReadTextModeSwitch', () => {
    expect(src).toContain('useReadTextModeSwitch')
    expect(src).toContain('handleSwitchTextMode')
    expect(src).toContain('handleNavigatorScopeCommitted')
    expect(src).toContain('resolveCatalogNavigationScope')
    expect(src).toContain('explicitScope: options?.navigationScope')
  })

  test('download isolation uses both panel languages, not one shared scripture lang', () => {
    expect(src).toContain('shouldCancelDownloadsOnPaneSwitch')
    expect(src).toContain("downloadResetToken(panels['panel-1'].languageCode, panels['panel-2'].languageCode)")
  })
})
