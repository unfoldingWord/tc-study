/**
 * Read language bootstrap facade — picker state, BG download wiring, auto-load.
 * Heavy work lives in sibling modules:
 * - useReadIngredientHydration
 * - useReadCollectionCompleteness
 * - loadReadLanguageCatalog
 * - readLanguageLoadPlan
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCatalogManager,
  useCompletenessChecker,
  useNavigationStore,
  useResourceTypeRegistry,
  useViewerRegistry,
} from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import { useBackgroundDownload, useCatalogBackgroundDownload, useResourceManagement } from '../../hooks'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { clearReadPanelsForLanguageSwitch } from './clearReadPanelsForLanguageSwitch'
import {
  loadReadLanguageCatalog,
  type LoadReadLanguageCatalogDeps,
} from './loadReadLanguageCatalog'
import { pushReadLanguageUrl } from './pushReadLanguageUrl'
import {
  applyTextModeScopeSwitch,
  navigationScopeFromReadPath,
  textModeMismatchFromCache,
} from './textModeMismatch'
import {
  readPersistedHelpsLanguage,
  resolveAndPersistHelpsLanguage,
  writePersistedHelpsLanguage,
} from './defaultHelpsLanguage'
import {
  downloadResetToken,
  shouldCancelDownloadsOnPaneSwitch,
  type DownloadPane,
} from './downloadIsolationPolicy'
import { loadLanguagesCache } from './languagesCache'
import { shouldDeferLanguageCatalogLoad } from './readBootstrapPolicy'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import {
  availabilityLookupFromListed,
  resolveReadCatalogLoadPlan,
} from './readLanguageLoadPlan'
import { useReadCollectionCompleteness } from './useReadCollectionCompleteness'
import { useReadIngredientHydration } from './useReadIngredientHydration'

/** Set to true to disable automatic background downloads (e.g. for debugging). */
const DISABLE_BACKGROUND_DOWNLOAD = false

export interface UseReadLanguageBootstrapOptions {
  initialLanguage?: string
  requireLanguageInUrl?: boolean
}

/**
 * Language package load, expected resources, CombinedHelps inject, verification,
 * and background-download wiring for Read.
 */
export function useReadLanguageBootstrap({
  initialLanguage,
  requireLanguageInUrl = false,
}: UseReadLanguageBootstrapOptions = {}) {
  const navigate = useNavigate()
  const catalogManager = useCatalogManager()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const completenessChecker = useCompletenessChecker()
  const packageStore = usePackageStore()
  const loadedResources = useAppStore((s) => s.loadedResources)

  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  const { addResource } = useResourceManagement()

  const [isLoadingTextResources, setIsLoadingTextResources] = useState(false)
  const [isLoadingHelpsResources, setIsLoadingHelpsResources] = useState(false)
  const [expectedResources, setExpectedResources] = useState<string[]>([])
  const [metadataUpdateCounter, setMetadataUpdateCounter] = useState(0)

  const [shouldAutoOpenLanguagePicker, setShouldAutoOpenLanguagePicker] = useState(requireLanguageInUrl)
  const [isLanguagePickerRequired, setIsLanguagePickerRequired] = useState(requireLanguageInUrl)

  useEffect(() => {
    setShouldAutoOpenLanguagePicker(requireLanguageInUrl)
    setIsLanguagePickerRequired(requireLanguageInUrl)
  }, [requireLanguageInUrl])

  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)
  const [currentLanguageCode, setCurrentLanguageCode] = useState<string | null>(initialLanguage || null)
  const [helpsLanguageCode, setHelpsLanguageCode] = useState<string | null>(() =>
    readPersistedHelpsLanguage()
  )

  const textKeysRef = useRef<string[]>([])
  const helpsKeysRef = useRef<string[]>([])

  useEffect(() => {
    resolveAndPersistHelpsLanguage(currentLanguageCode || initialLanguage || '')
  }, [currentLanguageCode, initialLanguage])

  useReadIngredientHydration(loadedResources, catalogManager)
  const isCollectionFullyCached = useReadCollectionCompleteness(
    currentLanguageCode,
    packageStore.packages,
    completenessChecker
  )

  const {
    startDownload,
    stopDownload,
    stats: downloadStats,
    isDownloading: isBackgroundDownloading,
    queue,
  } = useBackgroundDownload({
    autoStart: false,
    skipExisting: true,
    debug: true,
  })
  const isBackgroundDownloadingRef = useRef(isBackgroundDownloading)
  const queueRef = useRef(queue)
  useEffect(() => {
    isBackgroundDownloadingRef.current = isBackgroundDownloading
  }, [isBackgroundDownloading])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  const isLoadingResources = isLoadingTextResources
  const isCatalogLoadBusy = isLoadingTextResources || isLoadingHelpsResources

  useCatalogBackgroundDownload({
    catalogManager,
    completenessChecker,
    onStartDownload: startDownload,
    catalogTrigger: `${Object.keys(loadedResources).length}-${metadataUpdateCounter}`,
    expectedResources,
    resetToken: downloadResetToken(currentLanguageCode, helpsLanguageCode),
    isDownloading: isBackgroundDownloading,
    enabled: !DISABLE_BACKGROUND_DOWNLOAD && !isCatalogLoadBusy && Object.keys(loadedResources).length > 0,
    debug: true,
  })

  const catalogLoadDeps = useCallback(
    (): Omit<
      LoadReadLanguageCatalogDeps,
      'textLanguageCode' | 'helpsLanguageCode' | 'loadTarget' | 'existingTextKeys' | 'existingHelpsKeys'
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

  const maybeCancelDownloads = useCallback(
    (switchedPane: DownloadPane) => {
      if (!isBackgroundDownloadingRef.current) return
      if (
        !shouldCancelDownloadsOnPaneSwitch({
          queue: queueRef.current,
          switchedPane,
          textKeys: textKeysRef.current,
          helpsKeys: helpsKeysRef.current,
        })
      ) {
        return
      }
      stopDownload()
    },
    [stopDownload]
  )

  const runCatalogLoad = useCallback(
    async (options: {
      textLanguageCode: string
      helpsLanguageCode: string
      loadTarget: CatalogLoadTarget
    }) => {
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

  const handleLanguageSelected = useCallback(
    async (languageCode: string) => {
      setShouldAutoOpenLanguagePicker(false)
      setIsLanguagePickerRequired(false)
      setCurrentLanguageCode(languageCode)
      maybeCancelDownloads('text')
      pushReadLanguageUrl(navigate, languageCode)

      if (shouldDeferLanguageCatalogLoad(initialLanguage)) {
        return
      }

      const subjects =
        typeof resourceTypeRegistry.getSupportedSubjects === 'function'
          ? resourceTypeRegistry.getSupportedSubjects()
          : []
      const storeScope = useNavigationStore.getState().navigationScope
      const scope = navigationScopeFromReadPath(
        typeof window !== 'undefined' ? window.location.pathname : '',
        storeScope
      )
      if (textModeMismatchFromCache({ languageCode, navigationScope: scope, supportedSubjects: subjects })) {
        textKeysRef.current = []
        setExpectedResources(helpsKeysRef.current)
        clearReadPanelsForLanguageSwitch(helpsLanguageCode ?? undefined, 'panel-1')
        return
      }

      const persisted = resolveAndPersistHelpsLanguage(languageCode)
      const plan = resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: languageCode,
        currentHelpsLanguage: helpsKeysRef.current.length === 0 ? null : helpsLanguageCode,
        persistedHelpsLanguage: persisted,
        navigationScope: scope,
        availabilityFor: availabilityLookupFromListed(loadLanguagesCache(subjects)),
      })
      setHelpsLanguageCode(plan.helpsLanguageCode)

      autoLoadedLanguageForUrlRef.current = languageCode
      await runCatalogLoad({
        textLanguageCode: languageCode,
        helpsLanguageCode: plan.helpsLanguageCode,
        loadTarget: plan.loadTarget,
      })
    },
    [
      maybeCancelDownloads,
      navigate,
      initialLanguage,
      resourceTypeRegistry,
      helpsLanguageCode,
      runCatalogLoad,
    ]
  )

  const handleSwitchTextMode = useCallback(
    (scope: 'scripture' | 'obs') => {
      const code = currentLanguageCode
      if (!code) return
      applyTextModeScopeSwitch(useNavigationStore.getState(), scope)
      void handleLanguageSelected(code)
    },
    [currentLanguageCode, handleLanguageSelected]
  )

  const handleHelpsLanguageSelected = useCallback(
    async (languageCode: string) => {
      writePersistedHelpsLanguage(languageCode)
      setHelpsLanguageCode(languageCode)
      maybeCancelDownloads('helps')

      const textCode = currentLanguageCode || initialLanguage
      if (!textCode) return

      const plan = resolveReadCatalogLoadPlan({
        switchedPane: 'helps',
        textLanguageCode: textCode,
        nextHelpsLanguageCode: languageCode,
        currentHelpsLanguage: helpsLanguageCode,
        persistedHelpsLanguage: languageCode,
        navigationScope: useNavigationStore.getState().navigationScope,
        availabilityFor: () => undefined,
      })

      await runCatalogLoad({
        textLanguageCode: textCode,
        helpsLanguageCode: plan.helpsLanguageCode,
        loadTarget: plan.loadTarget,
      })
    },
    [maybeCancelDownloads, currentLanguageCode, initialLanguage, helpsLanguageCode, runCatalogLoad]
  )

  useEffect(() => {
    if (!initialLanguage) return
    if (autoLoadedLanguageForUrlRef.current === initialLanguage) return
    autoLoadedLanguageForUrlRef.current = initialLanguage
    void handleLanguageSelected(initialLanguage)
  }, [initialLanguage, handleLanguageSelected])

  return {
    loadedResources,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
    packageStore,
    isLoadingResources,
    isLoadingTextResources,
    isLoadingHelpsResources,
    currentLanguageCode,
    helpsLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    handleHelpsLanguageSelected,
    handleSwitchTextMode,
    isBackgroundDownloading,
    downloadStats,
  }
}
