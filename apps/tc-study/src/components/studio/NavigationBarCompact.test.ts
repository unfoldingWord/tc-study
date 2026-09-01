import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const compactSrc = readFileSync(join(import.meta.dir, 'NavigationBarCompact.tsx'), 'utf8')
const menuSrc = readFileSync(join(import.meta.dir, 'NavigationBarMenu.tsx'), 'utf8')
const typeSrc = readFileSync(join(import.meta.dir, 'NavigationTypeSelector.tsx'), 'utf8')
const obsTypeSrc = readFileSync(join(import.meta.dir, 'ObsNavigationTypeSelector.tsx'), 'utf8')
const switchSrc = readFileSync(join(import.meta.dir, 'NavigationScopeSwitch.tsx'), 'utf8')
const barSrc = readFileSync(join(import.meta.dir, 'NavigationBar.tsx'), 'utf8')
const viewSrc = readFileSync(join(import.meta.dir, '../read/SimplifiedReadView.tsx'), 'utf8')
const readModeSrc = readFileSync(join(import.meta.dir, '../read/ReadModeSwitch.tsx'), 'utf8')

describe('NavigationBarCompact Bible/OBS vs grain', () => {
  test('center pill hosts Bible↔Stories click-to-toggle, not grain', () => {
    const pill = compactSrc.slice(
      compactSrc.indexOf('flex-1 flex items-center justify-center'),
      compactSrc.indexOf('{downloadIndicator}')
    )
    expect(pill).toContain('<NavigationScopeSwitch')
    expect(pill).toContain('scope={navigationScope}')
    expect(pill).toContain('onSwitch={handleScopeSwitch}')
    expect(pill).not.toContain('typeSelectorRef')
    expect(pill).not.toContain('NavigationTypeSelector')
    expect(pill).not.toContain('ReadModeSwitch')
  })

  test('grain selector lives in the hamburger menu, not beside Open menu', () => {
    const right = compactSrc.slice(compactSrc.indexOf('{downloadIndicator}'))
    expect(right).toContain('title={isMenuOpen ? \'Close menu\' : \'Open menu\'}')
    expect(right).toContain('<NavigationBarMenu')
    expect(right).toContain('isObs={currentRef.book === \'obs\'}')
    expect(right).not.toContain('typeSelectorRef')
    expect(right).not.toContain('title={`Navigation type: ${modeLabel}`}')
    expect(right).not.toContain('<NavigationTypeSelector')
    expect(right).not.toContain('<ObsNavigationTypeSelector')
    expect(menuSrc).toContain('variant="menu"')
    expect(menuSrc).toContain('<NavigationTypeSelector variant="menu"')
    expect(menuSrc).toContain('<ObsNavigationTypeSelector variant="menu"')
  })

  test('hamburger grain is one cycling current-mode button, not a 4-button row', () => {
    for (const src of [typeSrc, obsTypeSrc]) {
      const menuBranch = src.slice(src.indexOf("if (variant === 'menu')"), src.indexOf('const options ='))
      expect(menuBranch).toContain('nextNavigationMode')
      expect(menuBranch).toContain('Switch to')
      expect(menuBranch).toContain('setNavigationMode(nextMode)')
      expect(menuBranch).not.toContain('role="group"')
      expect(menuBranch).not.toContain('aria-pressed')
      expect(menuBranch.match(/<button/g)?.length).toBe(1)
    }
    expect(typeSrc).toContain('BIBLE_NAVIGATION_MODE_ORDER')
    expect(obsTypeSrc).toContain('OBS_NAVIGATION_MODE_ORDER')
    expect(typeSrc).not.toContain('aria-label="Navigation type"')
    expect(obsTypeSrc).not.toContain('aria-label="Navigation type"')
  })

  test('compact chrome stays mounted when books are empty (no disabled skeleton)', () => {
    const compactReturn = barSrc.slice(barSrc.indexOf('if (isCompact)'))
    expect(compactReturn).toContain('<NavigationBarCompact')
    expect(compactReturn.indexOf('<NavigationBarCompact')).toBeLessThan(
      compactReturn.indexOf('NavigationBarDisabled') === -1
        ? Number.POSITIVE_INFINITY
        : compactReturn.indexOf('NavigationBarDisabled')
    )
    expect(barSrc.indexOf('if (isCompact)')).toBeLessThan(barSrc.indexOf('if (!hasNavigationSource)'))
    expect(barSrc).toContain('isCompact={false}')
  })

  test('Bible/OBS tap uses handleSwitchTextMode, not panel scripture/helps', () => {
    expect(switchSrc).toContain('TEXT_MODE_MISMATCH_COPY.switchToStories')
    expect(switchSrc).toContain('TEXT_MODE_MISMATCH_COPY.switchToBible')
    expect(switchSrc).toContain('textKindIconForNavScope(scope)')
    expect(switchSrc).toContain('title={title}')
    expect(switchSrc).toContain('aria-label={title}')
    expect(switchSrc).not.toContain('ReadModeSwitch')
    expect(switchSrc).not.toContain('onModeSwitch')
    expect(switchSrc).not.toContain("nextMode === 'helps'")
    expect(compactSrc).toContain('onSwitchTextMode(scope)')
    expect(compactSrc).toContain('applyTextModeScopeSwitch')
    expect(barSrc).toContain('onSwitchTextMode={onSwitchTextMode}')
    expect(viewSrc).toContain('onSwitchTextMode={handleSwitchTextMode}')
    expect(readModeSrc).toContain('Show helps')
    expect(compactSrc).not.toContain('ReadModeSwitch')
  })
})
