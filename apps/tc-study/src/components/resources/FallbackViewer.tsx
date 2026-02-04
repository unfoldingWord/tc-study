/**
 * FallbackViewer - Default viewer for unsupported resource types
 */

import { BookOpen } from 'lucide-react'

interface FallbackViewerProps {
  resourceId: string
  resourceKey: string
  resourceType?: string
}

export function FallbackViewer({ resourceId, resourceKey, resourceType }: FallbackViewerProps) {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
      <BookOpen className="w-16 h-16 text-gray-300 mb-4" />
      <h3 className="text-xl font-semibold text-gray-700 mb-2">{resourceKey}</h3>
      <p className="text-gray-500 mb-4">Titus 1:1</p>
      
      <div className="max-w-md text-center">
        <p className="text-gray-600 mb-4">
          This resource type <span className="font-mono bg-gray-100 px-2 py-1 rounded">{resourceType || 'unknown'}</span> doesn't have a specialized viewer yet.
        </p>
        <p className="text-sm text-gray-500">
          A viewer component will be created for this resource type in a future update.
        </p>
      </div>
      
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-w-md">
        <p className="text-sm text-yellow-900">
          <strong>Resource ID:</strong> {resourceId}
          <br />
          <strong>Resource Key:</strong> {resourceKey}
          <br />
          <strong>Type:</strong> {resourceType || 'not specified'}
        </p>
      </div>
    </div>
  )
}
