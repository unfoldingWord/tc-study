/**
 * Add Resource Wizard - Simplified Version
 *
 * Basic working modal for adding resources.
 */

import { X } from 'lucide-react'

interface AddResourceWizardProps {
  onClose: () => void
  onComplete?: () => void
}

export function AddResourceWizard({ onClose, onComplete: _onComplete }: AddResourceWizardProps) {


  return (
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-fg">
              Add Resources to Workspace
            </h2>
            <p className="text-sm text-fg-secondary mt-1">
              Select resources from your library or collections
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-fg-secondary"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🚀</div>
            <h3 className="text-lg font-medium text-fg mb-2">
              Resource Wizard Coming Soon!
            </h3>
            <p className="text-fg-secondary mb-6">
              We're working on the full resource selection wizard.
              <br />
              For now, please use the Library page to browse and add resources.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-muted text-fg-secondary rounded-lg hover:bg-muted transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose()
                  // Navigate to library
                  window.location.hash = '#/library'
                }}
                className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors font-medium"
              >
                Go to Library
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
