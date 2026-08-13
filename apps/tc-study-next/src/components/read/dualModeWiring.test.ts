import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
const panelSrc = readFileSync(join(import.meta.dir, 'ReadLinkedPanel.tsx'), 'utf8')
const areaSrc = readFileSync(join(import.meta.dir, 'ReadPanelsArea.tsx'), 'utf8')
const headerSrc = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')
const railSrc = readFileSync(join(import.meta.dir, 'ReadPanelRail.tsx'), 'utf8')
const bootstrapSrc = readFileSync(
  join(import.meta.dir, '../../features/read/useReadLanguageBootstrap.ts'),
  'utf8'
)
const modelSrc = readFileSync(
  join(import.meta.dir, '../../features/read/readPanelModel.ts'),
  'utf8'
)

describe('dual-mode Read wiring (#29–#33 + independence)', () => {
  test('#29 one bootstrap picker seeds both panels', () => {
    expect(bootstrapSrc).toContain('seedBothLanguages(languageCode)')
    expect(bootstrapSrc).toContain('canSeedBothPanelLanguages')
    expect(viewSrc).toContain('showLanguagePicker={showBootstrapPicker}')
    expect(viewSrc).toContain('needsBootstrap')
    expect(viewSrc).toContain('ReadPanelsArea')
    expect(modelSrc).toContain('applySeedBothLanguages')
    expect(modelSrc).toContain('shouldSeedBothPanelLanguages')
  })

  test('#30 per-panel language + mode switch; no Read ellipsis', () => {
    expect(headerSrc).not.toContain('Resource actions')
    expect(panelSrc).toContain('ReadPanelHeader')
    expect(panelSrc).not.toContain('from \'../studio/PanelHeader\'')
    expect(viewSrc).toContain('handlePanelLanguageSelected')
    expect(viewSrc).toContain('handlePanelModeSwitch')
    expect(areaSrc).toContain('onPanelLanguageSelected')
    expect(areaSrc).toContain('onPanelModeSwitch')
  })

  test('two scripture panels are not clones — per-panel languageCode is SoT', () => {
    expect(modelSrc).toContain('applyPanelLanguage')
    expect(modelSrc).toContain('catalogTargetsForPanelModels')
    expect(areaSrc).toContain('data-panel-1-language')
    expect(areaSrc).toContain('data-panel-2-language')
    expect(bootstrapSrc).toContain('catalogLoadForSinglePanel')
    expect(bootstrapSrc).toContain("downloadResetToken(panels['panel-1'].languageCode, panels['panel-2'].languageCode)")
    expect(viewSrc).not.toContain('textLanguageCode={currentLanguageCode}')
  })

  test('#31 one- vs two-panel layout control persists', () => {
    expect(viewSrc).toContain('ReadLayoutToggle')
    expect(viewSrc).toContain('defaultLayoutForViewport')
    expect(areaSrc).toContain("layout === 'two'")
  })

  test('#32 collapse stays mounted; rail expands', () => {
    expect(areaSrc).toContain('panelStayMountedStyle')
    expect(areaSrc).toContain('ReadPanelRail')
    expect(railSrc).toContain('Show other panel')
    expect(railSrc).toContain('RAIL_PX')
  })

  test('#33 reopen collapsed panel on cross-panel token', () => {
    expect(panelSrc).toContain('ReadCrossPanelReopen')
    expect(panelSrc).toContain('onReopenCollapsed')
  })
})
