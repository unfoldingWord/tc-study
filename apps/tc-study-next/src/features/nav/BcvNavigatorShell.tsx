import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ModalPortal } from '../../components/shared/ModalPortal'

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
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-overlay backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          className={`relative flex flex-col bg-surface border border-border rounded-xl shadow-2xl w-full ${maxWidthClass} max-h-[85vh] overflow-hidden m-4`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted flex-shrink-0">
            <div className="flex items-center gap-2">{headerIcon}</div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-surface rounded transition-colors text-fg-secondary"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  )
}
