/**
 * TokenFilterBanner Component
 * 
 * Shows active token filter with clear button
 */

import { Hash } from 'lucide-react'
import type { TokenFilter } from '../types'

interface TokenFilterBannerProps {
  tokenFilter: TokenFilter
  displayLinksCount: number
  hasMatches: boolean
  onClearFilter: () => void
}

export function TokenFilterBanner({ 
  tokenFilter, 
  displayLinksCount, 
  hasMatches,
  onClearFilter 
}: TokenFilterBannerProps) {
  // Don't show banner if there are no matches
  if (!hasMatches) {
    return null
  }
  
  return (
    <div className="px-4 py-1.5 border-b bg-blue-50 border-blue-200 flex items-center justify-center gap-2">
      <div className="inline-flex items-center gap-1.5 bg-white border border-blue-200 rounded-md px-2 py-0.5">
        <Hash className="w-3 h-3 text-blue-500" />
        <span className="text-xs text-gray-700">
          {tokenFilter.content}
        </span>
        <button
          onClick={onClearFilter}
          className="ml-0.5 rounded hover:bg-gray-100 p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
          title="Clear filter"
          aria-label="Clear token filter"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
