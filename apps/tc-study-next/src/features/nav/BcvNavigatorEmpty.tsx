import { AlertCircle } from 'lucide-react'
import { BcvNavigatorShell } from './BcvNavigatorShell'

interface BcvNavigatorEmptyProps {
  onClose: () => void
}

export function BcvNavigatorEmpty({ onClose }: BcvNavigatorEmptyProps) {
  return (
    <BcvNavigatorShell
      onClose={onClose}
      headerIcon={<AlertCircle className="w-5 h-5 text-amber-500" />}
      maxWidthClass="max-w-2xl"
    >
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-3 p-6 text-center text-fg-secondary text-sm">
        <AlertCircle className="w-16 h-16 text-fg-muted" />
        <p>Add a Bible translation (for book navigation) or load Open Bible Stories to use story navigation.</p>
      </div>
    </BcvNavigatorShell>
  )
}
