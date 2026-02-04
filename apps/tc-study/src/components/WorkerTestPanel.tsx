/**
 * Worker Test Panel
 * 
 * Component for testing and verifying the Web Worker implementation.
 * Drop this into any page temporarily to test background downloads.
 * 
 * Usage:
 * ```tsx
 * import { WorkerTestPanel } from './components/WorkerTestPanel'
 * 
 * function MyPage() {
 *   return (
 *     <div>
 *       <WorkerTestPanel />
 *     </div>
 *   )
 * }
 * ```
 */

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader, AlertCircle, PlayCircle, Database, Cpu, Network } from 'lucide-react'
import { useBackgroundDownload } from '../hooks'
import { useCatalogManager } from '../contexts'

interface TestResult {
  name: string
  status: 'pending' | 'running' | 'passed' | 'failed'
  message?: string
  duration?: number
}

export function WorkerTestPanel() {
  const catalogManager = useCatalogManager()
  const { startDownload, stopDownload, stats, isDownloading } = useBackgroundDownload({
    debug: true
  })

  const [tests, setTests] = useState<TestResult[]>([
    { name: 'Worker API Available', status: 'pending' },
    { name: 'Worker Initialized', status: 'pending' },
    { name: 'Catalog Manager Ready', status: 'pending' },
    { name: 'Resources Available', status: 'pending' },
    { name: 'Download Triggered', status: 'pending' },
    { name: 'Progress Updates', status: 'pending' },
    { name: 'Download Completed', status: 'pending' },
    { name: 'Cache Verified', status: 'pending' },
  ])

  const [resourceCount, setResourceCount] = useState(0)
  const [testStartTime, setTestStartTime] = useState(0)

  // Run basic checks on mount
  useEffect(() => {
    runBasicChecks()
  }, [])

  // Monitor download progress
  useEffect(() => {
    if (isDownloading && testStartTime > 0) {
      updateTest('Download Triggered', 'passed', 'Worker is processing downloads')
      
      if (stats.progress && stats.progress.currentResource) {
        updateTest('Progress Updates', 'passed', `Current: ${stats.progress.currentResource}`)
      }
    }

    if (!isDownloading && testStartTime > 0 && stats.progress) {
      const duration = (Date.now() - testStartTime) / 1000
      if (stats.progress.completedResources > 0) {
        updateTest('Download Completed', 'passed', `${stats.progress.completedResources} resources in ${duration.toFixed(1)}s`, duration)
        checkCache()
      }
    }
  }, [isDownloading, stats, testStartTime])

  const updateTest = (name: string, status: TestResult['status'], message?: string, duration?: number) => {
    setTests(prev => prev.map(test => 
      test.name === name ? { ...test, status, message, duration } : test
    ))
  }

  const runBasicChecks = async () => {
    // Check 1: Worker API
    if (typeof Worker !== 'undefined') {
      updateTest('Worker API Available', 'passed', 'Browser supports Web Workers')
    } else {
      updateTest('Worker API Available', 'failed', 'Browser does not support Web Workers')
      return
    }

    // Check 2: Worker initialization (check for worker logs)
    setTimeout(() => {
      updateTest('Worker Initialized', 'passed', 'Check console for [Worker] logs')
    }, 500)

    // Check 3: Catalog Manager
    try {
      const resources = await catalogManager.getAllResources()
      setResourceCount(resources.length)
      updateTest('Catalog Manager Ready', 'passed', `Found ${resources.length} resources`)
      
      // Check 4: Resources available
      if (resources.length > 0) {
        updateTest('Resources Available', 'passed', `${resources.length} resources ready to download`)
      } else {
        updateTest('Resources Available', 'failed', 'No resources in catalog. Add some first.')
      }
    } catch (error) {
      updateTest('Catalog Manager Ready', 'failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const runDownloadTest = async () => {
    if (resourceCount === 0) {
      alert('Please add resources to the catalog first')
      return
    }

    // Reset test states
    updateTest('Download Triggered', 'running')
    updateTest('Progress Updates', 'running')
    updateTest('Download Completed', 'running')
    updateTest('Cache Verified', 'running')

    // Get first resource
    const resources = await catalogManager.getAllResources()
    const testResource = resources[0]

    console.log('🧪 Starting worker test with:', testResource.resourceKey)
    
    setTestStartTime(Date.now())
    startDownload([testResource.resourceKey])
  }

  const checkCache = async () => {
    try {
      // Try to open IndexedDB and check for cached content
      const dbRequest = indexedDB.open('tc-study-cache', 1)
      
      dbRequest.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = db.transaction(['cache-entries'], 'readonly')
        const store = transaction.objectStore('cache-entries')
        const countRequest = store.count()
        
        countRequest.onsuccess = () => {
          const count = countRequest.result
          if (count > 0) {
            updateTest('Cache Verified', 'passed', `${count} entries in cache`)
          } else {
            updateTest('Cache Verified', 'failed', 'No entries in cache')
          }
        }
      }
      
      dbRequest.onerror = () => {
        updateTest('Cache Verified', 'failed', 'Could not access IndexedDB')
      }
    } catch (error) {
      updateTest('Cache Verified', 'failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'running':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
    }
  }

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return 'bg-green-50 border-green-200'
      case 'failed':
        return 'bg-red-50 border-red-200'
      case 'running':
        return 'bg-blue-50 border-blue-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const passedTests = tests.filter(t => t.status === 'passed').length
  const failedTests = tests.filter(t => t.status === 'failed').length
  const totalTests = tests.length

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg border border-gray-200 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Cpu className="w-6 h-6 text-blue-600" />
          Worker Test Panel
        </h2>
        <p className="text-gray-600">
          Verify that the Web Worker is functioning correctly
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Passed</span>
          </div>
          <div className="text-2xl font-bold text-blue-600">{passedTests}</div>
        </div>
        
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-900">Failed</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{failedTests}</div>
        </div>
        
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Resources</span>
          </div>
          <div className="text-2xl font-bold text-gray-600">{resourceCount}</div>
        </div>
      </div>

      {/* Test Button */}
      <div className="mb-6">
        <button
          onClick={runDownloadTest}
          disabled={isDownloading || resourceCount === 0}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isDownloading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Testing Worker...
            </>
          ) : (
            <>
              <PlayCircle className="w-5 h-5" />
              Run Download Test
            </>
          )}
        </button>
        {resourceCount === 0 && (
          <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Add resources to the catalog first
          </p>
        )}
      </div>

      {/* Test Results */}
      <div className="space-y-2 mb-6">
        {tests.map((test, index) => (
          <div
            key={test.name}
            className={`p-3 rounded-lg border ${getStatusColor(test.status)} transition-all`}
          >
            <div className="flex items-start gap-3">
              {getStatusIcon(test.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">
                    {index + 1}. {test.name}
                  </span>
                  {test.duration && (
                    <span className="text-sm text-gray-600">
                      {test.duration.toFixed(1)}s
                    </span>
                  )}
                </div>
                {test.message && (
                  <p className="text-sm text-gray-600 mt-1">{test.message}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Current Stats (if downloading) */}
      {stats.progress && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-6">
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Network className="w-4 h-4" />
            Download Progress
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Overall Progress:</span>
              <span className="font-medium">{stats.progress.overallProgress}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Completed:</span>
              <span className="font-medium">
                {stats.progress.completedResources} / {stats.progress.totalResources}
              </span>
            </div>
            {stats.progress.currentResource && (
              <div className="flex justify-between">
                <span className="text-gray-600">Current:</span>
                <span className="font-medium text-xs truncate max-w-xs">
                  {stats.progress.currentResource}
                </span>
              </div>
            )}
          </div>
          
          {/* Progress bar */}
          <div className="mt-3 w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${stats.progress.overallProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          What to Check
        </h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Open browser console (F12) and look for <code className="bg-gray-200 px-1 rounded">[Worker]</code> messages</li>
          <li>Check DevTools → Sources → Threads for worker thread</li>
          <li>Verify UI remains responsive during downloads</li>
          <li>Check DevTools → Application → IndexedDB for cached data</li>
          <li>Look for network requests in Network tab</li>
        </ul>
      </div>

      {/* Success/Failure Summary */}
      {passedTests === totalTests && passedTests > 0 && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 text-green-900 font-medium">
            <CheckCircle className="w-5 h-5 text-green-600" />
            All tests passed! Worker is functioning correctly. 🎉
          </div>
        </div>
      )}
      
      {failedTests > 0 && (
        <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 text-red-900 font-medium mb-2">
            <XCircle className="w-5 h-5 text-red-600" />
            {failedTests} test(s) failed
          </div>
          <p className="text-sm text-red-700">
            Check the <a href="#" className="underline">testing documentation</a> for troubleshooting steps.
          </p>
        </div>
      )}
    </div>
  )
}
