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
  const [expectedResources, setExpectedResources] = useState<string[]>([])
  const [metadataUpdateCounter, setMetadataUpdateCounter] = useState(0)
  const textKeysRef = useRef<string[]>([])
  const helpsKeysRef = useRef<string[]>([])

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
      if (options.loadTarget === 'text' || options.loadTarget === 'both') {
        setIsLoadingTextResources(true)
      }
      if (options.loadTarget === 'helps' || options.loadTarget === 'both') {
        setIsLoadingHelpsResources(true)
      }
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
        if (options.loadTarget === 'text' || options.loadTarget === 'both') {
          setIsLoadingTextResources(false)
        }
        if (options.loadTarget === 'helps' || options.loadTarget === 'both') {
          setIsLoadingHelpsResources(false)
        }
      }
    },
    [catalogLoadDeps]
  )

  return {
    isLoadingTextResources,
    isLoadingHelpsResources,
    expectedResources,
    setExpectedResources,
    metadataUpdateCounter,
    textKeysRef,
    helpsKeysRef,
    runCatalogLoad,
  }
}
