/**
 * Manifest Preview Component
 * Shows the final package manifest and allows downloading as JSON
 */

import { useState } from 'react'
import { Download, Copy, Check, ArrowLeft, Plus } from 'lucide-react'
import { usePackageStore } from '@/lib/store'

interface ManifestPreviewProps {
  onAddMoreResources?: () => void
  onBackToManage?: () => void
}

export function ManifestPreview({ onAddMoreResources, onBackToManage }: ManifestPreviewProps = {}) {
  const generateManifest = usePackageStore((state) => state.generateManifest)
  const [copied, setCopied] = useState(false)
  
  const manifest = generateManifest()
  const manifestJson = JSON.stringify(manifest, null, 2)
  const statsWithEstimated = manifest.stats as { estimatedSize?: number; totalSize?: number }
  const sizeMb = ((statsWithEstimated.estimatedSize ?? statsWithEstimated.totalSize ?? 0) / (1024 * 1024)).toFixed(1)
  
  // Derive from resources (support both package-builder shape and web manifest shape)
  const resources = manifest.resources as Array<{ owner?: string; metadata?: { owner?: string; language?: string; subjects?: string[] }; language?: { code: string; name: string; direction: string }; content?: { subject?: string } }>
  const organizations = Array.from(new Set(resources.map(r => r.owner ?? r.metadata?.owner ?? '').filter(Boolean)))
  const languagesMap = new Map<string, { code: string; name: string; direction: string }>()
  resources.forEach(r => {
    const code = r.language?.code ?? r.metadata?.language ?? ''
    if (code && !languagesMap.has(code)) {
      languagesMap.set(code, r.language ?? { code, name: code, direction: 'ltr' })
    }
  })
  const languages = Array.from(languagesMap.values())
  const subjects = Array.from(new Set(resources.map(r => r.content?.subject ?? (r.metadata?.subjects?.[0] ?? '')).filter(Boolean)))

  const handleDownload = () => {
    const blob = new Blob([manifestJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${manifest.id}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(manifestJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Preview & Download</h2>
            <p className="text-gray-600">
              Review your package manifest and download the JSON file.
            </p>
          </div>
          <div className="flex gap-2">
            {onBackToManage && (
              <button
                onClick={onBackToManage}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Manage
              </button>
            )}
            {onAddMoreResources && (
              <button
                onClick={onAddMoreResources}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add More Resources
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Package Summary */}
      <div className="mb-6 p-6 bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border border-primary-200">
        <h3 className="font-bold text-lg text-gray-900 mb-4">{manifest.name}</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Resources</div>
            <div className="font-semibold text-gray-900">{manifest.resources.length}</div>
          </div>
          <div>
            <div className="text-gray-500">Estimated Size</div>
            <div className="font-semibold text-gray-900">
              {sizeMb} MB
            </div>
          </div>
          <div>
            <div className="text-gray-500">Format Version</div>
            <div className="font-semibold text-gray-900">{manifest.formatVersion}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-primary-200">
          <div className="text-sm text-gray-600 mb-2">Languages ({languages.length}):</div>
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => (
              <span key={lang.code} className="px-2 py-1 bg-white rounded text-xs">
                {lang.name} ({lang.code})
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm text-gray-600 mb-2">Organizations ({organizations.length}):</div>
          <div className="flex flex-wrap gap-2">
            {organizations.map((org) => (
              <span key={org} className="px-2 py-1 bg-white rounded text-xs">
                {org}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm text-gray-600 mb-2">Subjects ({subjects.length}):</div>
          <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <span key={subject} className="px-2 py-1 bg-white rounded text-xs">
                {subject}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          <Download className="w-5 h-5" />
          Download JSON
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-6 py-3 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors font-medium"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              Copy to Clipboard
            </>
          )}
        </button>
      </div>

      {/* JSON Preview */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-gray-300">{manifest.id}.json</span>
            <span className="text-xs text-gray-400">
              {(new Blob([manifestJson]).size / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm text-gray-100 font-mono">{manifestJson}</code>
        </pre>
      </div>
    </div>
  )
}