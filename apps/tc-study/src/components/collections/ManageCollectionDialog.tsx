/**
 * Dialog for managing resources in a collection
 */

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, BookOpen, Check } from 'lucide-react'
import type { ResourcePackage as WorkspacePackage } from '../../lib/storage/types'
import type { ResourceInfo } from '../../contexts/types'
import type { ResourcePackage as StorageResourcePackage, PackageResource } from '@bt-synergy/package-storage'
import { usePackageStore } from '../../lib/stores'

interface ManageCollectionDialogProps {
  collection: WorkspacePackage | StorageResourcePackage
  isOpen: boolean
  onClose: () => void
  onOpenWizard?: () => void
}

function getResourcesArray(collection: WorkspacePackage | StorageResourcePackage): ResourceInfo[] | PackageResource[] {
  const r = (collection as { resources?: Map<string, ResourceInfo> | PackageResource[] }).resources
  if (r instanceof Map) return Array.from(r.values())
  return r ?? []
}

function resourcesMapToArray(resources: Map<string, ResourceInfo>): ResourceInfo[] {
  return Array.from(resources.values())
}

function arrayToResourcesMap(resources: ResourceInfo[]): Map<string, ResourceInfo> {
  const map = new Map<string, ResourceInfo>()
  resources.forEach(r => map.set(r.key, r))
  return map
}

/** Convert dialog state + collection to package-storage ResourcePackage for save */
function toStoragePackage(
  collection: WorkspacePackage | StorageResourcePackage,
  name: string,
  description: string | undefined,
  resources: ResourceInfo[] | PackageResource[]
): StorageResourcePackage {
  const base = collection as unknown as Record<string, unknown>
  const now = new Date().toISOString()
  const parseKey = (key: string) => {
    const parts = key.split('/')
    return {
      server: 'https://git.door43.org',
      owner: parts[0] || 'unfoldingword',
      language: parts[1] || 'en',
      resourceId: parts[parts.length - 1] || '',
    }
  }
  const packageResources: PackageResource[] = resources.map((r: ResourceInfo | PackageResource) => {
    if ('key' in r && r.key) {
      const { owner, language, resourceId } = parseKey(r.key)
      return { server: (r as ResourceInfo).server || 'https://git.door43.org', owner, language, resourceId, displayName: (r as ResourceInfo).title }
    }
    return r as PackageResource
  })
  const panels = (base.panels as { id: string; name?: string; resourceKeys: string[]; activeIndex?: number }[] | undefined) ?? (base.panelLayout as { panels?: { id: string; title?: string; resourceIds: string[]; defaultResourceId?: string }[] })?.panels ?? []
  const panelLayout = Array.isArray(panels) && panels.length > 0
    ? {
        panels: panels.map((p: { id: string; name?: string; title?: string; resourceKeys?: string[]; resourceIds?: string[]; activeIndex?: number; defaultResourceId?: string }) => ({
          id: p.id,
          title: p.name ?? p.title,
          resourceIds: p.resourceKeys ?? p.resourceIds ?? [],
          defaultResourceId: p.resourceKeys?.[p.activeIndex ?? 0] ?? p.defaultResourceId,
        })),
        orientation: 'horizontal' as const,
      }
    : undefined
  return {
    id: (base.id as string) || `collection_${Date.now()}`,
    name: name.trim(),
    description: description?.trim() || undefined,
    version: (base.version as string) || '1.0.0',
    createdAt: (base.createdAt as string) || now,
    updatedAt: now,
    resources: packageResources,
    panelLayout,
  }
}

export function ManageCollectionDialog({
  collection,
  isOpen,
  onClose,
  onOpenWizard,
}: ManageCollectionDialogProps) {
  const savePackage = usePackageStore(state => state.savePackage)
  const [resources, setResources] = useState<ResourceInfo[] | PackageResource[]>(() => getResourcesArray(collection) as ResourceInfo[] | PackageResource[])
  const [name, setName] = useState(collection.name || (collection as { title?: string }).title || '')
  const [description, setDescription] = useState(collection.description || '')

  // Reset state when dialog opens or collection changes
  useEffect(() => {
    if (isOpen) {
      setResources(getResourcesArray(collection) as ResourceInfo[] | PackageResource[])
      setName(collection.name || (collection as { title?: string }).title || '')
      setDescription(collection.description || '')
    }
  }, [isOpen, collection])

  if (!isOpen) return null

  const handleRemoveResource = (index: number) => {
    const updatedResources = resources.filter((_, i: number) => i !== index)
    setResources(updatedResources)
  }

  const handleSave = async () => {
    const toSave = toStoragePackage(collection, name, description, resources)
    await savePackage(toSave)
    onClose()
  }

  const handleAddResources = () => {
    onClose()
    onOpenWizard?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-4 border-b border-gray-100">
          <div className="flex-1 space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              className="w-full px-3 py-2 text-lg font-semibold text-gray-900 border-2 border-transparent hover:border-gray-200 focus:border-blue-500 rounded-lg transition-colors outline-none"
              aria-label="Collection name"
              title="Edit collection name"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 text-sm text-gray-600 border-2 border-transparent hover:border-gray-200 focus:border-blue-500 rounded-lg resize-none transition-colors outline-none"
              aria-label="Collection description"
              title="Edit collection description"
            />
            <p className="text-sm text-gray-500 px-3">
              {resources.length} resource{resources.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            title="Close"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Resource List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {resources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-gray-50 rounded-full mb-4">
                <BookOpen className="w-8 h-8 text-gray-400" />
              </div>
              <button
                onClick={handleAddResources}
                className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Add resources"
                aria-label="Add resources to collection"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {resources.map((resource: any, index: number) => {
                const fullResId = resource.resourceId || 'UNKNOWN'
                const resId = fullResId.split('/').pop()?.toUpperCase() || fullResId.toUpperCase()
                const langCode = resource.language?.toUpperCase() || 'EN'
                
                return (
                  <div
                    key={index}
                    className="group flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg">
                        <BookOpen className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{resId}</span>
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                            {langCode}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{resource.displayName}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveResource(index)}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove resource"
                      aria-label="Remove resource"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleAddResources}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Add resources"
            aria-label="Add resources to collection"
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Cancel"
              aria-label="Cancel without saving changes"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={handleSave}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              title="Save changes"
              aria-label="Save changes to collection"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
