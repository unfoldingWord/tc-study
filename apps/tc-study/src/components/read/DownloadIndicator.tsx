import { Download, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { DownloadProgress } from '../../hooks/useBackgroundDownload'

interface DownloadIndicatorProps {
  isDownloading: boolean
  progress?: DownloadProgress
}

export function DownloadIndicator({ isDownloading, progress }: DownloadIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
  const overallProgress = progress?.overallProgress || 0
  
  // Debug log for key state changes (MUST be before conditional return)
  useEffect(() => {
    if (progress && !isDownloading && completed === total && total > 0) {
      console.log('[BG-DL] 🎨 UI ✅ All downloads complete!', { completed, total, failed })
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
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        title="Download progress"
      >
        {isDownloading ? (
          <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        )}
        
        {/* Badge with percentage */}
        {isDownloading && (
          <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] font-medium px-1 rounded-full min-w-[20px] text-center">
            {overallProgress}%
          </span>
        )}
      </button>

      {/* Dropdown - opens upward (nav bar is at bottom) */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[280px] z-50">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
            <Download className="w-4 h-4 text-gray-600" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                {completed} / {total}
              </div>
              <div className="text-xs text-gray-500">
                {overallProgress}%
              </div>
            </div>
            {isDownloading ? (
              <Loader2 className="w-4 h-4 text-green-600 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Current Resource & Ingredient */}
          {isDownloading && (progress?.currentResource || progress?.currentIngredient) && (
            <div className="mt-3 pt-2 border-t border-gray-100 space-y-1">
              {progress.currentResource && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  <span className="truncate font-medium">
                    {progress.currentResource.split('/').pop()}
                  </span>
                </div>
              )}
              {progress.currentIngredient && (
                <div className="flex items-center gap-2 text-xs text-gray-500 pl-3.5">
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
