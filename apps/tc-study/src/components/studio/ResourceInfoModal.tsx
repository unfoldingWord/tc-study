import React from 'react'
import { X, FileText, Scale } from 'lucide-react'
import { ModalPortal } from '../shared/ModalPortal'

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
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-surface border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <FileText className="w-5 h-5 text-accent flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="resource-info-title" className="text-lg font-semibold text-fg truncate">
                {resource.title}
              </h2>
              {resource.owner && (
                <p className="text-xs text-fg-secondary truncate">
                  {typeof resource.owner === 'string' ? resource.owner : JSON.stringify(resource.owner)} · {typeof resource.languageCode === 'string' ? resource.languageCode.toUpperCase() : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface rounded-md transition-colors flex-shrink-0 text-fg-secondary"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-canvas">
          {/* Resource Key */}
          <div>
            <h3 className="text-sm font-semibold text-fg-secondary mb-1">Resource ID</h3>
            <p className="text-sm text-fg font-mono bg-muted px-3 py-2 rounded border border-border">
              {typeof resource.key === 'string' ? resource.key : JSON.stringify(resource.key)}
            </p>
          </div>

          {/* Subject */}
          {resource.subject && (
            <div>
              <h3 className="text-sm font-semibold text-fg-secondary mb-1">Subject</h3>
              <p className="text-sm text-fg">{typeof resource.subject === 'string' ? resource.subject : JSON.stringify(resource.subject)}</p>
            </div>
          )}

          {/* Description */}
          {resource.description && (
            <div>
              <h3 className="text-sm font-semibold text-fg-secondary mb-1">Description</h3>
              <p className="text-sm text-fg whitespace-pre-wrap">{typeof resource.description === 'string' ? resource.description : JSON.stringify(resource.description)}</p>
            </div>
          )}

          {/* README */}
          {resource.readme && (
            <div>
              <h3 className="text-sm font-semibold text-fg-secondary mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                README
              </h3>
              <div className="text-sm text-fg whitespace-pre-wrap bg-muted px-4 py-3 rounded border border-border max-h-64 overflow-y-auto">
                {typeof resource.readme === 'string' ? resource.readme : JSON.stringify(resource.readme)}
              </div>
            </div>
          )}

          {/* License */}
          {resource.license && (
            <div>
              <h3 className="text-sm font-semibold text-fg-secondary mb-2 flex items-center gap-2">
                <Scale className="w-4 h-4" />
                License
              </h3>
              <div className="text-sm text-fg whitespace-pre-wrap bg-muted px-4 py-3 rounded border border-border">
                {typeof resource.license === 'string' ? resource.license : JSON.stringify(resource.license)}
              </div>
            </div>
          )}

          {/* Fallback if no details available */}
          {!resource.description && !resource.readme && !resource.license && (
            <div className="text-center py-8 text-fg-muted">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium mb-1 text-fg-secondary">No extended information available</p>
              <p className="text-xs">This resource doesn't include README or LICENSE documentation</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-border bg-muted">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface hover:text-fg rounded-md transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
