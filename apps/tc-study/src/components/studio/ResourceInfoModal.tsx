import React from 'react'
import { X, FileText, Scale } from 'lucide-react'

interface ResourceInfoModalProps {
  isOpen: boolean
  onClose: () => void
  resource: {
    title: string
    key: string
    owner?: string
    languageCode?: string
    subject?: string
    description?: string
    readme?: string
    license?: string
  }
}

export function ResourceInfoModal({ isOpen, onClose, resource }: ResourceInfoModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-gray-50">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {resource.title}
              </h2>
              {resource.owner && (
                <p className="text-xs text-gray-500 truncate">
                  {typeof resource.owner === 'string' ? resource.owner : JSON.stringify(resource.owner)} · {typeof resource.languageCode === 'string' ? resource.languageCode.toUpperCase() : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Resource Key */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Resource ID</h3>
            <p className="text-sm text-gray-600 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
              {typeof resource.key === 'string' ? resource.key : JSON.stringify(resource.key)}
            </p>
          </div>

          {/* Subject */}
          {resource.subject && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Subject</h3>
              <p className="text-sm text-gray-600">{typeof resource.subject === 'string' ? resource.subject : JSON.stringify(resource.subject)}</p>
            </div>
          )}

          {/* Description */}
          {resource.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{typeof resource.description === 'string' ? resource.description : JSON.stringify(resource.description)}</p>
            </div>
          )}

          {/* README */}
          {resource.readme && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                README
              </h3>
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 px-4 py-3 rounded border border-gray-200 max-h-64 overflow-y-auto">
                {typeof resource.readme === 'string' ? resource.readme : JSON.stringify(resource.readme)}
              </div>
            </div>
          )}

          {/* License */}
          {resource.license && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Scale className="w-4 h-4" />
                License
              </h3>
              <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 px-4 py-3 rounded border border-gray-200">
                {typeof resource.license === 'string' ? resource.license : JSON.stringify(resource.license)}
              </div>
            </div>
          )}

          {/* Fallback if no details available */}
          {!resource.description && !resource.readme && !resource.license && (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium mb-1">No extended information available</p>
              <p className="text-xs text-gray-500">This resource doesn't include README or LICENSE documentation</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
