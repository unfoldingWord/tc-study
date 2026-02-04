/**
 * Package Preview Step
 * Show final manifest and allow download/creation
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePackageCreatorStore } from '../../../lib/stores'
import { Download, CheckCircle, Package } from 'lucide-react'
import { RESOURCE_TYPE_COLORS } from '../../../lib/config'
import { PackageBuilderService, type BuildProgress } from '../../../lib/services/PackageBuilderService'
import { BuildProgressModal } from '../BuildProgressModal'

export function PackagePreview() {
  const navigate = useNavigate()
  const selectedResources = usePackageCreatorStore((state) => state.selectedResources)
  const manifest = usePackageCreatorStore((state) => state.manifest)
  const generateManifest = usePackageCreatorStore((state) => state.generateManifest)

  const [isBuilding, setIsBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null)

  const resourcesList = Array.from(selectedResources.values())
  const builderService = PackageBuilderService.getInstance()
  
  const handleDownloadManifest = () => {
    try {
      console.log('🔽 Generating manifest...')
      const fullManifest = generateManifest()
      console.log('✅ Manifest generated:', fullManifest)
      
      console.log('📥 Downloading manifest JSON...')
      builderService.downloadManifestJson(fullManifest)
      console.log('✅ Download initiated')
    } catch (error) {
      console.error('❌ Failed to generate/download manifest:', error)
      alert(`Failed to download manifest: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleBuildPackage = async () => {
    console.log('🚀 Starting package build...')
    setIsBuilding(true)
    setBuildProgress({ stage: 'initializing', progress: 0, message: 'Starting build...' })

    try {
      console.log('📦 Generating manifest...')
      const fullManifest = generateManifest()
      console.log('✅ Manifest generated:', fullManifest)
      
      console.log('🔨 Building package with', resourcesList.length, 'resources')
      await builderService.buildPackage(
        resourcesList,
        fullManifest,
        (progress) => {
          console.log('📊 Build progress:', progress)
          setBuildProgress(progress)
        }
      )

      console.log('✅ Build completed successfully!')
      // Build completed successfully
      setTimeout(() => {
        setIsBuilding(false)
        navigate('/library')
      }, 2000)
    } catch (error) {
      console.error('❌ Failed to build package:', error)
      // Error state is handled by the progress callback
      setTimeout(() => {
        setIsBuilding(false)
      }, 3000)
    }
  }

  const handleCloseModal = () => {
    if (buildProgress?.stage === 'complete') {
      navigate('/library')
    } else {
      setIsBuilding(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          Preview & Download
        </h2>
        <p className="text-gray-600">
          Review your package before creating
        </p>
      </div>

      {/* Package Summary */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Package Summary</h3>
        
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Name:</dt>
            <dd className="font-medium text-gray-900">{manifest.metadata?.title || 'Untitled Package'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Version:</dt>
            <dd className="font-medium text-gray-900">{manifest.metadata?.version || '1.0.0'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Resources:</dt>
            <dd className="font-medium text-gray-900">{resourcesList.length}</dd>
          </div>
        </dl>

        {manifest.metadata?.description && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="text-sm text-gray-600">{manifest.metadata.description}</p>
          </div>
        )}
      </div>

      {/* Resources List */}
      <div className="mb-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Included Resources</h3>
        <div className="space-y-2">
          {resourcesList.map((resource) => {
            const badgeColor = RESOURCE_TYPE_COLORS[resource.subject || ''] || 'bg-gray-100 text-gray-700'
            
            return (
              <div
                key={`${resource.owner}_${resource.language}_${resource.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">{resource.name}</div>
                    <div className="text-xs text-gray-500">
                      {resource.id.toUpperCase()} • {resource.owner} • {resource.language}
                    </div>
                  </div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs ${badgeColor}`}>
                  {resource.subject}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <button
          onClick={handleDownloadManifest}
          disabled={resourcesList.length === 0}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-5 w-5" />
          Download Manifest Only
        </button>

        <button
          onClick={handleBuildPackage}
          disabled={resourcesList.length === 0 || isBuilding}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-8 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Package className="h-5 w-5" />
          Build & Install Package
        </button>
      </div>

      {/* Build Progress Modal */}
      <BuildProgressModal
        isOpen={isBuilding}
        onClose={handleCloseModal}
        progress={buildProgress}
        packageName={manifest.metadata?.title || 'Package'}
      />
    </div>
  )
}
