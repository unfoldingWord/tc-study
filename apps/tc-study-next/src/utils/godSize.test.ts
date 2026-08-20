/**
 * ARCH-FREEZE (non-behavioral): LOC / god-size budgets only.
 * Does not exercise product UI or data paths — see e2e/journeys for behavioral coverage.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..')

/** Soft slice budgets: current LOC + ~10% headroom (fail-closed constants, not live×1.1). */
function softMax(currentLoc: number): number {
  return Math.ceil((currentLoc * 11) / 10)
}

/** Hard from measured LOC — ~actual×1.15 (no softMax theater). */
function hardFromActual(currentLoc: number): number {
  return Math.ceil((currentLoc * 115) / 100)
}

function lineCount(relativePath: string): number {
  const src = readFileSync(join(SRC, relativePath), 'utf8')
  return src.split(/\r?\n/).length
}

/**
 * Hard LOC budgets for modules that already meet peel targets (fail-closed).
 */
const HARD_GODS: { name: string; path: string; hardMax: number }[] = [
  { name: 'workspaceStore', path: 'features/workspace/workspaceStore.ts', hardMax: 100 },
  { name: 'navigationStore', path: 'features/nav/navigationStore.ts', hardMax: 100 },
  { name: 'WordsLinksViewer', path: 'components/resources/WordsLinksViewer/index.tsx', hardMax: 400 },
  { name: 'TranslationNotesViewer', path: 'components/resources/TranslationNotesViewer/index.tsx', hardMax: 400 },
  { name: 'CombinedHelpsViewer', path: 'components/resources/CombinedHelpsViewer/index.tsx', hardMax: 400 },
  { name: 'SimplifiedReadView', path: 'components/read/SimplifiedReadView.tsx', hardMax: 400 },
  { name: 'useReadLanguageBootstrap', path: 'features/read/useReadLanguageBootstrap.ts', hardMax: 350 },
  // Chrome / studio shells (hard ≤400)
  { name: 'NavigationBar', path: 'components/studio/NavigationBar.tsx', hardMax: 400 },
  { name: 'LinkedPanelsStudio', path: 'components/studio/LinkedPanelsStudio.tsx', hardMax: 400 },
  { name: 'BCVNavigator', path: 'components/studio/BCVNavigator.tsx', hardMax: 400 },
  { name: 'AddToCatalogWizard', path: 'components/catalog/AddToCatalogWizard/index.tsx', hardMax: 400 },
  { name: 'ResourceSelectorStep', path: 'components/wizard/ResourceSelectorStep/index.tsx', hardMax: 400 },
  { name: 'ResourceLibrarySidebar', path: 'components/studio/ResourceLibrarySidebar.tsx', hardMax: 400 },
  { name: 'useResourceSelectorLoad', path: 'components/wizard/ResourceSelectorStep/useResourceSelectorLoad.ts', hardMax: 350 },
  // Signals facade (STATE in resource-panels; EVENT/docs split)
  { name: 'studioSignals', path: 'signals/studioSignals.ts', hardMax: 200 },
  // P2 residual peel — ObsViewer + Library hard ≤400
  { name: 'ObsViewer', path: 'components/resources/ObsViewer/ObsViewer.tsx', hardMax: 400 },
  { name: 'Library', path: 'pages/Library.tsx', hardMax: 400 },
  // P1 Round 2 — Studio DnD + BCV controller hard ≤350
  { name: 'useStudioDnD', path: 'features/studio/useStudioDnD.ts', hardMax: 350 },
  { name: 'useBcvNavigatorController', path: 'features/nav/useBcvNavigatorController.ts', hardMax: 350 },
  // Residual LOC peel — import dialog + data management hard ≤400
  { name: 'CollectionImportDialog', path: 'components/collections/CollectionImportDialog.tsx', hardMax: 400 },
  { name: 'DataManagement', path: 'pages/DataManagement.tsx', hardMax: 400 },
  // Easy-win wizard peels (also hard ≤400)
  { name: 'OriginalLanguageSelectorStep', path: 'components/wizard/OriginalLanguageSelectorStep.tsx', hardMax: 400 },
  { name: 'SimpleResourceWizard', path: 'components/wizard/SimpleResourceWizard.tsx', hardMax: 400 },
  // Near-gods already under hard threshold
  { name: 'LanguagePicker', path: 'components/LanguagePicker.tsx', hardMax: 400 },
  // Former softMax theater — fixed hard ~actual×1.15
  {
    name: 'catalogWizardActions',
    path: 'components/catalog/AddToCatalogWizard/catalogWizardActions.ts',
    hardMax: hardFromActual(308),
  },
  {
    name: 'resourceSelectorDeps',
    path: 'components/wizard/ResourceSelectorStep/resourceSelectorDeps.ts',
    hardMax: hardFromActual(213),
  },
  {
    name: 'loadReadLanguageCatalog',
    path: 'features/read/loadReadLanguageCatalog.ts',
    hardMax: hardFromActual(407),
  },
  {
    name: 'messageTypePlugins',
    path: 'plugins/messageTypePlugins.ts',
    hardMax: hardFromActual(406),
  },
  {
    name: 'TranslationWordsEntryViewer',
    path: 'components/entryViewers/TranslationWordsEntryViewer.tsx',
    hardMax: hardFromActual(443),
  },
]

/** Slice / sibling soft caps (≤300 store slices; ≤350 hooks). */
const NAV_SLICES: { name: string; path: string; currentLoc: number }[] = [
  { name: 'navigationBcvSlice', path: 'features/nav/navigationBcvSlice.ts', currentLoc: 171 },
  { name: 'navigationVerseChapterSlice', path: 'features/nav/navigationVerseChapterSlice.ts', currentLoc: 240 },
  { name: 'navigationHistorySlice', path: 'features/nav/navigationHistorySlice.ts', currentLoc: 58 },
  { name: 'navigationSectionSlice', path: 'features/nav/navigationSectionSlice.ts', currentLoc: 87 },
  { name: 'navigationPassageSlice', path: 'features/nav/navigationPassageSlice.ts', currentLoc: 83 },
  { name: 'navigationObsSlice', path: 'features/nav/navigationObsSlice.ts', currentLoc: 132 },
]

/** CombinedHelps signal hooks — hard ≤350. */
const HELPS_HOOKS_HARD: { name: string; path: string; hardMax: number }[] = [
  { name: 'useCombinedHelpsSignals', path: 'components/resources/CombinedHelpsViewer/useCombinedHelpsSignals.ts', hardMax: 350 },
  {
    name: 'useCombinedHelpsObsQuotesBroadcast',
    path: 'components/resources/CombinedHelpsViewer/useCombinedHelpsObsQuotesBroadcast.ts',
    hardMax: 350,
  },
  {
    name: 'useCombinedHelpsTokenGroupsBroadcast',
    path: 'components/resources/CombinedHelpsViewer/useCombinedHelpsTokenGroupsBroadcast.ts',
    hardMax: 350,
  },
  {
    name: 'useCombinedHelpsHandlers',
    path: 'components/resources/CombinedHelpsViewer/useCombinedHelpsHandlers.ts',
    hardMax: 350,
  },
]

const WORKSPACE_SLICES: { name: string; path: string; currentLoc: number }[] = [
  { name: 'workspacePackageSlice', path: 'features/workspace/workspacePackageSlice.ts', currentLoc: 129 },
  { name: 'workspacePanelSlice', path: 'features/workspace/workspacePanelSlice.ts', currentLoc: 82 },
  { name: 'workspaceResourceSlice', path: 'features/workspace/workspaceResourceSlice.ts', currentLoc: 275 },
  { name: 'workspacePersistence', path: 'features/workspace/workspacePersistence.ts', currentLoc: 144 },
  { name: 'workspaceCollectionHelpers', path: 'features/workspace/workspaceCollectionHelpers.ts', currentLoc: 161 },
  { name: 'workspaceTypes', path: 'features/workspace/workspaceTypes.ts', currentLoc: 125 },
]

describe('godSize (hard budgets)', () => {
  for (const god of HARD_GODS) {
    test(`${god.name} stays under hard budget (${god.hardMax})`, () => {
      const lines = lineCount(god.path)
      expect(lines).toBeLessThanOrEqual(god.hardMax)
    })
  }
})

describe('nav slices (soft ≤300+headroom)', () => {
  for (const slice of NAV_SLICES) {
    const max = Math.min(softMax(slice.currentLoc), 330)
    test(`${slice.name} stays under slice soft budget (${max})`, () => {
      const lines = lineCount(slice.path)
      expect(lines).toBeLessThanOrEqual(max)
    })
  }
})

describe('helps hooks (hard ≤350)', () => {
  for (const hook of HELPS_HOOKS_HARD) {
    test(`${hook.name} stays under hard hook budget (${hook.hardMax})`, () => {
      const lines = lineCount(hook.path)
      expect(lines).toBeLessThanOrEqual(hook.hardMax)
    })
  }
})

describe('workspace slices (soft ≤300+headroom)', () => {
  for (const slice of WORKSPACE_SLICES) {
    const max = Math.min(softMax(slice.currentLoc), 330)
    test(`${slice.name} stays under slice soft budget (${max})`, () => {
      const lines = lineCount(slice.path)
      expect(lines).toBeLessThanOrEqual(max)
    })
  }
})
