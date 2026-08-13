import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panelSrc = readFileSync(join(import.meta.dir, 'ReadLinkedPanel.tsx'), 'utf8')
const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
const headerSrc = readFileSync(
  join(import.meta.dir, '../studio/PanelHeader.tsx'),
  'utf8'
)

describe('helps picker wiring (issue #24)', () => {
  test('panel-2 chrome hosts helps LanguagePicker; empty CTA opens it', () => {
    expect(panelSrc).toContain('listMode="helps"')
    expect(panelSrc).toContain('helpsFlag={helpsFlag}')
    expect(panelSrc).toContain('helpsFlagForNavigationScope')
    expect(panelSrc).toContain('open={helpsPickerOpen}')
    expect(panelSrc).toContain('onOpenChange={setHelpsPickerOpen}')
    expect(panelSrc).toContain('onLanguageSelected={onHelpsLanguageSelected}')
    expect(panelSrc).toContain('onMessageClick')
    expect(panelSrc).toContain('setHelpsPickerOpen(true)')
    expect(panelSrc).toContain('panelId === \'panel-2\'')
  })

  test('helps LanguagePicker is trailing headerActions, not a left tab sibling', () => {
    expect(panelSrc).toContain('headerActions=')
    const barStart = headerSrc.indexOf('gap-chrome-tight min-w-0 w-full h-full')
    const tabsIdx = headerSrc.indexOf('<ResourceTabs', barStart)
    const trailingIdx = headerSrc.indexOf('ml-auto', barStart)
    const actionsIdx = headerSrc.indexOf('{headerActions}', trailingIdx)
    expect(tabsIdx).toBeGreaterThan(barStart)
    expect(trailingIdx).toBeGreaterThan(tabsIdx)
    expect(actionsIdx).toBeGreaterThan(trailingIdx)
    expect(headerSrc.slice(barStart, tabsIdx)).not.toContain('{headerActions')
  })

  test('SimplifiedReadView wires handleHelpsLanguageSelected only to panel-2', () => {
    expect(viewSrc).toContain('handleHelpsLanguageSelected')
    expect(viewSrc).toContain('onHelpsLanguageSelected={handleHelpsLanguageSelected}')
    expect(viewSrc).toContain('onLanguageSelected={handleLanguageSelected}')
    expect(viewSrc).not.toContain('onLanguageSelected={handleHelpsLanguageSelected}')
    expect(viewSrc).not.toContain('listMode=')
  })
})
