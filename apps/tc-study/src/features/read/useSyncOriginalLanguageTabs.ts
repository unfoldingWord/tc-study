/**
 * Keep UGNT/UHB membership aligned with the current book on every scripture pane.
 * Also remint colliding instance ids so LinkedPanels can select UST on panel-2
 * independently of panel-1's UST.
 *
 * Bible/OBS mismatch panes are excluded so leftover ULT cannot keep UGNT.
 */

import { useEffect } from 'react'
import { ensureUniqueCrossPanelInstanceIds } from '../workspace/panelInstanceIds'
import { syncOriginalLanguageOnScripturePanels } from './originalLanguagePanelMembership'
import { type ReadPanelId } from './readPanelModel'
import { useReadPanelStore } from './readPanelStore'

export function useSyncOriginalLanguageTabs(
  currentBook: string,
  options?: { excludePanelIds?: readonly ReadPanelId[] }
): void {
  const panel1Mode = useReadPanelStore((s) => s.panels['panel-1'].mode)
  const panel2Mode = useReadPanelStore((s) => s.panels['panel-2'].mode)
  const panel1Lang = useReadPanelStore((s) => s.panels['panel-1'].languageCode)
  const panel2Lang = useReadPanelStore((s) => s.panels['panel-2'].languageCode)
  const excludeKey = (options?.excludePanelIds ?? []).join(',')

  useEffect(() => {
    ensureUniqueCrossPanelInstanceIds()
    if (!currentBook) return
    const excluded = new Set(excludeKey ? excludeKey.split(',') : [])
    const scripturePanelIds: ReadPanelId[] = []
    if (panel1Mode === 'scripture' && panel1Lang && !excluded.has('panel-1')) {
      scripturePanelIds.push('panel-1')
    }
    if (panel2Mode === 'scripture' && panel2Lang && !excluded.has('panel-2')) {
      scripturePanelIds.push('panel-2')
    }
    if (scripturePanelIds.length === 0) return
    syncOriginalLanguageOnScripturePanels({ bookCode: currentBook, scripturePanelIds })
    ensureUniqueCrossPanelInstanceIds()
  }, [currentBook, panel1Mode, panel2Mode, panel1Lang, panel2Lang, excludeKey])
}
