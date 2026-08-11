/**
 * Collection Import Dialog — UI for importing a shared collection package
 */

import type { ResourcePackage } from '@bt-synergy/package-storage'
import { Check, Database, FileArchive, Package, Upload, X } from 'lucide-react'
import { useCollectionImport, type LoadMode } from '../../features/collections/useCollectionImport'

interface CollectionImportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function CollectionImportDialog({ isOpen, onClose }: CollectionImportDialogProps) {
  const {
    packages,
    mode,
    setMode,
    selectedPackage,
    setSelectedPackage,
    file,
    importing,
    success,
    error,
    downloadProgress,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleImport,
    canImport,
  } = useCollectionImport(isOpen, onClose)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span title="Load collection">
              <Upload className="w-6 h-6 text-blue-600" aria-label="Load collection" />
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close dialog"
            title="Close dialog"
          >
            <span title="Close">
              <X className="w-4 h-4" />
            </span>
          </button>
        </div>

        <ModeTabs mode={mode} onChange={setMode} />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mode === 'from-db' ? (
            <PackageList
              packages={packages}
              selectedPackage={selectedPackage}
              onSelect={setSelectedPackage}
            />
          ) : (
            <FileDropZone
              file={file}
              fileInputRef={fileInputRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onFileSelect={handleFileSelect}
            />
          )}

          {downloadProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-blue-800">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="font-medium">
                    Downloading resource {downloadProgress.current} of {downloadProgress.total}
                  </span>
                </div>
              </div>
              <div className="text-xs text-blue-700 truncate font-mono bg-blue-100 px-2 py-1 rounded">
                {downloadProgress.name}
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-center gap-2 text-green-800">
              <span title="Success">
                <Check className="w-5 h-5" />
              </span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm text-center">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 border-t">
          <button
            onClick={onClose}
            disabled={importing}
            className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Cancel"
            title="Cancel"
          >
            <span title="Cancel">
              <X className="w-4 h-4 mx-auto" />
            </span>
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport || importing || success}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={importing ? 'Loading...' : success ? 'Loaded' : 'Load collection'}
            title={importing ? 'Loading...' : success ? 'Loaded!' : 'Load collection'}
          >
            {importing ? (
              <div
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                title="Loading..."
              />
            ) : success ? (
              <span title="Success">
                <Check className="w-5 h-5" />
              </span>
            ) : (
              <span title="Load">
                <Upload className="w-5 h-5" />
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeTabs({ mode, onChange }: { mode: LoadMode; onChange: (m: LoadMode) => void }) {
  return (
    <div className="flex border-b">
      <button
        onClick={() => onChange('from-db')}
        className={`flex-1 flex items-center justify-center gap-2 p-3 transition-colors ${
          mode === 'from-db'
            ? 'border-b-2 border-blue-500 bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-50'
        }`}
        title="Load from saved collections"
        aria-label="Load from saved collections"
      >
        <Database className="w-4 h-4" />
      </button>
      <button
        onClick={() => onChange('from-file')}
        className={`flex-1 flex items-center justify-center gap-2 p-3 transition-colors ${
          mode === 'from-file'
            ? 'border-b-2 border-blue-500 bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-50'
        }`}
        title="Import from .btc.zip file"
        aria-label="Import from file"
      >
        <FileArchive className="w-4 h-4" />
      </button>
    </div>
  )
}

function PackageList({
  packages,
  selectedPackage,
  onSelect,
}: {
  packages: ResourcePackage[]
  selectedPackage: ResourcePackage | null
  onSelect: (pkg: ResourcePackage) => void
}) {
  if (packages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="text-sm">No saved collections</p>
      </div>
    )
  }
  return (
    <>
      {packages.map((pkg) => (
        <button
          key={pkg.id}
          onClick={() => onSelect(pkg)}
          className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
            selectedPackage?.id === pkg.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
          }`}
          title={`Select ${pkg.name}`}
          aria-label={`Select collection ${pkg.name}`}
        >
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-gray-400" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{pkg.name}</div>
              <div className="text-xs text-gray-500">v{pkg.version}</div>
            </div>
            {selectedPackage?.id === pkg.id && <Check className="w-5 h-5 text-blue-600" />}
          </div>
        </button>
      ))}
    </>
  )
}

function FileDropZone({
  file,
  fileInputRef,
  onDrop,
  onDragOver,
  onFileSelect,
}: {
  file: File | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
      onClick={() => fileInputRef.current?.click()}
      title="Drop .btc.zip file here or click to browse"
      aria-label="Drop collection file here or click to select file"
    >
      <span title="Collection file">
        <FileArchive
          className={`w-16 h-16 mx-auto mb-3 ${file ? 'text-blue-600' : 'text-gray-400'}`}
        />
      </span>
      {file ? (
        <>
          <p className="text-sm font-medium text-gray-700 mb-1 truncate px-2">{file.name}</p>
          <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <span title="Upload">
              <Upload className="w-5 h-5 text-gray-400" />
            </span>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.btc.zip"
        onChange={onFileSelect}
        className="hidden"
        aria-label="Select collection file"
      />
    </div>
  )
}
