/**
 * Icon-only affordance when the settled chapter cannot obtain full tokens
 * (stale/missing scripture-usj: after a USJ version bump).
 */

import { RefreshCw } from 'lucide-react'

interface TokenSourceHealButtonProps {
  onRetry: () => void
  className?: string
}

export function TokenSourceHealButton({
  onRetry,
  className = '',
}: TokenSourceHealButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onRetry()
      }}
      className={`p-2 rounded-md hover:bg-muted text-fg-muted hover:text-accent transition-colors ${className}`}
      title="Reload scripture tokens"
      aria-label="Reload scripture tokens"
    >
      <RefreshCw className="w-4 h-4" />
    </button>
  )
}
