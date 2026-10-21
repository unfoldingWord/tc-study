/**
 * Read-shell host for process debug UI (sibling of NavigationBar + panels).
 * - modal: overlay dialog (ModalPortal)
 * - docked: in-flow bottom panel so the middle panels area shrinks
 */

import { useEffect, useState } from 'react'
import { backgroundDownloadSession } from '../../features/download/backgroundDownloadSession'
import { DownloadQueueDetailsModal } from './DownloadQueueDetailsModal'
import { isProcessDebugDocked, isProcessDebugOpen } from './processDebugPresentation'
import {
  PROCESS_DEBUG_DOCK_HEIGHT_CSS,
  useProcessDebugPresentationStore,
} from './processDebugPresentationStore'

export function ProcessDebugHost() {
  const presentation = useProcessDebugPresentationStore((s) => s.presentation)
  const dispatch = useProcessDebugPresentationStore((s) => s.dispatch)
  const [stats, setStats] = useState(() => backgroundDownloadSession.getStats())

  const open = isProcessDebugOpen(presentation)
  const docked = isProcessDebugDocked(presentation)

  useEffect(() => {
    if (!open) return
    return backgroundDownloadSession.subscribe(setStats)
  }, [open])

  if (!open) return null

  return (
    <DownloadQueueDetailsModal
      open={open}
      docked={docked}
      dockHeightCss={PROCESS_DEBUG_DOCK_HEIGHT_CSS}
      onClose={() => dispatch('close')}
      onDock={() => dispatch('dock')}
      onUndock={() => dispatch('undock')}
      queue={stats.queue}
      completedResourceKeys={stats.completedResourceKeys}
      isDownloading={stats.isDownloading}
      error={stats.error}
      progress={stats.progress}
      blockedReason={stats.blockedReason}
      lastActivityAt={stats.lastActivityAt}
      recentSteps={stats.recentSteps}
      onRetry={() => backgroundDownloadSession.retryLastRun()}
      onStop={() => backgroundDownloadSession.stopDownload()}
    />
  )
}
