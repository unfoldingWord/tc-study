import { TocGenerator, getGenerator } from '@bt-synergy/toc-generator-cli'
import { FormEvent, useState } from 'react'
import type { LogEntry, TocGeneratorFormData, TocGeneratorPreview, TocGeneratorResult } from '../types'

interface TocGeneratorFormProps {
  defaultServer?: string
  defaultToken?: string
  onGenerateStart: () => void
  onGenerateComplete: () => void
  onLog: (entry: LogEntry) => void
}

export function TocGeneratorForm({ 
  defaultServer = 'git.door43.org',
  defaultToken,
  onGenerateStart, 
  onGenerateComplete, 
  onLog 
}: TocGeneratorFormProps) {
  const [formData, setFormData] = useState<TocGeneratorFormData>({
    server: defaultServer,
    owner: '',
    language: '',
    resourceId: 'tw',
    builder: 'tw',
    tocFilePath: 'toc.json',
    token: defaultToken,
  })

  const [preview, setPreview] = useState<TocGeneratorPreview | null>(null)
  const [result, setResult] = useState<TocGeneratorResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [generator, setGenerator] = useState<TocGenerator | null>(null)
  const [showTocJson, setShowTocJson] = useState(false)

  const addLog = (level: LogEntry['level'], message: string, data?: any) => {
    onLog({
      timestamp: new Date(),
      level,
      message,
      data,
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!formData.owner || !formData.language || !formData.resourceId) {
      addLog('error', 'Please fill in all required fields')
      return
    }

    setIsGenerating(true)
    onGenerateStart()
    setPreview(null)
    setResult(null)

    try {
      addLog('info', 'Step 1: Generating ingredients preview...')
      addLog('debug', 'Form data:', formData)

      // Get the builder
      const generatorInfo = getGenerator(formData.builder)
      if (!generatorInfo) {
        throw new Error(`Unknown builder: ${formData.builder}`)
      }

      addLog('info', `Using builder: ${generatorInfo.name}`)

      // Create generator instance
      const gen = new TocGenerator({
        server: formData.server,
        owner: formData.owner,
        language: formData.language,
        resourceId: formData.resourceId,
        ref: formData.ref,
        branch: formData.branch,
        tocBuilder: generatorInfo.builder,
        tocFilePath: formData.tocFilePath || 'toc.json',
        username: formData.username,
        password: formData.password,
        token: formData.token,
        debug: true, // Always enable debug in web app
      })
      
      setGenerator(gen)

      // Override console methods to capture logs
      const originalLog = console.log
      const originalError = console.error
      const originalWarn = console.warn

      console.log = (...args: any[]) => {
        originalLog(...args)
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        addLog('debug', message)
      }

      console.error = (...args: any[]) => {
        originalError(...args)
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        addLog('error', message)
      }

      console.warn = (...args: any[]) => {
        originalWarn(...args)
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        addLog('warning', message)
      }

      // Generate preview (step 1)
      const previewResult = await gen.generatePreview()

      // Restore console methods
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn

      // Debug: Log the preview result
      console.log('Preview result:', previewResult)
      addLog('debug', 'Preview result:', previewResult)

      setPreview(previewResult)

      if (previewResult.success) {
        addLog('success', `✅ Preview generated successfully!`)
        addLog('info', `Found ${previewResult.ingredientsCount} ingredients from ${previewResult.fileCount} files`)
        addLog('info', `Using ref: ${previewResult.gitRef}`)
        if (previewResult.performanceMetrics) {
          const totalSeconds = (previewResult.performanceMetrics.totalMs / 1000).toFixed(2)
          addLog('info', `Processing time: ${totalSeconds}s`)
        }
      } else {
        addLog('error', `❌ Failed to generate preview: ${previewResult.error}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addLog('error', `❌ Error: ${errorMessage}`)
      if (error instanceof Error && error.stack) {
        addLog('debug', 'Stack trace:', error.stack)
      }
      setPreview({
        success: false,
        ingredients: [],
        ingredientsCount: 0,
        gitRef: formData.ref || 'master',
        fileCount: 0,
        error: errorMessage,
      })
    } finally {
      setIsGenerating(false)
      onGenerateComplete()
    }
  }

  const handleCommit = async () => {
    if (!preview || !preview.success || !generator) {
      return
    }

    setIsCommitting(true)
    onGenerateStart()
    setResult(null)

    try {
      addLog('info', 'Step 2: Committing ingredients to branch...')

      // Override console methods to capture logs
      const originalLog = console.log
      const originalError = console.error
      const originalWarn = console.warn

      console.log = (...args: any[]) => {
        originalLog(...args)
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        addLog('debug', message)
      }

      console.error = (...args: any[]) => {
        originalError(...args)
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        addLog('error', message)
      }

      console.warn = (...args: any[]) => {
        originalWarn(...args)
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        addLog('warning', message)
      }

      // Commit ingredients (step 2)
      const commitResult = await generator.commitIngredients(
        preview.ingredients,
        preview.gitRef,
        formData.branch
      )

      // Restore console methods
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn

      setResult(commitResult)

      if (commitResult.success) {
        addLog('success', `✅ TOC committed successfully!`)
        addLog('info', `Committed ${commitResult.ingredientsCount} ingredients`)
        addLog('info', `File path: ${commitResult.filePath}`)
        if (commitResult.branch) {
          addLog('info', `Branch: ${commitResult.branch}`)
        }
        if (commitResult.commitSha) {
          addLog('info', `Commit SHA: ${commitResult.commitSha}`)
        }
      } else {
        addLog('error', `❌ Failed to commit TOC: ${commitResult.error}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addLog('error', `❌ Error: ${errorMessage}`)
      if (error instanceof Error && error.stack) {
        addLog('debug', 'Stack trace:', error.stack)
      }
      setResult({
        success: false,
        ingredientsCount: preview.ingredientsCount,
        filePath: formData.tocFilePath || 'toc.json',
        error: errorMessage,
      })
    } finally {
      setIsCommitting(false)
      onGenerateComplete()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full"></div>
          <h2 className="text-xl font-bold text-gray-900">Repository Information</h2>
        </div>
        <div className="space-y-5">
          <div>
            <label htmlFor="server" className="label">
              Server
            </label>
            <input
              type="text"
              id="server"
              value={formData.server}
              onChange={(e) => setFormData({ ...formData, server: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="owner" className="label">
                Owner <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="owner"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="e.g., es-419_gl"
                className="input-field"
                required
              />
            </div>

            <div>
              <label htmlFor="language" className="label">
                Language <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="language"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                placeholder="e.g., es-419"
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="resourceId" className="label">
                Resource ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="resourceId"
                value={formData.resourceId}
                onChange={(e) => setFormData({ ...formData, resourceId: e.target.value })}
                placeholder="e.g., tw"
                className="input-field"
                required
              />
            </div>

            <div>
              <label htmlFor="builder" className="label">
                Builder
              </label>
              <select
                id="builder"
                value={formData.builder}
                onChange={(e) => setFormData({ ...formData, builder: e.target.value })}
                className="input-field"
              >
                <option value="tw">Translation Words</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
          <h2 className="text-xl font-bold text-gray-900">Options</h2>
        </div>
        <div className="space-y-5">
          <div>
            <label htmlFor="ref" className="block text-sm font-medium text-gray-700">
              Reference (optional)
            </label>
            <input
              type="text"
              id="ref"
              value={formData.ref || ''}
              onChange={(e) => setFormData({ ...formData, ref: e.target.value || undefined })}
              placeholder="e.g., v37 or master"
              className="input-field"
            />
            <p className="mt-1 text-xs text-gray-500">Git reference to read files from (defaults to latest release tag)</p>
          </div>

          <div>
            <label htmlFor="branch" className="block text-sm font-medium text-gray-700">
              Branch (optional)
            </label>
            <input
              type="text"
              id="branch"
              value={formData.branch || ''}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value || undefined })}
              placeholder="Auto-generated if not specified"
              className="input-field"
            />
            <p className="mt-1 text-xs text-gray-500">Branch name to create/commit to</p>
          </div>

          <div>
            <label htmlFor="tocFilePath" className="block text-sm font-medium text-gray-700">
              TOC File Path
            </label>
            <input
              type="text"
              id="tocFilePath"
              value={formData.tocFilePath || 'toc.json'}
              onChange={(e) => setFormData({ ...formData, tocFilePath: e.target.value })}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {!defaultToken && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Authentication</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                Token (preferred)
              </label>
              <input
                type="password"
                id="token"
                value={formData.token || ''}
                onChange={(e) => setFormData({ ...formData, token: e.target.value || undefined })}
                placeholder="Personal access token"
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={formData.username || ''}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value || undefined })}
                  placeholder="Door43 username"
                  className="input-field"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value || undefined })}
                  placeholder="Door43 password"
                  className="input-field"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {defaultToken && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">Using saved authentication</p>
            <p className="text-xs text-blue-700 mt-0.5">Token is securely stored in your browser</p>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {preview && (
        <div className="mt-6">
          {preview.success ? (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-blue-900">Preview Generated</h3>
                  <p className="text-sm text-blue-700 mt-0.5">Review the ingredients before committing</p>
                </div>
              </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{preview.ingredientsCount}</div>
              <div className="text-sm text-gray-600 mt-1">Ingredients</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{preview.fileCount}</div>
              <div className="text-sm text-gray-600 mt-1">Files Processed</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="text-lg font-bold text-blue-600">{preview.gitRef}</div>
              <div className="text-sm text-gray-600 mt-1">Git Reference</div>
            </div>
          </div>

          {preview.performanceMetrics && (
            <div className="bg-white rounded-lg p-4 border border-blue-200 mt-4">
              <div className="text-sm font-semibold text-gray-700 mb-2">Performance</div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Total time: {(preview.performanceMetrics.totalMs / 1000).toFixed(2)}s</div>
                {preview.performanceMetrics.zipballDownloadMs > 0 && (
                  <div>Zipball download: {preview.performanceMetrics.zipballDownloadMs}ms</div>
                )}
                <div>Ingredients building: {preview.performanceMetrics.ingredientsBuildMs}ms</div>
              </div>
            </div>
          )}

          {/* TOC JSON Preview */}
          <div className="bg-white rounded-lg border border-blue-200 mt-4">
            <button
              type="button"
              onClick={() => setShowTocJson(!showTocJson)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">View TOC JSON</span>
              </div>
              <svg 
                className={`w-5 h-5 text-gray-500 transition-transform ${showTocJson ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showTocJson && (
              <div className="border-t border-gray-200 p-4">
                <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                    {JSON.stringify({
                      version: '1.0.0',
                      generatedAt: new Date().toISOString(),
                      ref: preview.gitRef,
                      ingredients: preview.ingredients,
                    }, null, 2)}
                  </pre>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>This is the TOC structure that will be committed to the repository</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting}
              className="btn-primary flex items-center gap-2 flex-1"
            >
              {isCommitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Committing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm & Commit to Branch
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null)
                setGenerator(null)
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
          ) : (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm font-semibold text-red-700">Preview failed: {preview.error || 'Unknown error'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={isGenerating || (preview?.success && !result)}
            className="btn-primary flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating Preview...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {preview?.success ? 'Regenerate Preview' : 'Generate Preview'}
              </>
            )}
          </button>

          {result && (
            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              result.success 
                ? 'bg-green-50 text-green-700 border border-green-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {result.success ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold">Committed: {result.ingredientsCount} ingredients</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="text-sm font-semibold">Failed: {result.error}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}
