import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
const panelSrc = readFileSync(join(import.meta.dir, 'ReadLinkedPanel.tsx'), 'utf8')
const areaSrc = readFileSync(join(import.meta.dir, 'ReadPanelsArea.tsx'), 'utf8')
const headerSrc = readFileSync(join(import.meta.dir, 'ReadPanelHeader.tsx'), 'utf8')
const dividerSrc = readFileSync(join(import.meta.dir, '../shared/PanelResizeDivider.tsx'), 'utf8')
const hookSrc = readFileSync(
  join(import.meta.dir, '../../features/read/useReadPanelLayout.ts'),
  'utf8'
)
const resizeHookSrc = readFileSync(
  join(import.meta.dir, '../../features/read/useReadPanelResize.ts'),
  'utf8'
)
const collapseHookSrc = readFileSync(
  join(import.meta.dir, '../../features/read/useReadPanelCollapse.ts'),
  'utf8'
)
const cssSrc = readFileSync(join(import.meta.dir, '../../index.css'), 'utf8')
const bootstrapSrc = readFileSync(
  join(import.meta.dir, '../../features/read/useReadLanguageBootstrap.ts'),
  'utf8'
)
const modelSrc = readFileSync(
  join(import.meta.dir, '../../features/read/readPanelModel.ts'),
  'utf8'
)

describe('dual-mode Read wiring (#29–#33 + independence)', () => {
  test('#29 one bootstrap picker seeds both panels; cold-start is not dismissable', () => {
    expect(bootstrapSrc).toContain('seedBothLanguages(languageCode)')
    expect(bootstrapSrc).toContain('canSeedBothPanelLanguages')
    expect(viewSrc).toContain('showLanguagePicker={showBootstrapPicker}')
    expect(viewSrc).toContain('needsBootstrap')
    expect(viewSrc).toContain('languagePickerRequired={needsBootstrap}')
    expect(viewSrc).not.toContain('languagePickerRequired={false}')
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

  test('#31 one- vs two-panel: divider rail adds the second; no expand-left toggle', () => {
    expect(viewSrc).not.toContain('ReadLayoutToggle')
    expect(viewSrc).toContain('defaultLayoutForViewport')
    expect(viewSrc).toContain('restoreCollapsed')
    expect(areaSrc).toContain('restoreCollapsed')
    expect(hookSrc).toContain("setLayout('two', true)")
  })

  test('#32 collapse stays mounted; thicker collapsed divider with inward arrow', () => {
    expect(areaSrc).toContain('panelStayMountedStyle')
    expect(areaSrc).toContain('PanelResizeDivider')
    expect(areaSrc).not.toContain('ReadPanelRail')
    expect(areaSrc).toContain('collapsedDividerArrowDir')
    expect(dividerSrc).toContain('md:w-1.5')
    expect(dividerSrc).toContain('h-1.5')
    expect(dividerSrc).toContain('md:w-3')
    expect(dividerSrc).toContain('w-full h-3')
    expect(dividerSrc).toContain('bg-border')
    expect(dividerSrc).toContain('collapsedArrow')
    expect(dividerSrc).toContain('ChevronLeft')
    expect(dividerSrc).toContain('Show other panel')
    expect(dividerSrc).not.toContain('RAIL_PX')
    expect(hookSrc).toContain('restoreCollapsedDivider')
    expect(hookSrc).toContain('useReadPanelCollapse')
    expect(hookSrc).toContain('collapseTweenRange')
    expect(hookSrc).toContain('displayedSplitFromPointer')
    expect(hookSrc).toContain('prefersReducedMotion')
    expect(hookSrc).toContain('edgeSplitPercent')
    expect(resizeHookSrc).toContain('collapseDuringDrag')
    expect(resizeHookSrc).toContain('draggingRef')
    const handleMove = resizeHookSrc.slice(
      resizeHookSrc.indexOf('const handleMove'),
      resizeHookSrc.indexOf('const handleMouseMove')
    )
    expect(handleMove).toContain('collapseDuringDrag')
    expect(handleMove).toContain('endResize')
    expect(handleMove).not.toContain('mouseup')
    expect(handleMove).not.toContain('touchend')
    expect(areaSrc).not.toContain('useReadPanelCollapse')
    expect(areaSrc).not.toContain('styleFor')
    expect(areaSrc).not.toContain('layoutCollapsedPanelId')
    expect(areaSrc).not.toContain('translate3d')
    expect(panelSrc).toContain('read-panel-shell')
    expect(panelSrc).not.toContain('read-panel-sliding')
    expect(panelSrc).not.toContain('read-panel-shell-sliding')
    expect(headerSrc).toContain('read-panel-header')
    expect(headerSrc).not.toMatch(/className=\{`[^`]*transition/)
    expect(cssSrc).not.toContain('read-panel-shell-sliding')
    expect(cssSrc).not.toContain('isolation: isolate')
    expect(cssSrc).toContain('transition-property: none')
    expect(collapseHookSrc).toContain('prefers-reduced-motion')
    expect(collapseHookSrc).toContain('isResizingPanels')
    expect(collapseHookSrc).toContain('COLLAPSE_MOTION_MS')
    expect(collapseHookSrc).toContain('tweenSplitAt')
    expect(collapseHookSrc).not.toContain('translate3d')
    expect(collapseHookSrc).not.toContain('panelCollapseMotionStyle')
    expect(viewSrc.split('\n').length).toBeLessThan(400)
  })

  test('#33 reopen collapsed panel on cross-panel token', () => {
    expect(panelSrc).toContain('ReadCrossPanelReopen')
    expect(panelSrc).toContain('onReopenCollapsed')
  })
})
