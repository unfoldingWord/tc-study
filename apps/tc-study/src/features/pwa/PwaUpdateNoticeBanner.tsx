import { RefreshCw } from 'lucide-react'

export const PWA_UPDATE_NOTICE_TEXT = 'A new version is ready - Reload'

export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void> | void

export function createPwaReloadHandler(updateServiceWorker: UpdateServiceWorker | null) {
  return async () => {
    if (!updateServiceWorker) return
    await updateServiceWorker(true)
  }
}

interface PwaUpdateNoticeBannerProps {
  needRefresh: boolean
  onReload: () => void | Promise<void>
}

export function PwaUpdateNoticeBanner({
  needRefresh,
  onReload,
}: PwaUpdateNoticeBannerProps) {
  if (!needRefresh) return null

  return (
    <div className="fixed bottom-3 left-1/2 z-[120] -translate-x-1/2">
      <button
        type="button"
        onClick={onReload}
        className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-surface/95 px-3 py-1.5 text-xs font-medium text-fg shadow-lg backdrop-blur-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        title="Reload with new version"
        aria-label="Reload with new version"
      >
        <RefreshCw className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span>{PWA_UPDATE_NOTICE_TEXT}</span>
      </button>
    </div>
  )
}
