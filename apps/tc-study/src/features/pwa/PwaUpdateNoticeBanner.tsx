import { RefreshCw } from 'lucide-react'

/** Accessible label for the update prompt (icon-only UI). */
export const PWA_UPDATE_NOTICE_LABEL = 'A new version is ready — Reload'

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

interface PwaUpdateReloadButtonProps {
  onReload: () => void | Promise<void>
}

/** Exposed for unit tests (bun test has no DOM). */
export function getPwaUpdateReloadButtonProps(onReload: PwaUpdateReloadButtonProps['onReload']) {
  return {
    type: 'button' as const,
    onClick: onReload,
    title: PWA_UPDATE_NOTICE_LABEL,
    'aria-label': PWA_UPDATE_NOTICE_LABEL,
  }
}

export function PwaUpdateNoticeBanner({
  needRefresh,
  onReload,
}: PwaUpdateNoticeBannerProps) {
  if (!needRefresh) return null

  return (
    <div
      className="fixed bottom-3 left-1/2 z-[80] -translate-x-1/2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        {...getPwaUpdateReloadButtonProps(onReload)}
        className="inline-flex items-center justify-center rounded-full border border-accent/30 bg-surface/95 p-2 shadow-lg backdrop-blur-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <RefreshCw className="h-4 w-4 animate-pulse text-accent" aria-hidden />
      </button>
    </div>
  )
}
