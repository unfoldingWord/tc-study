/**
 * Read language bootstrap facade — picker state, BG download wiring, auto-load.
 * Heavy work lives in sibling modules:
 * - useReadIngredientHydration
 * - useReadCollectionCompleteness
 * - useReadCatalogLoad
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
import { useBackgroundDownload, useCatalogBackgroundDownload } from '../../hooks'
import { usePackageStore } from '../../lib/stores/packageStore'
import { clearReadPanelsForLanguageSwitch } from './clearReadPanelsForLanguageSwitch'
import { pushReadLanguageUrl } from './pushReadLanguageUrl'
import {
  applyTextLanguagePickNavigation,
  catalogScopeAfterTextLanguagePick,
  resolveTextLanguagePickNavigation,
} from './textLanguagePickNavigation'
import {
  resolveCatalogNavigationScope,
  textModeMismatchFromCache,
} from './textModeMismatch'
import { useReadTextModeSwitch } from './useReadTextModeSwitch'
import { writePersistedHelpsLanguage } from './defaultHelpsLanguage'
import { firstHelpsLanguageCode, navigationLanguageCode } from './readPanelModel'
import { canSeedBothPanelLanguages, useReadPanelStore } from './readPanelStore'
import {
  downloadResetToken,
  shouldCancelDownloadsOnPaneSwitch,
  type DownloadPane,
} from './downloadIsolationPolicy'
import { loadLanguagesCache } from './languagesCache'
import { shouldDeferLanguageCatalogLoad } from './readBootstrapPolicy'
import { availabilityLookupFromListed } from './readLanguageLoadPlan'
import { catalogLoadForSinglePanel, coldStartCatalogLoads } from './runReadPanelCatalog'
import { useReadCatalogLoad } from './useReadCatalogLoad'
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

  const [shouldAutoOpenLanguagePicker, setShouldAutoOpenLanguagePicker] = useState(requireLanguageInUrl)
  const [isLanguagePickerRequired, setIsLanguagePickerRequired] = useState(requireLanguageInUrl)

  useEffect(() => {
    setIsLanguagePickerRequired(requireLanguageInUrl)
    if (requireLanguageInUrl) setShouldAutoOpenLanguagePicker(true)
  }, [requireLanguageInUrl])

  useEffect(() => {
    if (!shouldAutoOpenLanguagePicker) return
    const id = window.setTimeout(() => setShouldAutoOpenLanguagePicker(false), 400)
    return () => window.clearTimeout(id)
  }, [shouldAutoOpenLanguagePicker])

  const autoLoadedLanguageForUrlRef = useRef<string | null>(null)
  const panels = useReadPanelStore((s) => s.panels)
  const seedBothLanguages = useReadPanelStore((s) => s.seedBothLanguages)
  const setPanelLanguage = useReadPanelStore((s) => s.setPanelLanguage)
  const currentLanguageCode =
    navigationLanguageCode(panels) || initialLanguage || null
  const helpsLanguageCode = firstHelpsLanguageCode(panels)

  const {
    isLoadingTextResources,
    isLoadingHelpsResources,
    isLoadingByPanel,
    expectedResources,
    setExpectedResources,
    metadataUpdateCounter,
    textKeysRef,
    helpsKeysRef,
    runCatalogLoad,
  } = useReadCatalogLoad()

  useEffect(() => {
    const helps = firstHelpsLanguageCode(useReadPanelStore.getState().panels)
    if (helps) writePersistedHelpsLanguage(helps)
  }, [helpsLanguageCode])

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
    resetToken: downloadResetToken(panels['panel-1'].languageCode, panels['panel-2'].languageCode),
    isDownloading: isBackgroundDownloading,
    enabled: !DISABLE_BACKGROUND_DOWNLOAD && !isCatalogLoadBusy && Object.keys(loadedResources).length > 0,
    debug: true,
  })

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

  const handleLanguageSelected = useCallback(
    async (languageCode: string, options?: { navigationScope?: 'scripture' | 'obs' }) => {
      setShouldAutoOpenLanguagePicker(false)
      setIsLanguagePickerRequired(false)
      if (canSeedBothPanelLanguages()) {
        seedBothLanguages(languageCode)
      } else if (!useReadPanelStore.getState().panels['panel-1'].languageCode) {
        setPanelLanguage('panel-1', languageCode)
      }
      maybeCancelDownloads('text')

      const subjects =
        typeof resourceTypeRegistry.getSupportedSubjects === 'function'
          ? resourceTypeRegistry.getSupportedSubjects()
          : []
      const listed = loadLanguagesCache(subjects)
      const availabilityFor = availabilityLookupFromListed(listed)
      const scopeFromUrl = resolveCatalogNavigationScope({
        pathname: typeof window !== 'undefined' ? window.location.pathname : '',
        storeScope: useNavigationStore.getState().navigationScope,
        explicitScope: options?.navigationScope,
      })
      const pick = resolveTextLanguagePickNavigation({
        availability: availabilityFor(languageCode),
        currentScope: scopeFromUrl,
        explicitScope: options?.navigationScope,
      })
      applyTextLanguagePickNavigation(useNavigationStore.getState(), pick)
      const scope = catalogScopeAfterTextLanguagePick(scopeFromUrl, pick)
      pushReadLanguageUrl(navigate, languageCode)

      if (shouldDeferLanguageCatalogLoad(initialLanguage)) {
        return
      }

      if (textModeMismatchFromCache({ languageCode, navigationScope: scope, supportedSubjects: subjects })) {
        textKeysRef.current = []
        setExpectedResources(helpsKeysRef.current)
        clearReadPanelsForLanguageSwitch(helpsLanguageCode ?? undefined, 'panel-1')
        return
      }

      autoLoadedLanguageForUrlRef.current = languageCode
      const snapshot = useReadPanelStore.getState().panels
      const loads = coldStartCatalogLoads(snapshot)
      await Promise.all(loads.map((one) => runCatalogLoad({ ...one, navigationScope: scope })))
    },
    [
      maybeCancelDownloads,
      navigate,
      initialLanguage,
      resourceTypeRegistry,
      helpsLanguageCode,
      runCatalogLoad,
      seedBothLanguages,
      setPanelLanguage,
    ]
  )

  const { handleSwitchTextMode, handleNavigatorScopeCommitted } = useReadTextModeSwitch(
    currentLanguageCode,
    handleLanguageSelected
  )

  const handlePanelLanguageSelected = useCallback(
    async (panelId: 'panel-1' | 'panel-2', languageCode: string) => {
      setPanelLanguage(panelId, languageCode)
      const panel = useReadPanelStore.getState().panels[panelId]
      maybeCancelDownloads(panel.mode === 'helps' ? 'helps' : 'text')
      const navigationScope = useNavigationStore.getState().navigationScope
      const one = catalogLoadForSinglePanel(useReadPanelStore.getState().panels, panelId)
      if (!one) return
      await runCatalogLoad({ ...one, navigationScope })
    },
    [maybeCancelDownloads, runCatalogLoad, setPanelLanguage]
  )

  const handlePanelModeSwitch = useCallback(
    async (panelId: 'panel-1' | 'panel-2', mode: 'scripture' | 'helps') => {
      useReadPanelStore.getState().setPanelMode(panelId, mode)
      const navigationScope = useNavigationStore.getState().navigationScope
      const one = catalogLoadForSinglePanel(useReadPanelStore.getState().panels, panelId)
      if (!one) return
      await runCatalogLoad({ ...one, navigationScope })
    },
    [runCatalogLoad]
  )

  const handleHelpsLanguageSelected = useCallback(
    async (languageCode: string) => {
      writePersistedHelpsLanguage(languageCode)
      await handlePanelLanguageSelected('panel-2', languageCode)
    },
    [handlePanelLanguageSelected]
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
    isLoadingByPanel,
    currentLanguageCode,
    helpsLanguageCode,
    isCollectionFullyCached,
    shouldAutoOpenLanguagePicker,
    isLanguagePickerRequired,
    handleLanguageSelected,
    handleHelpsLanguageSelected,
    handlePanelLanguageSelected,
    handlePanelModeSwitch,
    handleSwitchTextMode,
    handleNavigatorScopeCommitted,
    isBackgroundDownloading,
    downloadStats,
  }
}
