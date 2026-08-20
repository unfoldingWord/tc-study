/**
 * Settings page - App configuration
 */

import { useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon, Sun, Database, Info, HardDrive } from 'lucide-react'
import { ThemePreferenceButtons } from '../features/theme'

export default function Settings() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-canvas">
      <div className="bg-surface/80 backdrop-blur-sm border-b border-border-subtle sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <SettingsIcon className="w-5 h-5 text-fg-secondary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-fg">Settings</h1>
              <p className="text-xs text-fg-muted">Configure your experience</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="space-y-3">
          <div className="rounded-2xl border border-border-subtle bg-surface p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-highlight/40 rounded-lg">
                <Sun className="h-4 w-4 text-accent-fg" />
              </div>
              <h2 className="text-lg font-semibold text-fg">Appearance</h2>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-fg text-sm">Theme</p>
                <p className="text-xs text-fg-muted mt-0.5">Light, dark, or system</p>
              </div>
              <ThemePreferenceButtons />
            </div>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-accent-soft rounded-lg">
                <Database className="h-4 w-4 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-fg">Storage</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-fg text-sm">Storage Used</p>
                  <p className="text-xs text-fg-muted mt-0.5">Local storage and cache</p>
                </div>
                <span className="text-sm font-medium text-fg">0 MB</span>
              </div>
              <button className="text-xs font-medium text-danger hover:opacity-90 transition-colors">
                Clear All Cache
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-accent-soft rounded-lg">
                <HardDrive className="h-4 w-4 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-fg">Data Management</h2>
            </div>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-fg text-sm">Import & Export</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  Manage passage sets, collections, and resources
                </p>
              </div>
              <button
                onClick={() => navigate('/data')}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
                aria-label="Open data management"
                data-testid="open-data-management-btn"
              >
                Manage Data
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Info className="h-4 w-4 text-fg-secondary" />
              </div>
              <h2 className="text-lg font-semibold text-fg">About</h2>
            </div>
            <div className="space-y-2 text-sm text-fg-secondary">
              <p>
                <strong className="text-fg">TC Study</strong> - Translation Companion
              </p>
              <p className="text-xs">Version 0.1.0</p>
              <p className="text-xs">Bible study and translation platform</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
