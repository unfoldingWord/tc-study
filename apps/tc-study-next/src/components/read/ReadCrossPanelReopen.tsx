import { useMultiSignalHandler } from '@bt-synergy/resource-panels'
import {
  CROSS_PANEL_REOPEN_SIGNALS,
  shouldReopenCollapsedPanel,
} from '../../features/read/readPanelReopen'
import type { ReadLayoutMode } from '../../features/read/readPanelPersistence'
import type { ReadPanelId } from '../../features/read/readPanelModel'

interface ReadCrossPanelReopenProps {
  sourceResourceId: string
  sourcePanelId: ReadPanelId
  layout: ReadLayoutMode
  collapsedPanelId: ReadPanelId | null
  onReopen: (panelId: ReadPanelId) => void
}

export function ReadCrossPanelReopen({
  sourceResourceId,
  sourcePanelId,
  layout,
  collapsedPanelId,
  onReopen,
}: ReadCrossPanelReopenProps) {
  useMultiSignalHandler(CROSS_PANEL_REOPEN_SIGNALS as unknown as string[], sourceResourceId, (signal) => {
    if (signal.sourceResourceId !== sourceResourceId) return
    if (
      !shouldReopenCollapsedPanel({
        layout,
        collapsedPanelId,
        sourcePanelId,
        signalType: signal.type,
      })
    ) {
      return
    }
    if (collapsedPanelId) onReopen(collapsedPanelId)
  })
  return null
}
