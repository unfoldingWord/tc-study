import {
  CheckCircle,
  Circle,
  Code,
  Download,
  Eye,
  Loader,
  Trash2,
} from 'lucide-react'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceCompletenessStatus } from '../../lib/services/ResourceCompletenessChecker'
import { getLibraryResourceKey } from './libraryResourceKey'

function CompletenessIcon({ status }: { status: ResourceCompletenessStatus | undefined }) {
  if (!status) return null
  if (status.isComplete) {
    return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" aria-label="Downloaded" />
  }
  if (status.status === 'partial') {
    return <Circle className="w-4 h-4 text-blue-500 flex-shrink-0" aria-label="Partial download" />
  }
  if (status.status === 'error') {
    return (
      <Circle
        className="w-4 h-4 text-red-500 flex-shrink-0"
        aria-label={`Error: ${status.error}`}
      />
    )
  }
  return <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" aria-label="Not downloaded" />
}

export function LibraryResourceCard(props: {
  resource: ResourceMetadata
  completenessStatus: Map<string, ResourceCompletenessStatus>
  downloadingResources: Set<string>
  downloadingIngredients: Set<string>
  downloadProgress: Record<string, number>
  isIngredientDownloaded: (resource: ResourceMetadata, ingredientId: string) => boolean
  onDownloadAll: (resource: ResourceMetadata) => void
  onDownloadIngredient: (resource: ResourceMetadata, ingredientId: string) => void
  onViewJson: (resource: ResourceMetadata) => void
  onDelete: (resource: ResourceMetadata) => void
}) {
  const {
    resource,
    completenessStatus,
    downloadingResources,
    downloadingIngredients,
    downloadProgress,
    isIngredientDownloaded,
    onDownloadAll,
    onDownloadIngredient,
    onViewJson,
    onDelete,
  } = props

  const resourceKey = getLibraryResourceKey(resource)
  const status = completenessStatus.get(resourceKey)
  const isDownloading = downloadingResources.has(resourceKey)

  return (
    <div className="bg-white rounded-xl p-5 hover:shadow-md transition-all duration-200 border border-gray-100 group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-base font-semibold text-gray-900 truncate">{resource.title}</h3>
            <CompletenessIcon status={status} />
            {isDownloading && (
              <span className="text-xs text-blue-600 flex items-center gap-1 flex-shrink-0">
                <Loader className="w-3 h-3 animate-spin" />
                {downloadProgress[resourceKey]?.toFixed(0)}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-gray-50 rounded">{resource.language}</span>
            <span className="px-2 py-0.5 bg-gray-50 rounded">{resource.owner}</span>
            <span className="px-2 py-0.5 bg-gray-50 rounded">{resource.subject}</span>
            {resource.contentMetadata?.ingredients && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                {resource.contentMetadata.ingredients.length} books
              </span>
            )}
          </div>

          {resource.contentMetadata?.ingredients && (
            <div className="mt-4">
              <details className="group/details">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2">
                  <Eye className="w-3 h-3" />
                  <span>
                    {status?.isComplete
                      ? `${resource.contentMetadata.ingredients.length}/${resource.contentMetadata.ingredients.length} downloaded`
                      : `${resource.contentMetadata.ingredients.filter((ing) => isIngredientDownloaded(resource, ing.identifier)).length}/${resource.contentMetadata.ingredients.length} downloaded`}
                  </span>
                </summary>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {resource.contentMetadata.ingredients.map((ing) => {
                    const isDownloaded = isIngredientDownloaded(resource, ing.identifier)
                    const ingredientKey = `${resourceKey}/${ing.identifier}`
                    const ingredientDownloading = downloadingIngredients.has(ingredientKey)
                    return (
                      <div
                        key={ing.identifier}
                        className="relative flex flex-col gap-1.5 text-xs p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group/item"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-gray-900">
                            {ing.identifier}
                          </span>
                          {ingredientDownloading ? (
                            <Loader className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
                          ) : isDownloaded ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                          )}
                        </div>
                        <span className="text-gray-500 text-[11px] truncate">{ing.title}</span>
                        {ingredientDownloading && downloadProgress[ingredientKey] !== undefined && (
                          <div className="text-blue-600 font-medium text-[11px]">
                            {downloadProgress[ingredientKey]?.toFixed(0)}%
                          </div>
                        )}
                        {!isDownloaded && !ingredientDownloading && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDownloadIngredient(resource, ing.identifier)
                            }}
                            className="absolute top-2 right-2 p-1 hover:bg-blue-100 rounded transition-colors opacity-0 group-hover/item:opacity-100"
                            title="Download"
                            aria-label="Download ingredient"
                          >
                            <Download className="w-3 h-3 text-blue-600" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="ml-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!status?.isComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDownloadAll(resource)
              }}
              disabled={isDownloading}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Download all"
              aria-label="Download all"
            >
              {isDownloading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onViewJson(resource)
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="View JSON"
            aria-label="View JSON"
          >
            <Code className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(resource)
            }}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors group/btn"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4 text-gray-400 group-hover/btn:text-red-600" />
          </button>
        </div>
      </div>
    </div>
  )
}
