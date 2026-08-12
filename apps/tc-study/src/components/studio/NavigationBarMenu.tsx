import { Download, FolderOpen, History, Info } from 'lucide-react'
import type { BCVReference } from '../../contexts/types'

interface NavigationBarMenuProps {
  history: BCVReference[]
  showLanguagePicker?: boolean
  onOpenHistory: () => void
  onOpenVersion: () => void
  onDownloadCollection?: () => void
  onLoadCollection?: () => void
  onClose: () => void
}

export function NavigationBarMenu({
  history,
  showLanguagePicker = false,
  onOpenHistory,
  onOpenVersion,
  onDownloadCollection,
  onLoadCollection,
  onClose,
}: NavigationBarMenuProps) {
  return (
    <div className="absolute bottom-full right-0 mb-1 md:bottom-auto md:mb-0 md:top-full md:mt-1 w-auto bg-elevated rounded-lg shadow-xl border border-border py-1 z-50">
      <button
        onClick={() => {
          onOpenHistory()
          onClose()
        }}
        disabled={history.length === 0}
        className="flex items-center justify-center p-2 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed relative"
        title={`Navigation history${history.length > 0 ? ` (${history.length})` : ''}`}
        aria-label={`Navigation history${history.length > 0 ? ` (${history.length} locations)` : ''}`}
      >
        <History className="w-4 h-4 text-fg-secondary" />
        {history.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-[9px] font-semibold rounded-full w-3.5 h-3.5 flex items-center justify-center">
            {history.length > 9 ? '9+' : history.length}
          </span>
        )}
      </button>

      {(onDownloadCollection || onLoadCollection) && (
        <>
          {onDownloadCollection && (
            <button
              onClick={() => {
                onDownloadCollection()
                onClose()
              }}
              className="flex items-center justify-center p-2 hover:bg-muted"
              title="Download current collection"
              aria-label="Download current collection"
            >
              <Download className="w-4 h-4 text-fg-secondary" />
            </button>
          )}
          {onLoadCollection && (
            <button
              onClick={() => {
                onLoadCollection()
                onClose()
              }}
              className="flex items-center justify-center p-2 hover:bg-muted"
              title="Load a collection (from database or file)"
              aria-label="Load a collection (from database or file)"
            >
              <FolderOpen className="w-4 h-4 text-fg-secondary" />
            </button>
          )}
        </>
      )}

      {showLanguagePicker && (
        <div className="border-t border-border-subtle px-2 py-1.5 flex justify-center">
          <button
            onClick={() => {
              onOpenVersion()
              onClose()
            }}
            className="p-1 rounded hover:bg-muted text-fg-muted hover:text-fg-secondary"
            title="Version"
            aria-label="Version"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
