import { Download, AlertCircle, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import {
  displayDownloadPercent,
  displayIngredientCounts,
} from '../../features/download/backgroundDownloadRun'
import { backgroundDownloadSession } from '../../features/download/backgroundDownloadSession'

/** Leaf subscribe — progress pulses must not re-render Scripture / CombinedHelps. */
export function DownloadIndicator() {
  const [stats, setStats] = useState(() => backgroundDownloadSession.getStats())
  useEffect(() => backgroundDownloadSession.subscribe(setStats), [])

  const isDownloading = stats.isDownloading
  const progress = stats.progress ?? undefined
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isDownloading && startedAt == null) setStartedAt(Date.now())
    if (!isDownloading) setStartedAt(null)
  }, [isDownloading, startedAt])

  useEffect(() => {
    if (!isDownloading || !isOpen) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isDownloading, isOpen])

  const useIngredients = progress?.totalIngredients !== undefined && progress.totalIngredients > 0
  const rawCompleted = useIngredients
    ? (progress?.completedIngredients || 0)
    : (progress?.completedResources || 0)
  const rawTotal = useIngredients
    ? (progress?.totalIngredients || 0)
    : (progress?.totalResources || 0)
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

  const elapsedMs = startedAt != null ? now - startedAt : 0
  const elapsedLabel = (() => {
    const s = Math.floor(elapsedMs / 1000)
    const m = Math.floor(s / 60)
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
  })()

  if (!isDownloading && !progress) {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-muted rounded-lg transition-colors"
        title="Download progress"
        aria-label="Download progress"
      >
        {isDownloading ? (
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        ) : (
          <AlertCircle className="w-5 h-5 text-danger" />
        )}

        {isDownloading && (
          <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-medium px-1 rounded-full min-w-[20px] text-center">
            {overallProgress}%
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1 md:top-full md:bottom-auto md:mt-1 md:mb-0 bg-elevated rounded-lg shadow-lg border border-border p-3 min-w-[280px] z-50">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
            <Download className="w-4 h-4 text-fg-secondary" />
            <div className="flex-1">
              <div className="text-sm font-medium text-fg">
                {completed} / {total}
              </div>
              <div className="text-xs text-fg-muted">
                {overallProgress}%
              </div>
            </div>
            {isDownloading ? (
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4 text-danger" />
            )}
          </div>

          <div className="mb-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {isDownloading && startedAt != null && (
            <div className="flex items-center justify-between text-xs text-fg-muted mb-2">
              <span>Elapsed</span>
              <span className="font-mono">{elapsedLabel}</span>
            </div>
          )}

          {isDownloading && (progress?.currentResource || progress?.currentIngredient) && (
            <div className="mt-3 pt-2 border-t border-border-subtle space-y-1">
              {progress.currentResource && (
                <div className="flex items-center gap-2 text-xs text-fg-secondary">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                  <span className="truncate font-medium">
                    {progress.currentResource.split('/').pop()}
                  </span>
                </div>
              )}
              {progress.currentIngredient && (
                <div className="flex items-center gap-2 text-xs text-fg-muted pl-3.5">
                  <span className="truncate">
                    → {progress.currentIngredient}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
