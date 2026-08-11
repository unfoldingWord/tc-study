import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

export function LibraryJsonModal(props: {
  resource: ResourceMetadata
  onClose: () => void
}) {
  const { resource, onClose } = props
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Metadata</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
            title="Close"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-gray-50">
          <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto font-mono">
            {JSON.stringify(resource, null, 2)}
          </pre>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-white">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(resource, null, 2))
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}
