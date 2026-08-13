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
import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { narrowExpectedToCataloged } from './catalogBackgroundDownloadPolicy'
import {
  clearReadPanelsForLanguageSwitch,
  panelClearTargetForLoad,
} from './clearReadPanelsForLanguageSwitch'
import { hydrateOriginalLanguageResources } from './hydrateOriginalLanguageResources'
import { hydrateReadCatalogHits } from './hydrateReadCatalogHits'
import { collectCatalogMetadataPromises } from './hydrateReadCatalogMetadata'
import { catalogTargetsForLoad, type CatalogLoadTarget } from './readCatalogPanelPolicy'
import {
  mergeExpectedResourceKeys,
  shouldHydrateOriginalLanguages,
} from './readLanguageLoadPlan'

export interface LoadReadLanguageCatalogDeps {
  textLanguageCode: string
  helpsLanguageCode: string
  loadTarget: CatalogLoadTarget
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
}): void {
  const panel1After = deps.getPanel('panel-1')
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
    deps.setActiveResourceInPanel('panel-1', gatewayIdx)
  }
}

/**
 * Load tc-ready catalog resources for text and/or helps language into workspace + panels,
 * then hydrate metadata and save `*_tc-helps` collection(s) in the background.
 */
export async function loadReadLanguageCatalog(
  deps: LoadReadLanguageCatalogDeps
): Promise<LoadReadLanguageCatalogResult> {
  const {
    textLanguageCode,
    helpsLanguageCode,
    loadTarget,
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

  clearReadPanelsForLanguageSwitch(helpsLanguageCode, panelClearTargetForLoad(loadTarget))

  const door43Client = getDoor43ApiClient()
  const searches = catalogTargetsForLoad({ textLanguageCode, helpsLanguageCode, loadTarget })
  const nextTextKeys: string[] = []
  const nextHelpsKeys: string[] = []
  const metadataPromises: Array<Promise<ResourceInfo | null>> = []

  for (const search of searches) {
    const catalogResults = await door43Client.searchCatalog({
      language: search.languageCode,
      topic: 'tc-ready',
      stage: 'prod' as const,
      limit: 500,
    })

    if (catalogResults.length === 0) {
      console.warn(
        '⚠️ No catalog results. The API may not support topic=tc-ready, or use a different topic value. Check the Network tab for the actual request (e.g. /api/v1/catalog/search?lang=...&topic=tc-ready&stage=prod&limit=500).'
      )
    }

    const hydrated = hydrateReadCatalogHits({
      catalogResults,
      languageCode: search.languageCode,
      target: search.target,
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
        catalogResults,
        languageCode: search.languageCode,
        target: search.target,
        catalogManager,
        resourceTypeRegistry,
        viewerRegistry,
      })
    )
  }

  if (shouldHydrateOriginalLanguages(loadTarget)) {
    const orig = hydrateOriginalLanguageResources({
      catalogManager,
      resourceTypeRegistry,
      getPanel,
      addResource,
    })
    nextTextKeys.push(...orig.loadedKeys)
    metadataPromises.push(...orig.metadataPromises)
  }

  // CombinedHelps after GL + UGNT/UHB hydrate so original-lang adds cannot clobber
  // the gateway TN/TWL pair selected for `helpsLanguageCode`.
  applyCombinedHelpsEnsure(helpsLanguageCode)

  if (loadTarget !== 'helps') {
    activateGatewayScriptureTab({ getPanel, setActiveResourceInPanel })
  }

  const merged = mergeExpectedResourceKeys({
    loadTarget,
    existingTextKeys,
    existingHelpsKeys,
    nextTextKeys,
    nextHelpsKeys,
  })
  setExpectedResources([...merged.textKeys, ...merged.helpsKeys])

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
