/**
 * Background Download Panel
 * 
 * UI for triggering and monitoring background resource downloads
 */

import { Download, CheckCircle, XCircle, Loader, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBackgroundDownloadManager } from '../contexts'
import type { DownloadProgress } from '../lib/services/BackgroundDownloadManager'

export function BackgroundDownloadPanel() {
  const downloadManager = useBackgroundDownloadManager()
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [isActive, setIsActive] = useState(false)

  // Set up progress monitoring
  useEffect(() => {
    downloadManager.onProgress((newProgress) => {
      setProgress(newProgress)
      setIsActive(downloadManager.isActive())
    })
  }, [downloadManager])

  const handleStartDownload = async () => {
    setIsActive(true)
    try {
      await downloadManager.downloadAllResources()
    } catch (error) {
      console.error('Download error:', error)
    } finally {
      setIsActive(false)
    }
  }

  const handleCancel = async () => {
    await downloadManager.cancelDownloads()
  }

  if (!progress && !isActive) {
    // Initial state - no downloads started yet
    return (
      <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <Download className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Background Download
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Download all resources in the background for offline access. Resources will be downloaded in priority order and cached locally.
            </p>
            <button
              onClick={handleStartDownload}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Start Background Download
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Download in progress or completed
  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isActive ? (
              <>
                <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Downloading Resources...
                </h3>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Download Complete
                </h3>
              </>
            )}
          </div>
          {isActive && (
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Overall Progress */}
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {progress.completedResources} of {progress.totalResources} resources
              </span>
              <span className="font-medium text-gray-900">
                {progress.overallProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress.overallProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Current Resource */}
        {progress?.currentResource && isActive && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-sm text-gray-600 mb-1">Current:</div>
            <div className="font-medium text-gray-900 mb-2">
              {progress.currentResource}
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-150"
                style={{ width: `${progress.currentResourceProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        {progress && (
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-gray-600">
                {progress.completedResources} completed
              </span>
            </div>
            {progress.failedResources > 0 && (
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-gray-600">
                  {progress.failedResources} failed
                </span>
              </div>
            )}
          </div>
        )}

        {/* Task List (collapsible) */}
        {progress && progress.tasks.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              View detailed progress ({progress.tasks.length} resources)
            </summary>
            <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
              {progress.tasks.map((task) => (
                <div
                  key={task.resourceKey}
                  className="flex items-center gap-3 p-2 text-sm rounded hover:bg-gray-50"
                >
                  {task.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                  )}
                  {task.status === 'downloading' && (
                    <Loader className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
                  )}
                  {task.status === 'failed' && (
                    <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  )}
                  {task.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {task.resourceKey}
                    </div>
                    {task.message && (
                      <div className="text-xs text-gray-500">{task.message}</div>
                    )}
                    {task.error && (
                      <div className="text-xs text-red-600">{task.error}</div>
                    )}
                  </div>
                  {task.status === 'downloading' && (
                    <div className="text-xs text-gray-600 flex-shrink-0">
                      {task.progress}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
