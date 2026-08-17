import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panelSrc = readFileSync(join(import.meta.dir, 'ReadLinkedPanel.tsx'), 'utf8')
const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
const mismatchSrc = readFileSync(
  join(import.meta.dir, '../../features/read/textModeMismatch.ts'),
  'utf8'
)

describe('text-mode mismatch wiring (issue #25 / #30)', () => {
  test('scripture-mode empty state can show mismatch copy + switch action', () => {
    expect(panelSrc).toContain('textModeMismatch')
    expect(panelSrc).toContain('onSwitchTextMode')
    expect(panelSrc).toContain('scriptureMismatch')
    expect(panelSrc).toContain('actionLabel={scriptureMismatch.actionLabel')
    expect(panelSrc).toContain('actionShortLabel={scriptureMismatch.actionShortLabel')
    expect(panelSrc).toContain('emptyKind={scriptureMismatch.kind}')
    expect(panelSrc).toContain("mode === 'scripture'")
    expect(panelSrc).toContain('flex-1 min-h-0 overflow-auto bg-surface')
    expect(panelSrc.indexOf('scriptureMismatch ?')).toBeLessThan(panelSrc.indexOf('isLoadingResources ?'))
  })

  test('helps mode keeps the language empty CTA', () => {
    expect(panelSrc).toContain('onMessageClick')
    expect(panelSrc).toContain('setPickerOpen(true)')
    expect(panelSrc).toContain("mode === 'helps'")
  })

  test('SimplifiedReadView computes mismatch per scripture panel language', () => {
    expect(viewSrc).toContain('panel1Mismatch')
    expect(viewSrc).toContain('panel2Mismatch')
    expect(viewSrc).toContain('onSwitchTextMode={handleSwitchTextMode}')
    expect(viewSrc).toContain('onNavigationScopeCommitted={handleNavigatorScopeCommitted}')
    expect(viewSrc).toContain('handlePanelLanguageSelected')
    const areaSrc = readFileSync(join(import.meta.dir, 'ReadPanelsArea.tsx'), 'utf8')
    expect(areaSrc).toContain('isReadPanelCatalogSettled')
    expect(areaSrc).toContain('hasKnownMismatch: Boolean(panel1Mismatch)')
    expect(areaSrc).toContain('hasKnownMismatch: Boolean(panel2Mismatch)')
    expect(areaSrc).toContain('hasKnownNoHelps: panel1KnownNoHelps')
    expect(areaSrc).toContain('hasKnownNoHelps: panel2KnownNoHelps')
    expect(viewSrc).toContain('helpsCatalogKnownEmptyFromCache')
    expect(viewSrc).toContain('panel1KnownNoHelps')
    expect(viewSrc).toContain('panel2KnownNoHelps')
  })

  test('mismatch empty copy uses anglicized English names, not autonyms', () => {
    expect(mismatchSrc).toContain('languageEnglishCopyDisplayName')
  })
})
