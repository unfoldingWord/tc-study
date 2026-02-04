/**
 * Settings page - App configuration
 */

import { useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon, Sun, Database, Info, HardDrive } from 'lucide-react'

export default function Settings() {
  const navigate = useNavigate()
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-50 rounded-lg">
              <SettingsIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
              <p className="text-xs text-gray-500">Configure your experience</p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="space-y-3">
        {/* Appearance */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Sun className="h-4 w-4 text-yellow-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Theme</p>
                <p className="text-xs text-gray-500 mt-0.5">Choose light or dark mode</p>
              </div>
              <select className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                <option>Light</option>
                <option>Dark</option>
                <option>System</option>
              </select>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Database className="h-4 w-4 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Storage</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Storage Used</p>
                <p className="text-xs text-gray-500 mt-0.5">Local storage and cache</p>
              </div>
              <span className="text-sm font-medium text-gray-900">0 MB</span>
            </div>
            <button className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors">
              Clear All Cache
            </button>
          </div>
        </div>

        {/* Data Management */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <HardDrive className="h-4 w-4 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Data Management</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-900 text-sm">Import & Export</p>
              <p className="text-xs text-gray-500 mt-0.5">Manage passage sets, collections, and resources</p>
            </div>
            <button
              onClick={() => navigate('/data')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              aria-label="Open data management"
              data-testid="open-data-management-btn"
            >
              Manage Data
            </button>
          </div>
        </div>

        {/* About */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-gray-50 rounded-lg">
              <Info className="h-4 w-4 text-gray-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">About</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              <strong className="text-gray-900">TC Study</strong> - Translation Companion
            </p>
            <p className="text-xs">Version 0.1.0</p>
            <p className="text-xs">
              Bible study and translation platform
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
