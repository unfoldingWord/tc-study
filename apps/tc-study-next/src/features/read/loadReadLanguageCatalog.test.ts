import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('loadReadLanguageCatalog (split text vs helps)', () => {
  const src = readFileSync(join(import.meta.dir, 'loadReadLanguageCatalog.ts'), 'utf8')

  test('accepts textLanguageCode, helpsLanguageCode, and loadTarget', () => {
    expect(src).toContain('textLanguageCode: string')
    expect(src).toContain('helpsLanguageCode: string')
    expect(src).toContain('loadTarget: CatalogLoadTarget')
    expect(src).toContain('catalogTargetsForLoad')
  })

  test('CombinedHelps uses helps language; UGNT/UHB stay on text side', () => {
    expect(src).toContain('applyCombinedHelpsEnsure(helpsLanguageCode)')
    expect(src).toContain('shouldHydrateOriginalLanguages(loadTarget)')
    expect(src).toContain('hydrateOriginalLanguageResources')
    expect(src).toContain('currentBook:')
    expect(src).not.toMatch(/applyCombinedHelpsEnsure\(textLanguageCode\)/)
  })

  test('OBS helps search is scoped via searchCatalogHitsForTarget (not a blanket tc-ready search)', () => {
    expect(src).toContain('searchCatalogHitsForTarget')
    expect(src).toContain('navigationScope')
    expect(src).not.toMatch(/topic:\s*'tc-ready'/)
    expect(src).toContain('page.hydrateTarget')
  })

  test('clears only the switched pane', () => {
    expect(src).toContain('panelClearTargetForLoad(loadTarget, destPanelId)')
    expect(src).toContain('shouldReconcileHelpsOnPanelClear')
    expect(src).toContain('clearReadPanelsForLanguageSwitch(helpsLanguageCode')
  })
})
