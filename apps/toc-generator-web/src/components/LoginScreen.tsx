import { Door43ApiClient } from '@bt-synergy/door43-api'
import { FormEvent, useEffect, useState } from 'react'

interface LoginScreenProps {
  onLogin: (token: string, server: string) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [server, setServer] = useState('git.door43.org')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [useToken, setUseToken] = useState(true) // Default to token input
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if there's a saved token in localStorage (for quick reference)
  useEffect(() => {
    const savedToken = localStorage.getItem('toc_generator_token')
    if (savedToken) {
      // If there's a saved token, suggest using it
      // But don't auto-fill for security reasons
      setUseToken(true)
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (useToken) {
        // Use provided token directly
        if (!token.trim()) {
          throw new Error('Token is required')
        }
        onLogin(token.trim(), server)
      } else {
        // Generate token from username/password
        if (!username.trim() || !password.trim()) {
          throw new Error('Username and password are required')
        }

        const baseUrl = server.startsWith('http') ? server : `https://${server}`
        const client = new Door43ApiClient({ baseUrl })
        
        const generatedToken = await client.createPersonalAccessToken(
          username.trim(),
          password.trim(),
          'toc-generator-web'
        )
        
        onLogin(generatedToken, server)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full card p-10">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            TOC Generator
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            Sign in to generate Table of Contents files for Door43 resources
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="server" className="label">
              Server
            </label>
            <input
              type="text"
              id="server"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="useToken"
                checked={useToken}
                onChange={(e) => setUseToken(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
              <label htmlFor="useToken" className="ml-3 block text-sm font-medium text-gray-700 cursor-pointer">
                Use existing token
              </label>
            </div>
            {!useToken && (
              <button
                type="button"
                onClick={() => setUseToken(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Switch to token
              </button>
            )}
          </div>

          {useToken ? (
            <div>
              <label htmlFor="token" className="label">
                Personal Access Token <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your personal access token"
                className="input-field"
                required
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                You can generate a token from your Door43 account settings
              </p>
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border-l-4 border-blue-400 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Note:</span> We'll generate a token automatically. Your password won't be saved.
                </p>
              </div>
              <div>
                <label htmlFor="username" className="label">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Door43 username"
                  className="input-field"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="password" className="label">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Door43 password"
                  className="input-field"
                  required
                />
                <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  We'll generate a personal access token for you
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
