/**
 * Edge chevron + travel pad. Shown only after the reader reaches that scroll edge.
 * The pad extends scrollHeight so the scrollbar can travel into next/prev.
 */

import { ChevronDown, ChevronUp } from 'lucide-react'
import { EDGE_TRAVEL_PAD_PX } from '../../../../features/nav/scriptureEdgeNavigate'
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
    <div
      className={`flex justify-center ${edge === 'top' ? 'items-end pb-1' : 'items-start pt-1'}`}
      style={{ height: EDGE_TRAVEL_PAD_PX, overflowAnchor: 'none' }}
      data-scripture-edge-pad={edge}
    >
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
