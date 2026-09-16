/**
 * In-flow chevron at the scripture content start/end. Shown when an adjacent
 * unit exists; click commits prev/next. Scrolls with content (not viewport-
 * sticky). No travel pad — further pull uses elastic overscroll.
 */

import { ChevronDown, ChevronUp } from 'lucide-react'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'

interface ScriptureEdgeCueProps {
  edge: 'top' | 'bottom'
  visible: boolean
  pulling: boolean
  armedToCommit: boolean
  onClick: () => void
}

export function ScriptureEdgeCue({
  edge,
  visible,
  pulling,
  armedToCommit,
  onClick,
}: ScriptureEdgeCueProps) {
  if (!visible) return null

  const Icon = edge === 'top' ? ChevronUp : ChevronDown
  const loading = pulling && armedToCommit
  const label = edge === 'top' ? 'Previous' : 'Next'
  const loadingLabel = edge === 'top' ? 'Loading previous' : 'Loading next'

  return (
    <div className="flex justify-center py-1" data-scripture-edge-cue={edge}>
      <button
        type="button"
        className="p-1 text-fg-muted"
        title={loading ? loadingLabel : label}
        aria-label={loading ? loadingLabel : label}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        {loading ? (
          <LoadingSpinner size="sm" label={loadingLabel} className="text-accent opacity-90" />
        ) : (
          <Icon className={`w-5 h-5 ${pulling ? 'opacity-70' : 'opacity-50 hover:opacity-90'}`} />
        )}
      </button>
    </div>
  )
}
