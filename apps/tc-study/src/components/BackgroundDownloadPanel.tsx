/**
 * Background Download Panel
 * 
 * UI for triggering and monitoring background resource downloads
 */

import { Download, CheckCircle, XCircle, Loader, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBackgroundDownloadManager } from '../contexts'
import type { DownloadProgress } from '../lib/services/BackgroundDownloadManager'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

export function BackgroundDownloadPanel() {
  const downloadManager = useBackgroundDownloadManager()
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [isActive, setIsActive] = useState(false)

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
    return (
      <Card className="shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-accent-soft p-3">
            <Download className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="mb-2 text-lg font-semibold text-fg">Background Download</h3>
            <p className="mb-4 text-sm text-fg-secondary">
              Download all resources in the background for offline access. Resources will be downloaded in priority order and cached locally.
            </p>
            <Button
              onClick={handleStartDownload}
              aria-label="Start Background Download"
              title="Start Background Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isActive ? (
              <>
                <Loader className="h-5 w-5 animate-spin text-accent" />
                <h3 className="text-lg font-semibold text-fg">Downloading Resources...</h3>
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 text-valid-fg" />
                <h3 className="text-lg font-semibold text-fg">Download Complete</h3>
              </>
            )}
          </div>
          {isActive && (
            <Button variant="outline" size="md" onClick={handleCancel} className="h-auto px-3 py-1.5 text-sm">
              Cancel
            </Button>
          )}
        </div>

        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-secondary">
                {progress.completedResources} of {progress.totalResources} resources
              </span>
              <span className="font-medium text-fg">{progress.overallProgress}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted">
              <div
                className="h-2.5 rounded-full bg-accent-fill transition-all duration-300"
                style={{ width: `${progress.overallProgress}%` }}
              />
            </div>
          </div>
        )}

        {progress?.currentResource && isActive && (
          <div className="rounded-lg border border-border-subtle bg-accent-soft p-3">
            <div className="mb-1 text-sm text-fg-secondary">Current:</div>
            <div className="mb-2 font-medium text-fg">{progress.currentResource}</div>
            <div className="h-1.5 w-full rounded-full bg-accent-soft">
              <div
                className="h-1.5 rounded-full bg-accent-fill transition-all duration-150"
                style={{ width: `${progress.currentResourceProgress}%` }}
              />
            </div>
          </div>
        )}

        {progress && (
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-valid-fg" />
              <span className="text-fg-secondary">{progress.completedResources} completed</span>
            </div>
            {progress.failedResources > 0 && (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-danger" />
                <span className="text-fg-secondary">{progress.failedResources} failed</span>
              </div>
            )}
          </div>
        )}

        {progress && progress.tasks.length > 0 && (
          <details className="mt-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary hover:text-fg">
              <AlertCircle className="h-4 w-4" />
              View detailed progress ({progress.tasks.length} resources)
            </summary>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {progress.tasks.map((task) => (
                <div
                  key={task.resourceKey}
                  className="flex items-center gap-3 rounded p-2 text-sm hover:bg-muted"
                >
                  {task.status === 'completed' && (
                    <CheckCircle className="h-4 w-4 shrink-0 text-valid-fg" />
                  )}
                  {task.status === 'downloading' && (
                    <Loader className="h-4 w-4 shrink-0 animate-spin text-accent" />
                  )}
                  {task.status === 'failed' && (
                    <XCircle className="h-4 w-4 shrink-0 text-danger" />
                  )}
                  {task.status === 'pending' && (
                    <div className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{task.resourceKey}</div>
                    {task.message && <div className="text-xs text-fg-muted">{task.message}</div>}
                    {task.error && <div className="text-xs text-danger">{task.error}</div>}
                  </div>
                  {task.status === 'downloading' && (
                    <div className="shrink-0 text-xs text-fg-secondary">{task.progress}%</div>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  )
}
