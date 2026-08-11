import {
  AlertCircle,
  CheckCircle,
  Database,
  Info,
  Loader2,
  Package,
  Wifi,
} from 'lucide-react'
import { getSubjectIcon } from '../../../utils/resourceHelpers'
import type { ResourceInfo } from '../../../contexts/types'

interface ResourceSelectorGridItemProps {
  resource: ResourceInfo
  isResourceDisabled: boolean
  orgName: string
  langName: string
  fullResource: ResourceInfo | undefined
  fetchingInfo: boolean
  onShowInfo: (e: React.MouseEvent, resource: ResourceInfo) => void
}

export function ResourceSelectorGridItem({
  resource,
  isResourceDisabled,
  orgName,
  langName,
  fullResource,
  fetchingInfo,
  onShowInfo,
}: ResourceSelectorGridItemProps) {
  const Icon = getSubjectIcon(resource.category || 'Other')
  const isCached = fullResource?.isCached || false
  const isInWorkspace = fullResource?.isInWorkspace || false
  const hasDependencies = fullResource?.hasDependencies || false
  const dependenciesAvailable = fullResource?.dependenciesAvailable !== false
  const missingDeps = (fullResource?.missingDependencies || []) as Array<{
    dependency: { resourceType: string }
    displayName: string
  }>

  return (
    <>
      <div className={`font-semibold text-sm mb-0.5 ${isResourceDisabled ? 'text-gray-400' : 'text-gray-900'}`}>
        {resource.title}
      </div>

      <div className="text-xs text-gray-500 pb-2">
        <div className="truncate">{orgName}</div>
        <div className="text-gray-400">{langName}</div>
      </div>

      {hasDependencies && (
        <div className="text-xs mb-4">
          {dependenciesAvailable ? (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3 h-3 flex-shrink-0" />
              <span>Dependencies OK</span>
            </div>
          ) : (
            <div className="text-red-600">
              <div className="flex items-center gap-1 mb-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="font-semibold">Missing:</span>
              </div>
              {missingDeps.map((dep) => (
                <div key={dep.dependency.resourceType} className="ml-4 text-xs">
                  • {dep.displayName}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={(e) => onShowInfo(e, resource)}
        disabled={fetchingInfo}
        className="absolute top-1.5 right-1.5 p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
        title="Resource information"
        aria-label="Resource information"
      >
        {fetchingInfo ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
        ) : (
          <Info className="w-3.5 h-3.5 text-blue-600" />
        )}
      </button>

      {isInWorkspace ? (
        <div title="Already in collection">
          <Package className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-purple-600" />
        </div>
      ) : isCached ? (
        <div title="Cached offline">
          <Database className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-green-600" />
        </div>
      ) : (
        <div title="Available online">
          <Wifi className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-blue-500" />
        </div>
      )}

      <Icon className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-gray-400" />
    </>
  )
}
