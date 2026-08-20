import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { Copy, X } from 'lucide-react'

export function LibraryJsonModal(props: {
  resource: ResourceMetadata
  onClose: () => void
}) {
  const { resource, onClose } = props
  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-json-title"
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted">
          <h2 id="library-json-title" className="text-lg font-semibold text-fg">Metadata</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface rounded-lg transition-colors text-fg-muted hover:text-fg"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-canvas">
          <pre className="text-xs bg-elevated text-fg p-4 rounded-xl overflow-x-auto font-mono border border-border">
            {JSON.stringify(resource, null, 2)}
          </pre>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-muted">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(resource, null, 2))
            }}
            className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
            title="Copy"
            aria-label="Copy metadata JSON"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
