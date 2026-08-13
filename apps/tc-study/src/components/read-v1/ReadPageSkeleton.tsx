/**
 * ReadPageSkeleton - Layout skeleton shown while the Read page chunk loads
 *
 * Matches the Read page layout (two panels, divider, bottom nav) so users see
 * the structure immediately instead of a floating spinner.
 */

import { LoadingSpinner } from '../../shared/LoadingSpinner'

export function ReadPageSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas">
      {/* Main Content Area - Two Panels */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Panel 1 */}
        <div
          className="flex-1 flex flex-col min-h-0 border-r border-border"
          style={{ flexBasis: '50%' }}
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 bg-panel-1-soft/50 border-b border-border-subtle">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-1-soft text-xs font-medium text-panel-1-fg">
              1
            </span>
          </div>
          <LoadingSpinner
            centered
            label="Loading"
            className="text-panel-1"
            containerClassName="flex-1 min-h-0"
          />
        </div>

        {/* Resize Divider */}
        <div className="flex-shrink-0 w-full md:w-1.5 h-1.5 md:h-full bg-border flex items-center justify-center" />

        {/* Panel 2 */}
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ flexBasis: '50%' }}
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 bg-panel-2-soft/50 border-b border-border-subtle">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-2-soft text-xs font-medium text-panel-2-fg">
              2
            </span>
          </div>
          <LoadingSpinner
            centered
            label="Loading"
            className="text-panel-2"
            containerClassName="flex-1 min-h-0"
          />
        </div>
      </div>

      {/* Bottom Navigation Bar Placeholder */}
      <div className="flex-shrink-0 flex items-center bg-surface border-t border-border-subtle px-2 py-1.5 gap-2">
        <div className="h-8 w-8 rounded-full bg-panel-2-soft animate-pulse" />
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="h-6 w-6 rounded bg-muted animate-pulse" />
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-6 w-6 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-8 w-8 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
