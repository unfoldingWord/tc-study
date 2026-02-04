import { useEffect, useRef } from 'react'
import type { LogEntry } from '../types'

interface DebugLogViewerProps {
  logs: LogEntry[]
  isGenerating: boolean
}

export function DebugLogViewer({ logs, isGenerating }: DebugLogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return 'text-green-300 bg-green-500/20 border-green-500/30'
      case 'error':
        return 'text-red-300 bg-red-500/20 border-red-500/30'
      case 'warning':
        return 'text-yellow-300 bg-yellow-500/20 border-yellow-500/30'
      case 'debug':
        return 'text-gray-400 bg-gray-700/30 border-gray-600/30'
      default:
        return 'text-blue-300 bg-blue-500/20 border-blue-500/30'
    }
  }

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'debug':
        return '🔍'
      default:
        return 'ℹ️'
    }
  }

  return (
    <div className="relative">
      {isGenerating && (
        <div className="absolute top-0 right-0">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <span className="animate-spin mr-2">⏳</span>
            Generating...
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="h-[600px] overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 font-mono text-xs shadow-inner"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-12">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">No logs yet. Start generating to see debug output.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${getLevelColor(log.level)} backdrop-blur-sm`}
              >
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0">{getLevelIcon(log.level)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-70">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      <span className="text-xs font-semibold uppercase opacity-70">
                        {log.level}
                      </span>
                    </div>
                    <div className="mt-1 break-words">{log.message}</div>
                    {log.data && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100 transition-opacity">
                          Show data
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-800/50 rounded-lg text-xs overflow-x-auto border border-gray-700/50">
                          {typeof log.data === 'string' 
                            ? log.data 
                            : JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
