import { LocationType, type ResourceMetadata } from '@bt-synergy/resource-catalog'
import { Book, Check, Database, Info, Package, Wifi } from 'lucide-react'
import type { ResourceInfo } from '../../contexts/types'

export interface OriginalLanguageResource extends ResourceMetadata {
  isCached: boolean
  isInWorkspace: boolean
  isSupported: boolean
  viewerName?: string
}

interface OriginalLanguageResourceCardProps {
  resource: OriginalLanguageResource
  isSelected: boolean
  onToggle: (resourceKey: string, info: ResourceInfo) => void
  onShowInfo: (e: React.MouseEvent, resource: OriginalLanguageResource) => void
}

function toResourceInfo(resource: OriginalLanguageResource): ResourceInfo {
  return {
    ...resource,
    id: resource.resourceId,
    key: resource.resourceKey,
    category: resource.subject ?? 'scripture',
    location:
      typeof resource.locations?.[0]?.type === 'string'
        ? resource.locations![0].type
        : String(resource.locations?.[0]?.type ?? LocationType.NETWORK),
  } as ResourceInfo
}

export function OriginalLanguageResourceCard({
  resource,
  isSelected,
  onToggle,
  onShowInfo,
}: OriginalLanguageResourceCardProps) {
  const isCached = resource.isCached
  const isInWorkspace = resource.isInWorkspace
  const isLocked = isInWorkspace

  return (
    <button
      key={resource.resourceKey}
      onClick={() => {
        if (isLocked) return
        onToggle(resource.resourceKey, toResourceInfo(resource))
      }}
      disabled={isLocked}
      className={`
        relative p-3 rounded-lg border-2 transition-all text-left
        ${
          isLocked
            ? 'border-accent bg-accent-soft cursor-default'
            : isSelected
              ? 'border-accent bg-accent-soft'
              : 'border-border hover:border-accent hover:bg-accent-soft'
        }
      `}
    >
      {isSelected && (
        <Check
          className={`absolute top-1.5 ${isSelected ? 'right-8' : 'right-1.5'} w-4 h-4 ${
            isLocked ? 'text-accent' : 'text-accent'
          }`}
        />
      )}

      <button
        onClick={(e) => onShowInfo(e, resource)}
        className="absolute top-1.5 right-1.5 p-1 hover:bg-accent-soft rounded transition-colors z-10"
        title="Resource information"
        aria-label="Resource information"
      >
        <Info className="w-3.5 h-3.5 text-accent" />
      </button>

      <div className="font-semibold text-fg text-sm mb-0.5">{resource.title}</div>

      <div className="text-xs text-fg-secondary pb-5">
        <div className="truncate">{resource.owner}</div>
      </div>

      {isInWorkspace ? (
        <span
          title="Already in collection"
          aria-label="Already in collection"
          className="absolute bottom-1.5 left-1.5 inline-flex"
        >
          <Package className="w-3.5 h-3.5 text-panel-2-fg" />
        </span>
      ) : isCached ? (
        <span
          title="Cached offline"
          aria-label="Cached offline"
          className="absolute bottom-1.5 left-1.5 inline-flex"
        >
          <Database className="w-3.5 h-3.5 text-accent" />
        </span>
      ) : (
        <span
          title="Available online"
          aria-label="Available online"
          className="absolute bottom-1.5 left-1.5 inline-flex"
        >
          <Wifi className="w-3.5 h-3.5 text-accent" />
        </span>
      )}

      <Book className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-fg-muted" />
    </button>
  )
}
