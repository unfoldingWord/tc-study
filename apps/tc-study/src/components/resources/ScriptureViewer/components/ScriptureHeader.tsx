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
      <h3 className="text-lg font-semibold text-gray-900">{resourceKey}</h3>
      <p className="text-sm text-gray-500">{refString}</p>
      {isAnchor && (
        <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
          ⚓ Anchor Resource
        </span>
      )}
    </div>
  )
}


