import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panelSrc = readFileSync(join(import.meta.dir, 'ReadLinkedPanel.tsx'), 'utf8')
const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')

describe('text-mode mismatch wiring (issue #25)', () => {
  test('panel-1 empty state can show mismatch copy + switch action', () => {
    expect(panelSrc).toContain('textModeMismatch')
    expect(panelSrc).toContain('onSwitchTextMode')
    expect(panelSrc).toContain('panel1Mismatch')
    expect(panelSrc).toContain('actionLabel={panel1Mismatch?.actionLabel')
    expect(panelSrc).toContain("panelId === 'panel-1'")
  })

  test('panel-2 keeps the helps empty CTA from A2', () => {
    expect(panelSrc).toContain('onMessageClick')
    expect(panelSrc).toContain('setHelpsPickerOpen(true)')
    expect(panelSrc).toContain("panelId === 'panel-2'")
  })

  test('SimplifiedReadView wires mismatch only to panel-1', () => {
    expect(viewSrc).toContain('textModeMismatch={textPaneMismatch}')
    expect(viewSrc).toContain('onSwitchTextMode={handleSwitchTextMode}')
    expect(viewSrc).toContain('onNavigationScopeCommitted={handleNavigatorScopeCommitted}')
    expect(viewSrc).toContain('onHelpsLanguageSelected={handleHelpsLanguageSelected}')
    const areaStart = viewSrc.indexOf('function ReadPanelsArea')
    const areaEnd = viewSrc.indexOf('export function SimplifiedReadView')
    const area = viewSrc.slice(areaStart, areaEnd)
    const panel2 = area.slice(area.indexOf('panelId="panel-2"'), area.indexOf('EntryResourceModal'))
    expect(panel2).not.toContain('textModeMismatch=')
    expect(panel2).not.toContain('onSwitchTextMode=')
    expect(area.slice(area.indexOf('panelId="panel-1"'), area.indexOf('panelId="panel-2"'))).toContain(
      'textModeMismatch={textModeMismatch}'
    )
  })
})
