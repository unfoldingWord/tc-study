import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useReadLanguageBootstrap (split text vs helps)', () => {
  const src = readFileSync(join(import.meta.dir, 'useReadLanguageBootstrap.ts'), 'utf8')

  test('subscribes via loadedResourcesMembershipKey, not the raw loadedResources object', () => {
    expect(src).toContain('loadedResourcesMembershipKey')
    expect(src).not.toMatch(/useAppStore\(\(s\)\s*=>\s*s\.loadedResources\)/)
  })

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
    expect(src).toContain('replaceReadLanguageUrlFromUi')
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
    expect(body.indexOf('shouldPushReadLanguageUrl')).toBeLessThan(body.indexOf('replaceReadLanguageUrlFromUi'))
    expect(body.indexOf('catalogScopeAfterTextLanguagePick')).toBeLessThan(
      body.indexOf('skipTextCatalogOnMismatch')
    )
    expect(body).toContain('skipTextCatalogOnMismatch')
    expect(body).toContain("panelId: 'panel-1'")
    expect(body).toContain("catalogLoadForSinglePanel(useReadPanelStore.getState().panels, 'panel-2')")
    expect(body).toContain('markCatalogSettled')
    const mismatchAt = body.indexOf('skipTextCatalogOnMismatch')
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
    const panelSrc = readFileSync(join(import.meta.dir, 'useReadPanelLanguageHandlers.ts'), 'utf8')
    const helps = panelSrc.slice(panelSrc.indexOf('const handleHelpsLanguageSelected'))
    expect(helps).toContain('writePersistedHelpsLanguage')
    expect(helps).toContain("handlePanelLanguageSelected('panel-2'")
    expect(helps).not.toContain('resolveTextLanguagePickNavigation')
    expect(helps).not.toContain('applyTextLanguagePickNavigation')
    expect(helps).not.toContain('handleLanguageSelected')
  })

  test('per-panel language change never seeds the other panel', () => {
    expect(src).toContain('useReadPanelLanguageHandlers')
    const panelSrc = readFileSync(join(import.meta.dir, 'useReadPanelLanguageHandlers.ts'), 'utf8')
    const panel = panelSrc.slice(panelSrc.indexOf('const handlePanelLanguageSelected'))
    const body = panel.slice(0, panel.indexOf('const handlePanelModeSwitch'))
    expect(body).toContain('setPanelLanguage(panelId, resolvedCode)')
    expect(body).toContain('readUrlLangsFromPanels')
    expect(body).toContain('replaceReadLanguageUrlFromUi')
    expect(body).not.toContain("if (panel.mode === 'scripture')")
    expect(body.indexOf('readUrlLangsFromPanels')).toBeLessThan(body.indexOf('skipTextCatalogOnMismatch'))
    expect(body).toContain('skipTextCatalogOnMismatch')
    expect(body).toContain("panel.mode === 'scripture'")
    expect(body).toContain('catalogLoadForSinglePanel')
    expect(body).not.toContain('seedBothLanguages')
    expect(body).not.toContain('handleLanguageSelected')
    expect(body).not.toContain('hydrateLanguagesFromUrl')
  })

  test('empty pane inherits the other pane language then loads that pane catalog', () => {
    expect(src).toContain('inheritEmptyLanguage')
    expect(src).toContain('catalogLoadForSinglePanel')
    const handler = src.slice(src.indexOf('const handleLanguageSelected'))
    const body = handler.slice(0, handler.indexOf('const { handleSwitchTextMode'))
    expect(body.indexOf('inheritEmptyLanguage()')).toBeLessThan(body.indexOf('coldStartCatalogLoads'))
  })

  test('URL/session hydrate applies path language then inherit before catalog load', () => {
    expect(src).toContain('useReadUrlLanguageHydrate')
    expect(src).toContain('canonicalReadLanguageCode')
    expect(src).not.toContain('resolveColdStartReadLanguage')
    expect(src).not.toContain('shouldDeferLanguageCatalogLoad')
    const hydrate = readFileSync(join(import.meta.dir, 'useReadUrlLanguageHydrate.ts'), 'utf8')
    expect(hydrate).toContain('hydrateLanguagesFromUrl')
    expect(hydrate).toContain('shouldHydrateReadLanguages')
    expect(hydrate.indexOf('hydrateLanguagesFromUrl')).toBeLessThan(hydrate.indexOf('handleLanguageSelected(lang)'))
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
    expect(loadSrc).toContain('shouldSkipHelpsCatalogLoad')
    expect(loadSrc).toContain('shouldSkipTextCatalogForMismatch')
    expect(loadSrc).toContain('reconcileHelps: false')
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
    expect(src).toContain('isBackgroundDownloading')
    expect(src).toContain('!isCatalogLoadBusy || isBackgroundDownloading')
  })

  test('mode switch does not cancel or reseed the download queue', () => {
    const panelSrc = readFileSync(join(import.meta.dir, 'useReadPanelLanguageHandlers.ts'), 'utf8')
    const mode = panelSrc.slice(panelSrc.indexOf('const handlePanelModeSwitch'))
    expect(mode).toContain('shouldLoadCatalogOnModeSwitch')
    expect(mode).toContain('applyReadModeMembership')
    expect(mode).toContain('packageHasHelpsCatalogTypes')
    expect(mode).toContain('helpsCatalogTypeIds')
    expect(mode).toContain('helpsCatalogPaneTypeIds')
    expect(mode).toContain('resolveHelpsCatalogScope')
    expect(mode).toContain('navigationScope: helpsScope')
    expect(mode).toContain('resetCatalogSettled')
    expect(mode).toContain('skipPanelClear: true')
    expect(mode).not.toContain('maybeCancelDownloads')
    expect(mode).not.toContain('stopDownload')
    expect(mode).not.toContain('coldStartCatalogLoads')
    expect(mode).not.toContain('hydrateLanguagesFromUrl')
  })
})
