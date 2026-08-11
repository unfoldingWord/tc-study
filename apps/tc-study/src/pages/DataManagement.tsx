/**
 * Data Management - Import/Export for Passage Sets, Collections, and Resources
 */

import { FileText, FolderOpen, Library, Upload } from 'lucide-react'
import { PassageSetForm } from '../components/data/PassageSetForm'
import { DataCollectionsTab } from '../features/data/DataCollectionsTab'
import { DataPassageSetsTab } from '../features/data/DataPassageSetsTab'
import { DataResourcesTab } from '../features/data/DataResourcesTab'
import { useDataManagement, type DataTab } from '../features/data/useDataManagement'

const TABS: { id: DataTab; label: string; icon: typeof FileText }[] = [
  { id: 'passage-sets', label: 'Passage Sets', icon: FileText },
  { id: 'collections', label: 'Collections', icon: FolderOpen },
  { id: 'resources', label: 'Resources', icon: Library },
]

export default function DataManagement() {
  const dm = useDataManagement()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Upload className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Data Management</h1>
              <p className="text-xs text-gray-500">Import and export your data</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => dm.setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                  dm.activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
                data-testid={`tab-${tab.id}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {dm.activeTab === 'passage-sets' && (
          <DataPassageSetsTab
            passageSets={dm.passageSets}
            inputRef={dm.passageSetInputRef}
            onImport={dm.handleImportPassageSet}
            onExportAll={dm.handleExportAllPassageSets}
            onExportOne={dm.handleExportPassageSet}
            onEdit={dm.openEditPassageSet}
            onDelete={dm.handleDeletePassageSet}
            onNew={dm.openNewPassageSet}
          />
        )}

        {dm.activeTab === 'collections' && (
          <DataCollectionsTab
            packages={dm.packages}
            inputRef={dm.collectionInputRef}
            onImport={dm.handleImportCollection}
            onExportAll={dm.handleExportAllCollections}
            onExportOne={dm.handleExportCollection}
          />
        )}

        {dm.activeTab === 'resources' && (
          <DataResourcesTab
            inputRef={dm.resourceInputRef}
            onImport={dm.handleImportResourcePackage}
          />
        )}
      </div>

      {dm.showPassageSetForm && (
        <PassageSetForm
          passageSet={dm.editingPassageSet}
          onSave={dm.handleSavePassageSet}
          onCancel={dm.handleCancelPassageSetForm}
        />
      )}
    </div>
  )
}
