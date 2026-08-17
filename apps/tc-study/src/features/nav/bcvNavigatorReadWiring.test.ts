import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const viewSrc = readFileSync(
  join(import.meta.dir, '../../components/read/SimplifiedReadView.tsx'),
  'utf8'
)
const barSrc = readFileSync(join(import.meta.dir, '../../components/studio/NavigationBar.tsx'), 'utf8')
const compactSrc = readFileSync(
  join(import.meta.dir, '../../components/studio/NavigationBarCompact.tsx'),
  'utf8'
)
const bcvSrc = readFileSync(join(import.meta.dir, '../../components/studio/BCVNavigator.tsx'), 'utf8')
const controllerSrc = readFileSync(join(import.meta.dir, 'useBcvNavigatorController.ts'), 'utf8')
const bootstrapSrc = readFileSync(
  join(import.meta.dir, '../read/useReadLanguageBootstrap.ts'),
  'utf8'
)

describe('BCV navigator Read wiring (issue #25)', () => {
  test('text-language pick does not auto-switch; mismatch empty + Switch handle mode', () => {
    const handler = bootstrapSrc.slice(bootstrapSrc.indexOf('const handleLanguageSelected'))
    const body = handler.slice(0, handler.indexOf('const { handleSwitchTextMode'))
    expect(body).toContain('resolveTextLanguagePickNavigation')
    expect(body).toContain('applyTextLanguagePickNavigation')
    expect(body).toContain('skipTextCatalogOnMismatch')
    expect(body).not.toContain('handleHelpsLanguageSelected')
  })

  test('explicit BCV Bible/Stories apply reloads catalog and does not reset helps', () => {
    expect(viewSrc).toContain('onNavigationScopeCommitted={handleNavigatorScopeCommitted}')
    expect(barSrc).toContain('onNavigationScopeCommitted={onNavigationScopeCommitted}')
    expect(compactSrc).toContain('onNavigationScopeCommitted={onNavigationScopeCommitted}')
    expect(bcvSrc).toContain('onNavigationScopeCommitted')
    expect(controllerSrc).toContain('navigatorCommittedScope')
    expect(controllerSrc).toContain('onNavigationScopeCommitted?.(switched)')
    expect(controllerSrc).not.toContain('handleHelpsLanguageSelected')
    expect(controllerSrc).not.toContain('writePersistedHelpsLanguage')
  })
})
