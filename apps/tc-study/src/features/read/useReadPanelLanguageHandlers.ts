/**
 * Per-panel language / mode handlers. Peeled from useReadLanguageBootstrap
 * so the facade stays under the god-size budget.
 */

import { useCallback } from 'react'
import { useNavigationStore, useResourceTypeRegistry } from '../../contexts'
import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'
import { writePersistedHelpsLanguage } from './defaultHelpsLanguage'
import { applyReadModeMembership } from './applyReadModeMembership'
import {
  shouldLoadCatalogOnModeSwitch,
  type DownloadPane,
} from './downloadIsolationPolicy'
import { catalogLoadForSinglePanel } from './runReadPanelCatalog'
import {
  skipTextCatalogOnMismatch,
  supportedSubjectsFromRegistry,
} from './scriptureLanguageMismatch'
import { useReadPanelStore } from './readPanelStore'
import type { RunReadCatalogLoadOptions } from './useReadCatalogLoad'

type ReadPanelId = 'panel-1' | 'panel-2'

export function useReadPanelLanguageHandlers(deps: {
  maybeCancelDownloads: (pane: DownloadPane) => void
  runCatalogLoad: (options: RunReadCatalogLoadOptions) => Promise<void>
  markCatalogSettled: (panels: ReadPanelId[]) => void
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
    setExpectedResources,
    textKeysRef,
    helpsKeysRef,
    helpsLanguageCode,
    inheritEmptyLanguage,
  } = deps
  const resourceTypeRegistry = useResourceTypeRegistry()
  const setPanelLanguage = useReadPanelStore((s) => s.setPanelLanguage)

  const handlePanelLanguageSelected = useCallback(
    async (panelId: ReadPanelId, languageCode: string) => {
      const resolvedCode = canonicalReadLanguageCode(languageCode)
      setPanelLanguage(panelId, resolvedCode)
      const panel = useReadPanelStore.getState().panels[panelId]
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
      if (
        !shouldLoadCatalogOnModeSwitch({
          mode,
          languageCode: panel.languageCode,
          textKeys: textKeysRef.current,
          helpsKeys: helpsKeysRef.current,
        })
      ) {
        applyReadModeMembership(panelId, mode, panel.languageCode, textKeysRef.current)
        markCatalogSettled([panelId])
        return
      }
      const navigationScope = useNavigationStore.getState().navigationScope
      const one = catalogLoadForSinglePanel(panels, panelId)
      if (!one) return
      await runCatalogLoad({ ...one, navigationScope })
    },
    [inheritEmptyLanguage, markCatalogSettled, runCatalogLoad, textKeysRef, helpsKeysRef]
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
