/**
 * Collection Modal - Single modal container that switches between views
 */

import { useState } from 'react'
import { SimpleCollectionCreator } from './SimpleCollectionCreator'
import { AddToCatalogWizard } from '../catalog/AddToCatalogWizard'

type ModalView = 'creator' | 'add-resources'

interface CollectionModalProps {
  onClose: () => void
  onComplete?: (collectionId: string) => void
  onResourcesAdded?: () => void
}

export function CollectionModal({ onClose, onComplete, onResourcesAdded }: CollectionModalProps) {
  const [view, setView] = useState<ModalView>('creator')

  const handleSwitchToAddResources = () => {
    setView('add-resources')
  }

  const handleResourcesAdded = async () => {
    if (onResourcesAdded) {
      await onResourcesAdded()
    }
    // Switch back to creator
    setView('creator')
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {view === 'creator' ? (
          <SimpleCollectionCreator
            onClose={onClose}
            onComplete={onComplete}
            onAddResources={handleSwitchToAddResources}
            isEmbedded
          />
        ) : (
          <AddToCatalogWizard
            onClose={() => setView('creator')}
            onComplete={handleResourcesAdded}
            isEmbedded
          />
        )}
      </div>
    </div>
  )
}
