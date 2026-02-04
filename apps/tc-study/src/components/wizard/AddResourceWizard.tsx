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

export function AddResourceWizard({ onClose, onComplete }: AddResourceWizardProps) {
  console.log('🧙 AddResourceWizard rendering!')
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Add Resources to Workspace
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select resources from your library or collections
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🚀</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Resource Wizard Coming Soon!
            </h3>
            <p className="text-gray-600 mb-6">
              We're working on the full resource selection wizard.
              <br />
              For now, please use the Library page to browse and add resources.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose()
                  // Navigate to library
                  window.location.hash = '#/library'
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
