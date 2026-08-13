import { Check } from 'lucide-react'

interface ApplyFooterProps {
  onApply: () => void
  disabled: boolean
}

export function ApplyFooter({ onApply, disabled }: ApplyFooterProps) {
  return (
    <div className="px-6 py-4 border-t border-border bg-muted flex items-center justify-end flex-shrink-0">
      <button
        type="button"
        onClick={onApply}
        disabled={disabled}
        className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Apply selection"
        aria-label="Apply selection"
      >
        <Check className="w-5 h-5" />
      </button>
    </div>
  )
}
