/**
 * ScriptureHeader - Header section showing resource key and reference
 */

import type { ScriptureViewerProps } from '../types'
import { useCurrentReference } from '../../../../contexts'

export function ScriptureHeader({
  resourceKey,
  isAnchor,
}: Pick<ScriptureViewerProps, 'resourceKey' | 'isAnchor'>) {
  const currentRef = useCurrentReference()

  // Format reference
  const refString = `${currentRef.book.toUpperCase()} ${currentRef.chapter}:${currentRef.verse}${
    currentRef.endVerse ? `-${currentRef.endVerse}` : ''
  }`

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-scripture-fg">{resourceKey}</h3>
      <p className="text-sm text-scripture-muted">{refString}</p>
      {isAnchor && (
        <span className="inline-block mt-1 px-2 py-0.5 bg-accent-soft text-accent-fg text-xs rounded">
          Anchor
        </span>
      )}
    </div>
  )
}


