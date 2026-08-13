/**
 * Collection ZIP export via web worker (Read download button).
 */

import { useCallback, useState } from 'react'
import type { ExportWorkerMessage, ExportWorkerResponse } from '../../workers/collectionExport.worker'

export interface ExportProgress {
  isExporting: boolean
  current: number
  total: number
  message: string
}

const IDLE_PROGRESS: ExportProgress = {
  isExporting: false,
  current: 0,
  total: 0,
  message: '',
}

type ExportCollection = ExportWorkerMessage['data']['collection']

type PackageLike = {
  id: string
  name: string
  version?: string
  description?: string
  resources?: ExportCollection['resources']
  panelLayout?: ExportCollection['panelLayout']
}

/**
 * Export `${languageCode}_tc-helps` via collectionExport worker; tracks progress UI state.
 */
export function useReadCollectionExport(
  currentLanguageCode: string | null,
  packages: PackageLike[]
) {
  const [exportProgress, setExportProgress] = useState<ExportProgress>(IDLE_PROGRESS)

  const handleDirectDownloadCollection = useCallback(async () => {
    if (!currentLanguageCode) return

    const collectionName = `${currentLanguageCode}_tc-helps`
    const collection = packages.find((pkg) => pkg.name === collectionName)

    if (!collection) {
      console.error(`Collection ${collectionName} not found`)
      return
    }

    try {

      setExportProgress({
        isExporting: true,
        current: 0,
        total: 100,
        message: 'Initializing export...',
      })

      const worker = new Worker(new URL('../../workers/collectionExport.worker.ts', import.meta.url), {
        type: 'module',
      })

      worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
        const { type, data } = event.data

        if (type === 'progress') {
          setExportProgress({
            isExporting: true,
            current: data?.progress || 0,
            total: data?.total || 100,
            message: data?.message || 'Exporting...',
          })
        } else if (type === 'complete') {

          if (data?.blob && data?.filename) {
            const url = URL.createObjectURL(data.blob)
            const a = document.createElement('a')
            a.href = url
            a.download = data.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }

          setExportProgress({
            isExporting: false,
            current: 0,
            total: 0,
            message: 'Export complete!',
          })

          setTimeout(() => setExportProgress(IDLE_PROGRESS), 2000)
          worker.terminate()
        } else if (type === 'error') {
          const errorMessage = data?.error || 'Export failed'
          console.error(`❌ Export error: ${errorMessage}`)

          const isIndexedDBError =
            errorMessage.includes('IndexedDB') ||
            errorMessage.includes('database') ||
            errorMessage.includes('Cache store')

          let displayMessage = errorMessage
          if (isIndexedDBError) {
            displayMessage =
              'Export failed: Unable to access cache in background. ' +
              'This may be due to browser restrictions or private browsing mode.'
            console.warn('💡 Consider implementing fallback export method')
          }

          setExportProgress({
            isExporting: false,
            current: -1,
            total: 0,
            message: displayMessage,
          })

          setTimeout(() => setExportProgress(IDLE_PROGRESS), 8000)
          worker.terminate()
        }
      }

      worker.onerror = (error) => {
        console.error(`❌ Worker error:`, error)
        setExportProgress({
          isExporting: false,
          current: 0,
          total: 0,
          message: 'Export failed',
        })
        worker.terminate()
      }

      const message: ExportWorkerMessage = {
        type: 'export',
        data: {
          collection: {
            id: collection.id,
            name: collection.name,
            version: collection.version ?? '1.0',
            description: collection.description,
            resources: collection.resources || [],
            panelLayout: collection.panelLayout || { panels: [] },
          },
          dbConfig: {
            dbName: 'tc-study-cache',
            storeName: 'cache-entries',
            version: 1,
          },
        },
      }

      worker.postMessage(message)
    } catch (error) {
      console.error(`❌ Failed to start collection export:`, error)
      setExportProgress({
        isExporting: false,
        current: 0,
        total: 0,
        message: 'Export failed',
      })
    }
  }, [currentLanguageCode, packages])

  return { exportProgress, handleDirectDownloadCollection }
}
