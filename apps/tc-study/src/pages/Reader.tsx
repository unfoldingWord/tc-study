import { useParams, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { usePackageStore } from '../lib/stores'
import { PanelLayout } from '../components/panels/PanelLayout'

export default function Reader() {
  const { packageId } = useParams()
  const navigate = useNavigate()
  const packages = usePackageStore((state: any) => state.packages)
  const setActivePackage = usePackageStore((state: any) => state.setActivePackage)
  const loadPackages = usePackageStore((state: any) => state.loadPackages)
  
  useEffect(() => {
    // Load packages if not already
    loadPackages()
  }, [loadPackages])
  
  useEffect(() => {
    if (packageId) {
      setActivePackage(packageId)
    }
  }, [packageId, setActivePackage])
  
  const activePackage = packageId ? packages.find((p: any) => p.id === packageId) : null
  
  if (!activePackage && packageId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            Package not found
          </h2>
          <p className="mb-6 text-gray-600">
            The package "{packageId}" could not be loaded.
          </p>
          <button
            onClick={() => navigate('/library')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Go to Library
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="h-[calc(100vh-4rem)]">
      <PanelLayout>
        <div className="p-6">Reader content coming soon...</div>
      </PanelLayout>
    </div>
  )
}
