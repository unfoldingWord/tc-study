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

  test('text-mode mismatch skips catalog load and does not auto-switch scope', () => {
    expect(src).toContain('textModeMismatchFromCache')
    expect(src).toContain("clearReadPanelsForLanguageSwitch(helpsLanguageCode ?? undefined, 'panel-1')")
    expect(src).not.toMatch(/handleLanguageSelected[\s\S]*setNavigationScope/)
  })

  test('explicit switch uses nav scope APIs and does not call handleHelpsLanguageSelected', () => {
    expect(src).toContain('handleSwitchTextMode')
    expect(src).toContain('applyTextModeScopeSwitch')
    expect(src).toContain('void handleLanguageSelected(code)')
    const switchFn = src.slice(src.indexOf('const handleSwitchTextMode'))
    const switchBody = switchFn.slice(0, switchFn.indexOf('const handleHelpsLanguageSelected'))
    expect(switchBody).toContain('applyTextModeScopeSwitch')
    expect(switchBody).not.toContain('handleHelpsLanguageSelected')
  })

  test('download isolation uses shouldCancelDownloadsOnPaneSwitch and downloadResetToken', () => {
    expect(src).toContain('shouldCancelDownloadsOnPaneSwitch')
    expect(src).toContain('downloadResetToken(currentLanguageCode, helpsLanguageCode)')
  })
})
