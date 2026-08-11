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
    <div className="absolute bottom-full right-0 mb-1 md:bottom-auto md:mb-0 md:top-full md:mt-1 w-auto bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
      <button
        onClick={() => {
          onOpenHistory()
          onClose()
        }}
        disabled={history.length === 0}
        className="flex items-center justify-center p-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed relative"
        title={`Navigation history${history.length > 0 ? ` (${history.length})` : ''}`}
        aria-label={`Navigation history${history.length > 0 ? ` (${history.length} locations)` : ''}`}
      >
        <History className="w-4 h-4 text-gray-500" />
        {history.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-semibold rounded-full w-3.5 h-3.5 flex items-center justify-center">
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
              className="flex items-center justify-center p-2 hover:bg-gray-50"
              title="Download current collection"
              aria-label="Download current collection"
            >
              <Download className="w-4 h-4 text-gray-500" />
            </button>
          )}
          {onLoadCollection && (
            <button
              onClick={() => {
                onLoadCollection()
                onClose()
              }}
              className="flex items-center justify-center p-2 hover:bg-gray-50"
              title="Load a collection (from database or file)"
              aria-label="Load a collection (from database or file)"
            >
              <FolderOpen className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </>
      )}

      {showLanguagePicker && (
        <div className="border-t border-gray-100 px-2 py-1.5 flex justify-center">
          <button
            onClick={() => {
              onOpenVersion()
              onClose()
            }}
            className="p-1 rounded hover:bg-gray-50 text-gray-400 hover:text-gray-600"
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
