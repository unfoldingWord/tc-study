import { AlertCircle, ListOrdered, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  displayDownloadPercent,
  displayIngredientCounts,
} from '../../features/download/backgroundDownloadRun'
import { backgroundDownloadSession } from '../../features/download/backgroundDownloadSession'
import { shouldShowDownloadIndicator } from './downloadIndicatorVisibility'
import { useProcessDebugPresentationStore } from './processDebugPresentationStore'

const MENU_ROW =
  'flex items-center justify-center p-2 w-full hover:bg-muted relative'

/**
 * Accent activity dot on the hamburger while a background download is in flight.
 * Leaf subscribe — progress pulses must not re-render the rest of nav chrome.
 */
export function DownloadBusyBadge() {
  const [stats, setStats] = useState(() => backgroundDownloadSession.getStats())
  useEffect(() => backgroundDownloadSession.subscribe(setStats), [])

  if (!stats.isDownloading) return null

  return (
    <span
      className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent"
      title="Downloading"
      aria-label="Downloading"
    />
  )
}

/**
 * Hamburger-menu download / process controls.
 * Leaf subscribe — progress pulses must not re-render Scripture / CombinedHelps.
 */
export function DownloadIndicator({ onClose }: { onClose?: () => void }) {
  const [stats, setStats] = useState(() => backgroundDownloadSession.getStats())
  useEffect(() => backgroundDownloadSession.subscribe(setStats), [])

  const isDownloading = stats.isDownloading
  const progress = stats.progress ?? undefined
  const error = stats.error
  const queue = stats.queue
  const dispatchPresentation = useProcessDebugPresentationStore((s) => s.dispatch)

  const useIngredients =
    progress?.totalIngredients !== undefined && progress.totalIngredients > 0
  const rawCompleted = useIngredients
    ? progress?.completedIngredients || 0
    : progress?.completedResources || 0
  const rawTotal = useIngredients
    ? progress?.totalIngredients || 0
    : progress?.totalResources || 0
  const { completed, total } = displayIngredientCounts({
    completed: rawCompleted,
    total: rawTotal,
  })
  const overallProgress = displayDownloadPercent({
    isDownloading,
    completed,
    total,
    reportedOverall: progress?.overallProgress,
    currentIngredient: progress?.currentIngredient,
  })

  const showIndicator = shouldShowDownloadIndicator({
    isDownloading,
    progress,
    error,
    queue,
  })
  const showRetry = showIndicator && !isDownloading

  const openProcessDebug = () => {
    dispatchPresentation('open')
    onClose?.()
  }

  return (
    <>
      {showIndicator ? (
        <button
          type="button"
          onClick={openProcessDebug}
          className={MENU_ROW}
          title="Download progress"
          aria-label="Download progress"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          ) : (
            <AlertCircle className="w-4 h-4 text-danger" />
          )}
          {isDownloading && (
            <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-[9px] font-semibold rounded-full min-w-[1.25rem] px-0.5 h-3.5 flex items-center justify-center">
              {overallProgress}%
            </span>
          )}
        </button>
      ) : null}

      {showRetry ? (
        <button
          type="button"
          onClick={() => {
            backgroundDownloadSession.retryLastRun()
            onClose?.()
          }}
          className={MENU_ROW}
          title="Retry download"
          aria-label="Retry download"
        >
          <RotateCcw className="w-4 h-4 text-fg-secondary" />
        </button>
      ) : null}

      <button
        type="button"
        onClick={openProcessDebug}
        className={MENU_ROW}
        title="Process debug"
        aria-label="Process debug"
      >
        <ListOrdered className="w-4 h-4 text-fg-secondary" />
      </button>
    </>
  )
}
