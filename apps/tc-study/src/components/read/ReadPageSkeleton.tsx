/**
 * ReadPageSkeleton - Layout skeleton shown while the Read page chunk loads
 *
 * Matches the Read page layout (two panels, divider, bottom nav) so users see
 * the structure immediately instead of a floating spinner.
 */

import { Loader2 } from 'lucide-react'

export function ReadPageSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Main Content Area - Two Panels */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Panel 1 */}
        <div
          className="flex-1 flex flex-col min-h-0 border-r border-gray-200"
          style={{ flexBasis: '50%' }}
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 bg-blue-50/50 border-b border-gray-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
              1
            </span>
          </div>
          <div
            className="flex-1 flex items-center justify-center min-h-0"
            role="status"
            aria-label="Loading"
          >
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        </div>

        {/* Resize Divider */}
        <div className="flex-shrink-0 w-full md:w-1.5 h-1.5 md:h-full bg-gray-300 flex items-center justify-center" />

        {/* Panel 2 */}
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ flexBasis: '50%' }}
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 bg-purple-50/50 border-b border-gray-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-medium text-purple-700">
              2
            </span>
          </div>
          <div
            className="flex-1 flex items-center justify-center min-h-0"
            role="status"
            aria-label="Loading"
          >
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar Placeholder */}
      <div className="flex-shrink-0 flex items-center bg-white border-t border-gray-100 px-2 py-1.5 gap-2">
        <div className="h-8 w-8 rounded-full bg-purple-100 animate-pulse" />
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
          <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="h-8 w-8 rounded bg-gray-100 animate-pulse" />
      </div>
    </div>
  )
}
