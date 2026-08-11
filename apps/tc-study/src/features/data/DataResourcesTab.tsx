import { Library, Upload } from 'lucide-react'
import type { RefObject } from 'react'

interface DataResourcesTabProps {
  inputRef: RefObject<HTMLInputElement | null>
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export function DataResourcesTab({ inputRef, onImport }: DataResourcesTabProps) {
  return (
    <div className="space-y-4">
      <div className="p-8 bg-gray-50 rounded-lg text-center">
        <Library className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">Resource Packages</p>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Import ZIP packages to share resources offline
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="Import resource package"
            aria-label="Import resource package"
            data-testid="import-resource-btn"
          >
            <Upload className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={onImport}
            className="hidden"
          />
          <p className="text-sm text-gray-600">
            Or use Library page to export individual resources
          </p>
        </div>
      </div>
    </div>
  )
}
