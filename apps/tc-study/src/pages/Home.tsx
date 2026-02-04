/**
 * Home page - Quick access and overview
 */

import { Clapperboard, FileText, FolderOpen, Library } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePackageStore } from '../lib/stores'

export default function Home() {
  const navigate = useNavigate()
  const packages = usePackageStore((state: any) => state.packages)
  const activePackageId = usePackageStore((state: any) => state.activePackageId)
  const loadPackages = usePackageStore((state: any) => state.loadPackages)

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  const installedCollections = packages.filter((pkg: any) => pkg.status === 'installed')
  const activeCollection = activePackageId ? packages.find((p: any) => p.id === activePackageId) : null

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900">
          Welcome to TC Study
        </h1>
        <p className="mx-auto max-w-2xl text-gray-600">
          Your Bible study and translation platform
        </p>
      </div>

      {/* Quick Actions */}
      <div className="mb-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Library */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer"
             onClick={() => navigate('/library')}>
          <div className="mb-4 inline-flex p-3 bg-blue-50 rounded-xl">
            <Library className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Library
          </h3>
          <p className="text-sm text-gray-500">
            Browse and download resources
          </p>
        </div>

        {/* Collections */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer"
             onClick={() => navigate('/collections')}>
          <div className="mb-4 inline-flex p-3 bg-purple-50 rounded-xl">
            <FolderOpen className="h-6 w-6 text-purple-600" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Collections
          </h3>
          <p className="text-sm text-gray-500">
            {installedCollections.length} collection{installedCollections.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Passage Sets */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer"
             onClick={() => navigate('/passage-sets')}>
          <div className="mb-4 inline-flex p-3 bg-orange-50 rounded-xl">
            <FileText className="h-6 w-6 text-orange-600" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Passage Sets
          </h3>
          <p className="text-sm text-gray-500">
            Curated scripture collections
          </p>
        </div>

        {/* Studio */}
        <div className="group rounded-2xl border border-gray-100 bg-white p-6 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer"
             onClick={() => navigate('/studio')}>
          <div className="mb-4 inline-flex p-3 bg-green-50 rounded-xl">
            <Clapperboard className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Studio
          </h3>
          <p className="text-sm text-gray-500">
            {activeCollection ? activeCollection.name : 'Open your workspace'}
          </p>
        </div>
      </div>

      {/* Features Overview */}
      <div className="rounded-2xl border border-gray-100 bg-white p-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">
          Features
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-1 bg-blue-500 rounded-full"></div>
            <div>
              <h3 className="mb-1 font-medium text-gray-900">Two-Panel Study</h3>
              <p className="text-sm text-gray-500">
                View multiple resources side-by-side
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-1 bg-green-500 rounded-full"></div>
            <div>
              <h3 className="mb-1 font-medium text-gray-900">Original Languages</h3>
              <p className="text-sm text-gray-500">
                Access Greek and Hebrew texts
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-1 bg-purple-500 rounded-full"></div>
            <div>
              <h3 className="mb-1 font-medium text-gray-900">Translation Resources</h3>
              <p className="text-sm text-gray-500">
                Notes, questions, and definitions
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-1 bg-orange-500 rounded-full"></div>
            <div>
              <h3 className="mb-1 font-medium text-gray-900">Passage Sets</h3>
              <p className="text-sm text-gray-500">
                Create curated scripture collections
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-1 bg-pink-500 rounded-full"></div>
            <div>
              <h3 className="mb-1 font-medium text-gray-900">Offline Ready</h3>
              <p className="text-sm text-gray-500">
                Access resources anytime, anywhere
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      {installedCollections.length === 0 && (
        <div className="mt-16 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 p-12 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <Library className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-gray-900">
            Get Started
          </h3>
          <p className="mb-6 text-gray-600">
            Browse and download resources from the library
          </p>
          <button
            onClick={() => navigate('/library')}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Browse Library
          </button>
        </div>
      )}
    </div>
  )
}
