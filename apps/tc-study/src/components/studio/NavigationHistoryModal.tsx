/**
 * NavigationHistoryModal - Displays navigation history
 */

import { MapPin, X } from 'lucide-react'
import { useNavigation, useNavigationHistory, useNavigationHistoryIndex } from '../../contexts'
import type { BCVReference } from '../../contexts/types'
import { ModalPortal } from '../shared/ModalPortal'

interface NavigationHistoryModalProps {
  onClose: () => void
}

export function NavigationHistoryModal({ onClose }: NavigationHistoryModalProps) {
  const navigation = useNavigation()
  const history = useNavigationHistory()
  const currentIndex = useNavigationHistoryIndex()

  const formatReference = (ref: BCVReference) => {
    let result = `${ref.book.toUpperCase()} ${ref.chapter}:${ref.verse}`
    if (ref.endChapter || ref.endVerse) {
      if (ref.endChapter && ref.endChapter !== ref.chapter) {
        result += `-${ref.endChapter}:${ref.endVerse || 1}`
      } else if (ref.endVerse && ref.endVerse !== ref.verse) {
        result += `-${ref.endVerse}`
      }
    }
    return result
  }

  const handleNavigateToHistoryItem = (index: number) => {
    // Jump directly to the history index
    navigation.goToHistoryIndex(index)
    onClose()
  }

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
        className="relative flex flex-col bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >
        {/* Header */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted flex-shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface rounded transition-colors text-fg-secondary"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-canvas">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-fg-muted">
              <MapPin className="w-16 h-16" />
            </div>
          ) : (
            <div className="py-2">
              {[...history].reverse().map((ref, reverseIndex) => {
                const index = history.length - 1 - reverseIndex
                const isCurrent = index === currentIndex
                const isAfterCurrent = index > currentIndex
                
                return (
                  <button
                    key={index}
                    onClick={() => handleNavigateToHistoryItem(index)}
                    className={`w-full px-4 py-2 flex items-center gap-3 hover:bg-muted transition-colors ${
                      isCurrent ? 'bg-accent-soft border-l-4 border-accent' : ''
                    } ${isAfterCurrent ? 'opacity-50' : ''}`}
                    title={isCurrent ? 'Current location' : 'Jump to this reference'}
                  >
                    {/* Current indicator or number */}
                    <div className={`
                      flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold
                      ${isCurrent ? 'bg-accent text-white' : 'bg-muted text-fg-secondary'}
                    `}>
                      {isCurrent ? (
                        <MapPin className="w-4 h-4" />
                      ) : (
                        index + 1
                      )}
                    </div>

                    {/* Reference */}
                    <div className="flex-1 text-left">
                      <div
                        className={`font-medium text-sm ${
                          isCurrent ? 'text-accent-fg' : 'text-fg'
                        }`}
                      >
                        {formatReference(ref)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted flex-shrink-0">
            <div className="flex items-center justify-center gap-1.5 text-sm text-fg-secondary font-medium">
              <MapPin className="w-4 h-4" />
              <span>{history.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}
