/**
 * Keep UGNT/UHB membership aligned with the current book on every scripture pane.
 */

import { useEffect } from 'react'
import { syncOriginalLanguageOnScripturePanels } from './originalLanguagePanelMembership'
import { type ReadPanelId } from './readPanelModel'
import { useReadPanelStore } from './readPanelStore'

export function useSyncOriginalLanguageTabs(currentBook: string): void {
  const panel1Mode = useReadPanelStore((s) => s.panels['panel-1'].mode)
  const panel2Mode = useReadPanelStore((s) => s.panels['panel-2'].mode)
  const panel1Lang = useReadPanelStore((s) => s.panels['panel-1'].languageCode)
  const panel2Lang = useReadPanelStore((s) => s.panels['panel-2'].languageCode)

  useEffect(() => {
    if (!currentBook) return
    const scripturePanelIds: ReadPanelId[] = []
    if (panel1Mode === 'scripture' && panel1Lang) scripturePanelIds.push('panel-1')
    if (panel2Mode === 'scripture' && panel2Lang) scripturePanelIds.push('panel-2')
    if (scripturePanelIds.length === 0) return
    syncOriginalLanguageOnScripturePanels({ bookCode: currentBook, scripturePanelIds })
  }, [currentBook, panel1Mode, panel2Mode, panel1Lang, panel2Lang])
}
