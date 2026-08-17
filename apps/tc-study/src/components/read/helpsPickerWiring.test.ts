import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panelSrc = readFileSync(join(import.meta.dir, 'ReadLinkedPanel.tsx'), 'utf8')
const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
const headerSrc = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')

describe('helps picker wiring (issue #24 / #30)', () => {
  test('helps-mode chrome hosts LanguagePicker; empty CTA opens it', () => {
    expect(panelSrc).toContain("languageListMode={isHelps ? 'helps' : 'text'}")
    expect(panelSrc).toContain('helpsFlag={isHelps ? helpsFlag : undefined}')
    expect(panelSrc).toContain('helpsFlagForNavigationScope')
    expect(panelSrc).toContain('onLanguageSelected={onLanguageSelected}')
    expect(panelSrc).toContain('emptyPanelSelectLanguageCta(languageCode)')
    expect(panelSrc).toContain(
      'onMessageClick={isHelps && selectLanguageCta ? () => setPickerOpen(true) : undefined}'
    )
  })

  test('LanguagePicker is trailing header chrome, not a left tab sibling', () => {
    expect(headerSrc).toContain('<LanguagePicker')
    const barStart = headerSrc.indexOf('gap-chrome-tight min-w-0 w-full h-full')
    const tabsIdx = headerSrc.indexOf('<ResourceTabs', barStart)
    const trailingIdx = headerSrc.indexOf('ml-auto', barStart)
    const pickerIdx = headerSrc.indexOf('<LanguagePicker', trailingIdx)
    expect(tabsIdx).toBeGreaterThan(barStart)
    expect(trailingIdx).toBeGreaterThan(tabsIdx)
    expect(pickerIdx).toBeGreaterThan(trailingIdx)
  })

  test('SimplifiedReadView wires per-panel language, not a shared scripture store', () => {
    expect(viewSrc).toContain('handlePanelLanguageSelected')
    expect(viewSrc).toContain('onPanelLanguageSelected={handlePanelLanguageSelected}')
    expect(viewSrc).toContain('onLanguageSelected={handleLanguageSelected}')
    expect(viewSrc).not.toContain('listMode=')
  })
})
