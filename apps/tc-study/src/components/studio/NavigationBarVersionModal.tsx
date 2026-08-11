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
        className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Version</h3>
        <p className="font-mono text-sm text-gray-800" data-app-version={APP_VERSION}>
          {APP_VERSION}
        </p>
        <p className="font-mono text-xs text-gray-600 mt-2 break-all" data-deploy-version={DEPLOY_VERSION}>
          Build: {DEPLOY_VERSION}
        </p>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Close
        </button>
      </div>
    </div>
  )
}
