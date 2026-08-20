/**
 * Per-panel language / mode handlers. Peeled from useReadLanguageBootstrap
 * so the facade stays under the god-size budget.
 */

import { useCallback } from 'react'
import { useNavigationStore, usePanelEntryRegistry, useResourceTypeRegistry } from '../../contexts'
import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'
import { writePersistedHelpsLanguage } from './defaultHelpsLanguage'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { requestHelpsContentHydrate } from '../helps/helpsContentHydrate'
import { applyReadModeMembership, packageHasHelpsCatalogTypes } from './applyReadModeMembership'
import {
  shouldLoadCatalogOnModeSwitch,
  type DownloadPane,
} from './downloadIsolationPolicy'
import { otherReadPanelId } from './readPanelModel'
import { panelHasObsPrimaryContent, resolveHelpsCatalogScope } from './resolveHelpsCatalogScope'
import { catalogLoadForSinglePanel } from './runReadPanelCatalog'
import {
  skipTextCatalogOnMismatch,
  supportedSubjectsFromRegistry,
} from './scriptureLanguageMismatch'
import { replaceReadLanguageUrlFromUi } from './pushReadLanguageUrl'
import { readUrlLangsFromPanels } from './readUrlGrammar'
import { useReadPanelStore } from './readPanelStore'
import type { RunReadCatalogLoadOptions } from './useReadCatalogLoad'

type ReadPanelId = 'panel-1' | 'panel-2'

export function useReadPanelLanguageHandlers(deps: {
  maybeCancelDownloads: (pane: DownloadPane) => void
  runCatalogLoad: (options: RunReadCatalogLoadOptions) => Promise<void>
  markCatalogSettled: (panels: ReadPanelId[]) => void
  resetCatalogSettled: (panels?: ReadPanelId[]) => void
  setExpectedResources: (keys: string[]) => void
  textKeysRef: { current: string[] }
  helpsKeysRef: { current: string[] }
  helpsLanguageCode: string | null
  inheritEmptyLanguage: () => ReadPanelId | null
}) {
  const {
    maybeCancelDownloads,
    runCatalogLoad,
    markCatalogSettled,
    resetCatalogSettled,
    setExpectedResources,
    textKeysRef,
    helpsKeysRef,
    helpsLanguageCode,
    inheritEmptyLanguage,
  } = deps
  const resourceTypeRegistry = useResourceTypeRegistry()
  const panelEntryRegistry = usePanelEntryRegistry()
  const setPanelLanguage = useReadPanelStore((s) => s.setPanelLanguage)

  const handlePanelLanguageSelected = useCallback(
    async (panelId: ReadPanelId, languageCode: string) => {
      const resolvedCode = canonicalReadLanguageCode(languageCode)
      setPanelLanguage(panelId, resolvedCode)
      const panel = useReadPanelStore.getState().panels[panelId]
      const langs = readUrlLangsFromPanels(useReadPanelStore.getState().panels)
      if (langs.length) replaceReadLanguageUrlFromUi(langs)
      maybeCancelDownloads(panel.mode === 'helps' ? 'helps' : 'text')
      const navigationScope = useNavigationStore.getState().navigationScope
      if (
        panel.mode === 'scripture' &&
        skipTextCatalogOnMismatch({
          languageCode: resolvedCode,
          navigationScope,
          supportedSubjects: supportedSubjectsFromRegistry(resourceTypeRegistry),
          panelId,
          helpsLanguageCode: helpsLanguageCode ?? undefined,
          textKeysRef,
          helpsKeysRef,
          setExpectedResources,
        })
      ) {
        markCatalogSettled([panelId])
        return
      }
      const one = catalogLoadForSinglePanel(useReadPanelStore.getState().panels, panelId)
      if (!one) return
      await runCatalogLoad({ ...one, navigationScope })
    },
    [
      maybeCancelDownloads,
      runCatalogLoad,
      setPanelLanguage,
      resourceTypeRegistry,
      helpsLanguageCode,
      setExpectedResources,
      markCatalogSettled,
      textKeysRef,
      helpsKeysRef,
    ]
  )

  const handlePanelModeSwitch = useCallback(
    async (panelId: ReadPanelId, mode: 'scripture' | 'helps') => {
      useReadPanelStore.getState().setPanelMode(panelId, mode)
      inheritEmptyLanguage()
      const panels = useReadPanelStore.getState().panels
      const panel = panels[panelId]
      const nav = useNavigationStore.getState()
      const pkg = useWorkspaceStore.getState().currentPackage
      const thisKeys = pkg?.panels.find((p) => p.id === panelId)?.resourceKeys ?? []
      const siblingKeys =
        pkg?.panels.find((p) => p.id === otherReadPanelId(panelId))?.resourceKeys ?? []
      const helpsScope = resolveHelpsCatalogScope({
        navigationScope: nav.navigationScope,
        pathname: typeof window !== 'undefined' ? window.location.pathname : '',
        currentBook: nav.currentReference.book,
        thisPaneHasObsPrimary: pkg ? panelHasObsPrimaryContent(thisKeys, pkg.resources) : false,
        siblingPaneHasObsPrimary: pkg
          ? panelHasObsPrimaryContent(siblingKeys, pkg.resources)
          : false,
      })
      if (mode === 'helps') {
        const paneTypeIds = panelEntryRegistry.paneMemberConsumedTypeIdsForHelpsMode(helpsScope)
        const requiredTypeIds = panelEntryRegistry.consumedTypeIdsForHelpsMode(helpsScope)
        applyReadModeMembership(
          panelId,
          mode,
          panel.languageCode,
          textKeysRef.current,
          helpsScope,
          paneTypeIds
        )
        // Catalog types in the package skip Door43 search — not TN/TWL/TQ book content.
        requestHelpsContentHydrate()
        if (
          packageHasHelpsCatalogTypes(
            panel.languageCode,
            requiredTypeIds.length > 0
              ? requiredTypeIds
              : resourceTypeRegistry.helpsCatalogTypeIds(helpsScope)
          )
        ) {
          markCatalogSettled([panelId])
          return
        }
        const one = catalogLoadForSinglePanel(panels, panelId)
        if (!one) return
        resetCatalogSettled([panelId])
        await runCatalogLoad({ ...one, navigationScope: helpsScope, skipPanelClear: true })
        return
      }
      const needsCatalog = shouldLoadCatalogOnModeSwitch({
        mode,
        languageCode: panel.languageCode,
        textKeys: textKeysRef.current,
        helpsKeys: helpsKeysRef.current,
      })
      if (!needsCatalog) {
        applyReadModeMembership(panelId, mode, panel.languageCode, textKeysRef.current, helpsScope)
        markCatalogSettled([panelId])
        return
      }
      const one = catalogLoadForSinglePanel(panels, panelId)
      if (!one) return
      await runCatalogLoad({ ...one, navigationScope: nav.navigationScope })
    },
    [
      inheritEmptyLanguage,
      markCatalogSettled,
      resetCatalogSettled,
      panelEntryRegistry,
      resourceTypeRegistry,
      runCatalogLoad,
      textKeysRef,
      helpsKeysRef,
    ]
  )

  const handleHelpsLanguageSelected = useCallback(
    async (languageCode: string) => {
      writePersistedHelpsLanguage(languageCode)
      await handlePanelLanguageSelected('panel-2', languageCode)
    },
    [handlePanelLanguageSelected]
  )

  return {
    handlePanelLanguageSelected,
    handlePanelModeSwitch,
    handleHelpsLanguageSelected,
  }
}
