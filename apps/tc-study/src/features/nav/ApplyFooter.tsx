import { Check } from 'lucide-react'

interface ApplyFooterProps {
  onApply: () => void
  disabled: boolean
}

export function ApplyFooter({ onApply, disabled }: ApplyFooterProps) {
  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end flex-shrink-0">
      <button
        type="button"
        onClick={onApply}
        disabled={disabled}
        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Apply selection"
        aria-label="Apply selection"
      >
        <Check className="w-5 h-5" />
      </button>
    </div>
  )
}
