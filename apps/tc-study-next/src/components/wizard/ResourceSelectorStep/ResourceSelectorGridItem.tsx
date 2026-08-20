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
      <div className={`font-semibold text-sm mb-0.5 ${isResourceDisabled ? 'text-fg-muted' : 'text-fg'}`}>
        {resource.title}
      </div>

      <div className="text-xs text-fg-secondary pb-2">
        <div className="truncate">{orgName}</div>
        <div className="text-fg-muted">{langName}</div>
      </div>

      {hasDependencies && (
        <div className="text-xs mb-4">
          {dependenciesAvailable ? (
            <div className="flex items-center gap-1 text-accent">
              <CheckCircle className="w-3 h-3 flex-shrink-0" />
              <span>Dependencies OK</span>
            </div>
          ) : (
            <div className="text-danger">
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
        className="absolute top-1.5 right-1.5 p-1 hover:bg-accent-soft rounded transition-colors disabled:opacity-50"
        title="Resource information"
        aria-label="Resource information"
      >
        {fetchingInfo ? (
          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
        ) : (
          <Info className="w-3.5 h-3.5 text-accent" />
        )}
      </button>

      {isInWorkspace ? (
        <div title="Already in collection">
          <Package className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-panel-2-fg" />
        </div>
      ) : isCached ? (
        <div title="Cached offline">
          <Database className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-accent" />
        </div>
      ) : (
        <div title="Available online">
          <Wifi className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-accent" />
        </div>
      )}

      <Icon className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-fg-muted" />
    </>
  )
}
