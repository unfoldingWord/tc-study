import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface BcvNavigatorShellProps {
  onClose: () => void
  headerIcon: ReactNode
  maxWidthClass?: string
  children: ReactNode
}

export function BcvNavigatorShell({
  onClose,
  headerIcon,
  maxWidthClass = 'max-w-3xl',
  children,
}: BcvNavigatorShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl w-full ${maxWidthClass} max-h-[85vh] overflow-hidden m-4`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">{headerIcon}</div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
