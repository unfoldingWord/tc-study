/**
 * Catalog search → Phase 1 panel hydrate → Phase 2 metadata + collection save.
 * Extracted from useReadLanguageBootstrap so the hook stays a thin orchestrator.
 *
 * Text language and helps language load independently (issue #24). CombinedHelps
 * always uses `helpsLanguageCode`. UGNT/UHB stay on the text side.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { isOriginalLanguageResource } from '../../utils/resourceHelpers'
import { useNavigationStore } from '../nav/navigationStore'
import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import { narrowExpectedToCataloged } from './catalogBackgroundDownloadPolicy'
import {
  clearReadPanelsForLanguageSwitch,
  panelClearTargetForLoad,
  shouldReconcileHelpsOnPanelClear,
} from './clearReadPanelsForLanguageSwitch'
import { hydrateOriginalLanguageResources } from './hydrateOriginalLanguageResources'
import { hydrateReadCatalogHits } from './hydrateReadCatalogHits'
import { collectCatalogMetadataPromises } from './hydrateReadCatalogMetadata'
import { catalogTargetsForLoad, type CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { ReadPanelId } from './readPanelModel'
import { searchCatalogHitsForTarget } from './readCatalogSearch'
import {
  mergeExpectedResourceKeys,
  shouldHydrateOriginalLanguages,
} from './readLanguageLoadPlan'

export interface LoadReadLanguageCatalogDeps {
  textLanguageCode: string
  helpsLanguageCode: string
  loadTarget: CatalogLoadTarget
  /** Single-panel load so two scripture panes do not share one dest. */
  destPanelId?: ReadPanelId
  navigationScope: string
  existingTextKeys?: string[]
  existingHelpsKeys?: string[]
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  viewerRegistry: { hasViewer: (typeId: string) => boolean }
  getPanel: (panelId: string) => { resourceKeys: string[] } | undefined
  addResource: (
    resource: ResourceInfo,
    options?: { panelId?: string; index?: number; allowMultipleInstances?: boolean }
  ) => void
  setActiveResourceInPanel: (panelId: string, index: number) => void
  setExpectedResources: (keys: string[]) => void
  onMetadataBatch: (count: number) => void
}

export interface LoadReadLanguageCatalogResult {
  textKeys: string[]
  helpsKeys: string[]
}

function activateGatewayScriptureTab(deps: {
  getPanel: LoadReadLanguageCatalogDeps['getPanel']
  setActiveResourceInPanel: LoadReadLanguageCatalogDeps['setActiveResourceInPanel']
  destPanelId?: ReadPanelId
}): void {
  const dest = deps.destPanelId ?? 'panel-1'
  const panel1After = deps.getPanel(dest)
  const pkgAfter = useWorkspaceStore.getState().currentPackage
  if (!panel1After || !pkgAfter) return
  const gatewayIdx = panel1After.resourceKeys.findIndex((key) => {
    const r = pkgAfter.resources.get(key) || pkgAfter.resources.get(key.replace(/#\d+$/, ''))
    if (!r) return false
    const type = String(r.type || '')
    if (type !== 'scripture' && type !== 'obs') return false
    const lang = String(r.languageCode || r.language || '')
    return !isOriginalLanguageResource(lang, r.subject || '')
  })
  if (gatewayIdx >= 0) {
    deps.setActiveResourceInPanel(dest, gatewayIdx)
  }
}

/**
 * Load catalog resources for text and/or helps language into workspace + panels,
 * then hydrate metadata and save `*_tc-helps` collection(s) in the background.
 *
 * Text (and Bible helps) use `topic=tc-ready`. OBS helps search prod OBS TN/TWL
 * subjects without requiring `topic=tc-ready`. CombinedHelps binds to
 * `helpsLanguageCode`.
 */
export async function loadReadLanguageCatalog(
  deps: LoadReadLanguageCatalogDeps
): Promise<LoadReadLanguageCatalogResult> {
  const {
    textLanguageCode,
    helpsLanguageCode,
    loadTarget,
    destPanelId,
    navigationScope,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
    getPanel,
    addResource,
    setActiveResourceInPanel,
    setExpectedResources,
    onMetadataBatch,
  } = deps
  const existingTextKeys = deps.existingTextKeys ?? []
  const existingHelpsKeys = deps.existingHelpsKeys ?? []

  const startExpected = mergeExpectedResourceKeys({
    loadTarget,
    existingTextKeys,
    existingHelpsKeys,
    nextTextKeys: [],
    nextHelpsKeys: [],
  })
  setExpectedResources([...startExpected.textKeys, ...startExpected.helpsKeys])

  const panelTarget = panelClearTargetForLoad(loadTarget, destPanelId)
  clearReadPanelsForLanguageSwitch(helpsLanguageCode, panelTarget, {
    reconcileHelps: shouldReconcileHelpsOnPanelClear(loadTarget, panelTarget),
  })

  const door43Client = getDoor43ApiClient()
  const searches =
    destPanelId && loadTarget !== 'both'
      ? [
          {
            languageCode: loadTarget === 'helps' ? helpsLanguageCode : textLanguageCode,
            target: loadTarget,
          },
        ]
      : catalogTargetsForLoad({ textLanguageCode, helpsLanguageCode, loadTarget })
  const nextTextKeys: string[] = []
  const nextHelpsKeys: string[] = []
  const metadataPromises: Array<Promise<ResourceInfo | null>> = []

  for (const search of searches) {
    const pages = await searchCatalogHitsForTarget(door43Client, {
      languageCode: search.languageCode,
      target: search.target,
      navigationScope,
    })

    if (pages.every((page) => page.catalogResults.length === 0)) {
      console.warn(
        `⚠️ No catalog results for ${search.languageCode} (${search.target}, scope=${navigationScope}).`
      )
    }

    for (const page of pages) {
      const hitDest =
        destPanelId ??
        (page.hydrateTarget === 'helps'
          ? 'panel-2'
          : page.hydrateTarget === 'text'
            ? 'panel-1'
            : undefined)
      const hydrated = hydrateReadCatalogHits({
        catalogResults: page.catalogResults,
        languageCode: search.languageCode,
        target: page.hydrateTarget,
        destPanelId: hitDest,
        resourceTypeRegistry,
        viewerRegistry,
        getPanel,
        addResource,
        setActiveResourceInPanel,
      })
      nextTextKeys.push(...hydrated.expectedTextKeys)
      nextHelpsKeys.push(...hydrated.expectedHelpsKeys)
      metadataPromises.push(
        ...collectCatalogMetadataPromises({
          catalogResults: page.catalogResults,
          languageCode: search.languageCode,
          target: page.hydrateTarget,
          destPanelId: hitDest,
          catalogManager,
          resourceTypeRegistry,
          viewerRegistry,
        })
      )
    }
  }

  if (shouldHydrateOriginalLanguages(loadTarget)) {
    const orig = hydrateOriginalLanguageResources({
      catalogManager,
      resourceTypeRegistry,
      destPanelId: destPanelId ?? 'panel-1',
      currentBook: useNavigationStore.getState().currentReference.book,
    })
    nextTextKeys.push(...orig.loadedKeys)
    metadataPromises.push(...orig.metadataPromises)
  }

  // CombinedHelps after GL + UGNT/UHB hydrate so original-lang adds cannot clobber
  // the gateway TN/TWL pair selected for `helpsLanguageCode`.
  if (destPanelId && loadTarget === 'text') {
    /* scripture-only into one panel — do not inject CombinedHelps onto that panel */
  } else if (destPanelId) {
    applyCombinedHelpsEnsure(helpsLanguageCode, destPanelId)
  } else {
    applyCombinedHelpsEnsure(helpsLanguageCode)
  }

  if (loadTarget !== 'helps') {
    activateGatewayScriptureTab({ getPanel, setActiveResourceInPanel, destPanelId })
  }

  const merged = mergeExpectedResourceKeys({
    loadTarget,
    existingTextKeys,
    existingHelpsKeys,
    nextTextKeys,
    nextHelpsKeys,
  })
  setExpectedResources([...merged.textKeys, ...merged.helpsKeys])
  // Skip-if-base-key hydrate still leaves instance ids on the dest panel —
  // re-project so `ult#2` / `ugnt#2` exist in the AppStore read model.
  projectCurrentWorkspacePanels()

  const collectionLangs = [...new Set(searches.map((s) => s.languageCode))]

  void Promise.allSettled(metadataPromises).then(async (results) => {
    const toAdd: ResourceInfo[] = []
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        toAdd.push(result.value)
      }
    }
    if (toAdd.length > 0) {
      useAppStore.getState().patchLoadedResources(toAdd)
    }

    try {
      const keysInCatalog = await catalogManager.getAllResourceKeys()
      setExpectedResources(
        narrowExpectedToCataloged([...merged.textKeys, ...merged.helpsKeys], keysInCatalog)
      )
    } catch (error) {
      console.warn(
        `⚠️ Failed to narrow expected resources for ${textLanguageCode}|${helpsLanguageCode}:`,
        error
      )
    }

    onMetadataBatch(Math.max(toAdd.length, 1))

    for (const lang of collectionLangs) {
      try {
        const collectionName = `${lang}_tc-helps`
        await useWorkspaceStore.getState().saveAsCollection(collectionName, `Translation helps for ${lang}`)
      } catch (error) {
        console.error(`❌ Failed to create collection for ${lang}:`, error)
      }
    }
  })

  return merged
}
