import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('combinedHelpsGuards', () => {
  test('SimplifiedReadView does not runtime-register combined-helps viewer', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../components/read/SimplifiedReadView.tsx'),
      'utf8'
    )
    expect(src).not.toContain("registerViewer({")
    expect(src).not.toContain("resourceType: 'combined-helps'")
  })

  test('Read bootstrap uses shared ensure adapter (not inline inject)', () => {
    const catalogLoad = readFileSync(
      join(import.meta.dir, '../read/loadReadLanguageCatalog.ts'),
      'utf8'
    )
    expect(catalogLoad).toContain('applyCombinedHelpsEnsure')
    expect(catalogLoad).toContain("from '../helps/applyCombinedHelpsEnsure'")
    expect(catalogLoad).toContain('clearReadPanelsForLanguageSwitch')
    expect(catalogLoad).not.toContain('buildCombinedHelpsResourceInfo')
    expect(catalogLoad).not.toContain('shouldInjectCombinedHelps')
    expect(catalogLoad).not.toContain('findHelpsKeysForScope')
    // Must run after UGNT/UHB hydrate so original-lang adds cannot clobber GL helps
    const ensureAt = catalogLoad.indexOf('applyCombinedHelpsEnsure(helpsLanguageCode)')
    const ugntHydrateAt = catalogLoad.indexOf('hydrateOriginalLanguageResources')
    expect(ugntHydrateAt).toBeGreaterThan(-1)
    expect(ensureAt).toBeGreaterThan(ugntHydrateAt)
    // Atomic clear (not per-key remove) so English CombinedHelps cannot re-inject mid-switch
    expect(catalogLoad).not.toMatch(/removeResourceFromPanel\(/)
  })

  test('applyCombinedHelpsEnsure delegates to ensure + projector', () => {
    const apply = readFileSync(join(import.meta.dir, 'applyCombinedHelpsEnsure.ts'), 'utf8')
    expect(apply).toContain('ensureCombinedHelpsInWorkspace')
    expect(apply).toContain('useWorkspaceStore')
    expect(apply).toContain('projectCurrentWorkspacePanels')
    expect(apply).toContain('pruneKeys')
    expect(apply).not.toContain('useAppStore')
  })

  test('ensure does not unconditionally force panel-2 activeIndex onto CombinedHelps', () => {
    const ensure = readFileSync(join(import.meta.dir, 'ensureCombinedHelps.ts'), 'utf8')
    // Legacy clobber: if (scriptureIdx >= 0) panel2.activeIndex = scriptureIdx
    expect(ensure).not.toMatch(/activeIndex\s*=\s*scriptureIdx/)
    expect(ensure).not.toMatch(/activeIndex\s*=\s*obsIdx/)
    expect(ensure).toContain('resolvePanel2ActiveIndex')
    expect(ensure).toContain('applyDualScopeHelpsPolicy')
    expect(ensure).toContain('removed')
  })

  test('workspace membership mutations reconcile CombinedHelps (remove when TN/TWL drop)', () => {
    const slice = readFileSync(
      join(import.meta.dir, '../workspace/workspaceResourceSlice.ts'),
      'utf8'
    )
    expect(slice).toContain('reconcileCombinedHelps')
    expect(slice).toContain('ensureCombinedHelpsInWorkspace')
    expect(slice).toContain('gatewayLanguageHint')
    // remove + assign paths must reconcile (not only addResourceToPackage)
    expect(slice).toMatch(/removeResourceFromPackage:[\s\S]*reconcileCombinedHelps/)
    expect(slice).toMatch(/assignResourceToPanel:[\s\S]*reconcileCombinedHelps/)
    expect(slice).toMatch(/removeResourceFromPanel:[\s\S]*reconcileCombinedHelps/)
    // Text-pane scripture/OBS must not become the CombinedHelps language hint
    expect(slice).toContain("if (type === 'scripture' || type === 'obs') return undefined")
  })
})

