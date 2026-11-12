/**
 * Settings page - App configuration
 */

import { useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon, Sun, Database, Info, HardDrive } from 'lucide-react'
import { ThemePreferenceButtons } from '../features/theme'
import { BRAND_FULL, BRAND_SHORT } from '../config/brand'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'

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
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-highlight/40 rounded-lg">
                <Sun className="h-4 w-4 text-accent-fg" />
              </div>
              <SectionLabel as="h2">Appearance</SectionLabel>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-fg text-sm">Theme</p>
                <p className="text-xs text-fg-muted mt-0.5">Light, dark, or system</p>
              </div>
              <ThemePreferenceButtons />
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-accent-soft rounded-lg">
                <Database className="h-4 w-4 text-accent" />
              </div>
              <SectionLabel as="h2">Storage</SectionLabel>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-fg text-sm">Storage Used</p>
                  <p className="text-xs text-fg-muted mt-0.5">Local storage and cache</p>
                </div>
                <span className="text-sm font-medium text-fg">0 MB</span>
              </div>
              <Button variant="danger" className="-ml-5">
                Clear All Cache
              </Button>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-accent-soft rounded-lg">
                <HardDrive className="h-4 w-4 text-accent" />
              </div>
              <SectionLabel as="h2">Data Management</SectionLabel>
            </div>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-fg text-sm">Import & Export</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  Manage passage sets, collections, and resources
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/data')}
                aria-label="Open data management"
                data-testid="open-data-management-btn"
              >
                Manage Data
              </Button>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Info className="h-4 w-4 text-fg-secondary" />
              </div>
              <SectionLabel as="h2">About</SectionLabel>
            </div>
            <div className="space-y-2 text-sm text-fg-secondary">
              <p>
                <strong className="text-fg">{BRAND_SHORT}</strong> — {BRAND_FULL}
              </p>
              <p className="text-xs">Version 0.1.0</p>
              <p className="text-xs">Bible study and translation platform</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
