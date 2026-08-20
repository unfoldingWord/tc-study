import { Download, CheckCircle2, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { displayDownloadPercent } from '../../features/download/backgroundDownloadRun'
import type { DownloadProgress } from '../../hooks/useBackgroundDownload'

interface DownloadIndicatorProps {
  isDownloading: boolean
  progress?: DownloadProgress
}

export function DownloadIndicator({ isDownloading, progress }: DownloadIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Elapsed-time tracking
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Close dropdown when clicking outside
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

  // Track download start/stop to record startedAt
  useEffect(() => {
    if (isDownloading && startedAt == null) setStartedAt(Date.now())
    if (!isDownloading) setStartedAt(null)
  }, [isDownloading, startedAt])

  // Tick every second only while the dropdown is open AND downloading
  useEffect(() => {
    if (!isDownloading || !isOpen) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isDownloading, isOpen])

  // Calculate progress values BEFORE conditional return (for useEffect dependencies)
  const useIngredients = progress?.totalIngredients !== undefined && progress.totalIngredients > 0
  const completed = useIngredients
    ? (progress?.completedIngredients || 0)
    : (progress?.completedResources || 0)
  const total = useIngredients
    ? (progress?.totalIngredients || 0)
    : (progress?.totalResources || 0)
  const failed = useIngredients
    ? (progress?.failedIngredients || 0)
    : (progress?.failedResources || 0)
  const overallProgress = displayDownloadPercent({
    isDownloading,
    completed,
    total,
    reportedOverall: progress?.overallProgress,
  })

  const elapsedMs = startedAt != null ? now - startedAt : 0
  const elapsedLabel = (() => {
    const s = Math.floor(elapsedMs / 1000)
    const m = Math.floor(s / 60)
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
  })()

  // Debug log for key state changes (MUST be before conditional return)
  useEffect(() => {
    if (progress && !isDownloading && completed === total && total > 0) {
      // intentionally empty
    }
  }, [isDownloading, completed, total, failed, progress])

  // Conditional return AFTER all hooks
  if (!isDownloading && !progress) {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-muted rounded-lg transition-colors"
        title="Download progress"
        aria-label="Download progress"
      >
        {isDownloading ? (
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-accent" />
        )}

        {/* Badge with percentage */}
        {isDownloading && (
          <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-medium px-1 rounded-full min-w-[20px] text-center">
            {overallProgress}%
          </span>
        )}
      </button>

      {/* Mobile: bar at bottom → open up; md+: bar at top → open down */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-1 md:top-full md:bottom-auto md:mt-1 md:mb-0 bg-elevated rounded-lg shadow-lg border border-border p-3 min-w-[280px] z-50">
          {/* Header */}
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
              <CheckCircle2 className="w-4 h-4 text-accent" />
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Elapsed time — visible only while downloading */}
          {isDownloading && startedAt != null && (
            <div className="flex items-center justify-between text-xs text-fg-muted mb-2">
              <span>Elapsed</span>
              <span className="font-mono">{elapsedLabel}</span>
            </div>
          )}

          {/* Current Resource & Ingredient */}
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
