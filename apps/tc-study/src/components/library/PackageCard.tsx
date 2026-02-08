/**
 * Package card for library view
 */

import { BookOpen, Trash2, Download, Calendar, Settings, FolderOpen, Loader, AlertCircle, CheckCircle } from 'lucide-react'
import type { ResourcePackage } from '../../lib/storage/types'

interface PackageCardProps {
  package: ResourcePackage
  onOpen: (pkg: ResourcePackage) => void
  onDelete: (pkg: ResourcePackage) => void
  onManage?: (pkg: ResourcePackage) => void
  isActive?: boolean
}

export function PackageCard({ package: pkg, onOpen, onDelete, onManage, isActive }: PackageCardProps) {
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString()
    } catch {
      return 'Unknown'
    }
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'installed': return 'bg-green-100 text-green-800'
      case 'installing': return 'bg-blue-100 text-blue-800'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className={`group relative rounded-2xl border bg-white p-5 transition-all hover:shadow-md ${
      isActive 
        ? 'border-blue-200 ring-2 ring-blue-100' 
        : 'border-gray-100'
    }`}>
      {/* Active Badge */}
      {isActive && (
        <div className="absolute -right-2 -top-2 rounded-full bg-blue-600 p-1.5 shadow-sm" title="Active collection" aria-label="Active collection">
          <CheckCircle className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {pkg.name || pkg.id}
        </h3>
        {pkg.description && (
          <p className="text-xs text-gray-500 line-clamp-2">
            {pkg.description}
          </p>
        )}
      </div>

      {/* Metadata */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-lg" title={`${Array.isArray(pkg.resources) ? pkg.resources.length : (pkg.resources as Map<string, unknown>)?.size ?? 0} resources`}>
          <BookOpen className="w-3 h-3 text-blue-600" />
          <span className="text-blue-600 font-semibold">
            {Array.isArray(pkg.resources) ? pkg.resources.length : (pkg.resources as Map<string, unknown>)?.size ?? 0}
          </span>
        </div>
        {(pkg as { stats?: { estimatedSize?: number } }).stats?.estimatedSize != null && (
          <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded-lg" title={formatSize((pkg as { stats?: { estimatedSize?: number } }).stats!.estimatedSize)}>
            {formatSize((pkg as { stats?: { estimatedSize?: number } }).stats!.estimatedSize)}
          </span>
        )}
      </div>

      {/* Status & Progress - optional fields for package store compatibility */}
      {(pkg as { status?: string }).status === 'installing' && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div 
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${(pkg as { downloadProgress?: number }).downloadProgress ?? 0}%` }}
              />
            </div>
            <span className="text-xs font-medium text-blue-600">{(pkg as { downloadProgress?: number }).downloadProgress ?? 0}%</span>
          </div>
        </div>
      )}

      {(pkg as { status?: string }).status === 'error' && (
        <div className="mb-4 flex items-center gap-2 p-2 bg-red-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-xs text-red-600 font-medium">Error</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpen(pkg)}
          disabled={(pkg as { status?: string }).status !== 'installed'}
          className={`flex-1 rounded-lg p-2.5 transition-colors flex items-center justify-center ${
            (pkg as { status?: string }).status === 'installed'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'cursor-not-allowed bg-gray-100 text-gray-400'
          }`}
          title="Open in Studio"
          aria-label="Open collection in Studio"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        {onManage && (
          <button
            onClick={() => onManage(pkg)}
            className="rounded-lg p-2 hover:bg-gray-100 transition-colors group/btn"
            title="Manage resources"
            aria-label="Manage collection resources"
          >
            <Settings className="h-4 w-4 text-gray-600 group-hover/btn:text-gray-900" />
          </button>
        )}
        <button
          onClick={() => onDelete(pkg)}
          className="rounded-lg p-2 hover:bg-red-50 transition-colors group/btn"
          title="Delete"
          aria-label="Delete collection"
        >
          <Trash2 className="h-4 w-4 text-gray-400 group-hover/btn:text-red-600" />
        </button>
      </div>
    </div>
  )
}

