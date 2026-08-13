import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('useReadLanguageBootstrap (split text vs helps)', () => {
  const src = readFileSync(join(import.meta.dir, 'useReadLanguageBootstrap.ts'), 'utf8')

  test('exposes separate text and helps handlers plus split loading flags', () => {
    expect(src).toContain('handleLanguageSelected')
    expect(src).toContain('handleHelpsLanguageSelected')
    expect(src).toContain('isLoadingTextResources')
    expect(src).toContain('isLoadingHelpsResources')
    expect(src).toContain('helpsLanguageCode')
  })

  test('URL stays on text language; helps persist into the actual load', () => {
    expect(src).toContain('pushReadLanguageUrl(navigate, languageCode)')
    expect(src).toContain('writePersistedHelpsLanguage')
    expect(src).toContain('resolveAndPersistHelpsLanguage')
    expect(src).toContain('resolveReadCatalogLoadPlan')
  })

  test('OBS-only / Bible-only text pick switches scope before the URL write', () => {
    const handler = src.slice(src.indexOf('const handleLanguageSelected'))
    const body = handler.slice(0, handler.indexOf('const { handleSwitchTextMode'))
    expect(body).toContain('resolveTextLanguagePickNavigation')
    expect(body).toContain('applyTextLanguagePickNavigation')
    expect(body.indexOf('applyTextLanguagePickNavigation')).toBeLessThan(body.indexOf('pushReadLanguageUrl'))
    expect(body.indexOf('catalogScopeAfterTextLanguagePick')).toBeLessThan(
      body.indexOf('textModeMismatchFromCache')
    )
    expect(body).toContain('textModeMismatchFromCache')
    expect(body).toContain("clearReadPanelsForLanguageSwitch(helpsLanguageCode ?? undefined, 'panel-1')")
    expect(body).not.toContain('writePersistedHelpsLanguage')
    expect(body).toContain('resolveAndPersistHelpsLanguage')
  })

  test('helps picker path does not apply text-language pick navigation', () => {
    const helps = src.slice(src.indexOf('const handleHelpsLanguageSelected'))
    expect(helps).toContain('writePersistedHelpsLanguage')
    expect(helps).not.toContain('resolveTextLanguagePickNavigation')
    expect(helps).not.toContain('applyTextLanguagePickNavigation')
    expect(helps).not.toContain('pushReadLanguageUrl')
    expect(helps).toContain('navigationScope')
  })

  test('catalog load receives the resolved Bible/OBS scope', () => {
    expect(src).toContain('useReadCatalogLoad')
    expect(src).toContain('navigationScope: scope')
    const loadSrc = readFileSync(join(import.meta.dir, 'useReadCatalogLoad.ts'), 'utf8')
    expect(loadSrc).toContain('navigationScope: options.navigationScope')
    expect(loadSrc).toContain('loadReadLanguageCatalog')
  })

  test('explicit switch and BCV commit go through useReadTextModeSwitch', () => {
    expect(src).toContain('useReadTextModeSwitch')
    expect(src).toContain('handleSwitchTextMode')
    expect(src).toContain('handleNavigatorScopeCommitted')
    expect(src).toContain('resolveCatalogNavigationScope')
    expect(src).toContain('explicitScope: options?.navigationScope')
  })

  test('download isolation uses shouldCancelDownloadsOnPaneSwitch and downloadResetToken', () => {
    expect(src).toContain('shouldCancelDownloadsOnPaneSwitch')
    expect(src).toContain('downloadResetToken(currentLanguageCode, helpsLanguageCode)')
  })
})
