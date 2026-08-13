import { CheckCircle2, Package, XCircle } from 'lucide-react'
import type { ExportProgress } from '../../features/read/useReadCollectionExport'

interface ExportProgressToastProps {
  exportProgress: ExportProgress
}

function isErrorProgress(progress: ExportProgress): boolean {
  return (
    progress.current === -1 ||
    progress.message.includes('Error') ||
    progress.message.includes('failed')
  )
}

export function ExportProgressToast({ exportProgress }: ExportProgressToastProps) {
  if (!exportProgress.isExporting && !exportProgress.message) return null

  const errored = isErrorProgress(exportProgress)

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[280px] animate-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {exportProgress.isExporting ? (
            <Package className="w-6 h-6 text-blue-500 animate-pulse" />
          ) : errored ? (
            <XCircle className="w-6 h-6 text-red-500" />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {exportProgress.isExporting && exportProgress.total > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {exportProgress.current} / {exportProgress.total}
                </span>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {Math.round((exportProgress.current / exportProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p
              className={`text-sm font-medium truncate ${
                errored
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {exportProgress.message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
