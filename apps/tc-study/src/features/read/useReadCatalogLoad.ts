/**
 * Catalog load runner for Read — flags, expected keys, and loadReadLanguageCatalog.
 * Peeled from useReadLanguageBootstrap so the facade stays under god-size.
 */

import { useCallback, useRef, useState } from 'react'
import { useCatalogManager, useResourceTypeRegistry, useViewerRegistry } from '../../contexts'
import { useResourceManagement } from '../../hooks'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  loadReadLanguageCatalog,
  type LoadReadLanguageCatalogDeps,
} from './loadReadLanguageCatalog'
import { destPanelsForCatalogLoad } from './panelCatalogLoading'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { ReadPanelId } from './readPanelModel'

export interface RunReadCatalogLoadOptions {
  textLanguageCode: string
  helpsLanguageCode: string
  loadTarget: CatalogLoadTarget
  destPanelId?: ReadPanelId
  navigationScope: string
}

export function useReadCatalogLoad() {
  const catalogManager = useCatalogManager()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  const { addResource } = useResourceManagement()

  const [isLoadingTextResources, setIsLoadingTextResources] = useState(false)
  const [isLoadingHelpsResources, setIsLoadingHelpsResources] = useState(false)
  const [isLoadingByPanel, setIsLoadingByPanel] = useState<Record<ReadPanelId, boolean>>({
    'panel-1': false,
    'panel-2': false,
  })
  const [catalogSettledByPanel, setCatalogSettledByPanel] = useState<Record<ReadPanelId, boolean>>({
    'panel-1': false,
    'panel-2': false,
  })
  const [expectedResources, setExpectedResources] = useState<string[]>([])
  const [metadataUpdateCounter, setMetadataUpdateCounter] = useState(0)
  const textKeysRef = useRef<string[]>([])
  const helpsKeysRef = useRef<string[]>([])
  const inflightRef = useRef({ 'panel-1': 0, 'panel-2': 0, text: 0, helps: 0 })

  const beginCatalogLoad = (panels: ReadPanelId[], loadTarget: CatalogLoadTarget) => {
    const inflight = inflightRef.current
    for (const panelId of panels) inflight[panelId] += 1
    if (loadTarget === 'text' || loadTarget === 'both') inflight.text += 1
    if (loadTarget === 'helps' || loadTarget === 'both') inflight.helps += 1
    setIsLoadingByPanel({
      'panel-1': inflight['panel-1'] > 0,
      'panel-2': inflight['panel-2'] > 0,
    })
    if (inflight.text > 0) setIsLoadingTextResources(true)
    if (inflight.helps > 0) setIsLoadingHelpsResources(true)
  }

  const endCatalogLoad = (panels: ReadPanelId[], loadTarget: CatalogLoadTarget) => {
    const inflight = inflightRef.current
    for (const panelId of panels) inflight[panelId] = Math.max(0, inflight[panelId] - 1)
    if (loadTarget === 'text' || loadTarget === 'both') {
      inflight.text = Math.max(0, inflight.text - 1)
    }
    if (loadTarget === 'helps' || loadTarget === 'both') {
      inflight.helps = Math.max(0, inflight.helps - 1)
    }
    setIsLoadingByPanel({
      'panel-1': inflight['panel-1'] > 0,
      'panel-2': inflight['panel-2'] > 0,
    })
    setIsLoadingTextResources(inflight.text > 0)
    setIsLoadingHelpsResources(inflight.helps > 0)
    setCatalogSettledByPanel((prev) => {
      const next = { ...prev }
      for (const panelId of panels) {
        if (inflight[panelId] === 0) next[panelId] = true
      }
      return next
    })
  }

  const resetCatalogSettled = useCallback((panels?: ReadPanelId[]) => {
    const ids = panels ?? (['panel-1', 'panel-2'] as ReadPanelId[])
    setCatalogSettledByPanel((prev) => {
      const next = { ...prev }
      for (const panelId of ids) next[panelId] = false
      return next
    })
  }, [])

  const markCatalogSettled = useCallback((panels: ReadPanelId[]) => {
    setCatalogSettledByPanel((prev) => {
      const next = { ...prev }
      for (const panelId of panels) next[panelId] = true
      return next
    })
  }, [])

  const catalogLoadDeps = useCallback(
    (): Omit<
      LoadReadLanguageCatalogDeps,
      | 'textLanguageCode'
      | 'helpsLanguageCode'
      | 'loadTarget'
      | 'destPanelId'
      | 'navigationScope'
      | 'existingTextKeys'
      | 'existingHelpsKeys'
    > => ({
      catalogManager: catalogManager as LoadReadLanguageCatalogDeps['catalogManager'],
      resourceTypeRegistry: resourceTypeRegistry as LoadReadLanguageCatalogDeps['resourceTypeRegistry'],
      viewerRegistry,
      getPanel,
      addResource,
      setActiveResourceInPanel,
      setExpectedResources,
      onMetadataBatch: (count) => setMetadataUpdateCounter((prev) => prev + count),
    }),
    [catalogManager, resourceTypeRegistry, viewerRegistry, getPanel, addResource, setActiveResourceInPanel]
  )

  const runCatalogLoad = useCallback(
    async (options: RunReadCatalogLoadOptions) => {
      const destPanels = destPanelsForCatalogLoad(options)
      beginCatalogLoad(destPanels, options.loadTarget)
      try {
        const result = await loadReadLanguageCatalog({
          ...catalogLoadDeps(),
          textLanguageCode: options.textLanguageCode,
          helpsLanguageCode: options.helpsLanguageCode,
          loadTarget: options.loadTarget,
          destPanelId: options.destPanelId,
          navigationScope: options.navigationScope,
          existingTextKeys: textKeysRef.current,
          existingHelpsKeys: helpsKeysRef.current,
        })
        if (options.loadTarget === 'text' || options.loadTarget === 'both') {
          textKeysRef.current = result.textKeys
        }
        if (options.loadTarget === 'helps' || options.loadTarget === 'both') {
          helpsKeysRef.current = result.helpsKeys
        }
      } catch (error) {
        console.error('Error loading resources:', error)
      } finally {
        endCatalogLoad(destPanels, options.loadTarget)
      }
    },
    [catalogLoadDeps]
  )

  return {
    isLoadingTextResources,
    isLoadingHelpsResources,
    isLoadingByPanel,
    catalogSettledByPanel,
    resetCatalogSettled,
    markCatalogSettled,
    expectedResources,
    setExpectedResources,
    metadataUpdateCounter,
    textKeysRef,
    helpsKeysRef,
    runCatalogLoad,
  }
}
