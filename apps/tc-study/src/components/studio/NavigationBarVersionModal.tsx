import { APP_VERSION, DEPLOY_VERSION } from '../../utils/deployVersion'

interface NavigationBarVersionModalProps {
  onClose: () => void
}

export function NavigationBarVersionModal({ onClose }: NavigationBarVersionModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Version and build"
    >
      <div
        className="bg-elevated rounded-lg shadow-xl p-6 max-w-sm mx-4 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-fg mb-3">Version</h3>
        <p className="font-mono text-sm text-fg" data-app-version={APP_VERSION}>
          {APP_VERSION}
        </p>
        <p className="font-mono text-xs text-fg-secondary mt-2 break-all" data-deploy-version={DEPLOY_VERSION}>
          Build: {DEPLOY_VERSION}
        </p>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 px-4 bg-accent text-white rounded-lg hover:bg-accent-hover font-medium"
        >
          Close
        </button>
      </div>
    </div>
  )
}
