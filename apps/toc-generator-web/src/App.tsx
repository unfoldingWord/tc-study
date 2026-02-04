import { useState } from 'react'
import { DebugLogViewer } from './components/DebugLogViewer'
import { LoginScreen } from './components/LoginScreen'
import { TocGeneratorForm } from './components/TocGeneratorForm'
import { useAuth } from './hooks/useAuth'
import type { LogEntry } from './types'

function App() {
  const { isAuthenticated, token, server, login, logout } = useAuth()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const addLog = (entry: LogEntry) => {
    setLogs(prev => [...prev, entry])
  }

  const clearLogs = () => {
    setLogs([])
  }

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to sign out? This will clear your saved token.')) {
      logout()
      clearLogs() // Also clear logs when logging out
    }
  }

  // Show login screen if not authenticated
  if (!isAuthenticated || !token || !server) {
    return <LoginScreen onLogin={login} />
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  TOC Generator
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  Generate Table of Contents files for Door43 resources
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-xs font-medium text-gray-500">Server</span>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{server}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200 flex items-center gap-2"
                title="Sign out and clear saved token"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="card p-8">
            <TocGeneratorForm
              defaultServer={server}
              defaultToken={token}
              onGenerateStart={() => {
                setIsGenerating(true)
                clearLogs()
              }}
              onGenerateComplete={() => setIsGenerating(false)}
              onLog={addLog}
            />
          </div>

          {/* Right: Debug Logs */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Debug Logs</h2>
              </div>
              <button
                onClick={clearLogs}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={logs.length === 0}
              >
                Clear
              </button>
            </div>
            <DebugLogViewer logs={logs} isGenerating={isGenerating} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
