import type { ResourcePackage } from '@bt-synergy/package-storage'
import { Download, FolderOpen, Upload } from 'lucide-react'
import type { RefObject } from 'react'

interface DataCollectionsTabProps {
  packages: ResourcePackage[]
  inputRef: RefObject<HTMLInputElement | null>
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void
  onExportAll: () => void
  onExportOne: (id: string) => void
}

export function DataCollectionsTab({
  packages,
  inputRef,
  onImport,
  onExportAll,
  onExportOne,
}: DataCollectionsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="Import collection"
            aria-label="Import collection"
            data-testid="import-collection-btn"
          >
            <Upload className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
          <button
            onClick={onExportAll}
            disabled={packages.length === 0}
            className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export all collections"
            aria-label="Export all collections"
            data-testid="export-all-collections-btn"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {packages.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No collections</p>
            <p className="text-sm text-gray-500 mt-1">Create collections from the Collections page</p>
          </div>
        ) : (
          packages.map((collection) => {
            const legacy = collection as {
              status?: string
              manifest?: { metadata?: { title?: string; description?: string } }
            }
            return (
              <div
                key={collection.id}
                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
              >
                <div>
                  <h3 className="font-medium text-gray-900">
                    {legacy.manifest?.metadata?.title || collection.name || collection.id}
                  </h3>
                  {(legacy.manifest?.metadata?.description || collection.description) && (
                    <p className="text-sm text-gray-500 mt-1">
                      {legacy.manifest?.metadata?.description || collection.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Status: {legacy.status ?? 'saved'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onExportOne(collection.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Export"
                    aria-label={`Export ${collection.id}`}
                    data-testid={`export-collection-${collection.id}`}
                  >
                    <Download className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
