import { countPassages } from '@bt-synergy/passage-sets'
import { Download, Edit2, FileText, Plus, Trash2, Upload } from 'lucide-react'
import type { RefObject } from 'react'
import type { PassageSet } from '../../contexts/types'

interface DataPassageSetsTabProps {
  passageSets: PassageSet[]
  inputRef: RefObject<HTMLInputElement | null>
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void
  onExportAll: () => void
  onExportOne: (ps: PassageSet) => void
  onEdit: (ps: PassageSet) => void
  onDelete: (id: string) => void
  onNew: () => void
}

export function DataPassageSetsTab({
  passageSets,
  inputRef,
  onImport,
  onExportAll,
  onExportOne,
  onEdit,
  onDelete,
  onNew,
}: DataPassageSetsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="Import passage set"
            aria-label="Import passage set"
            data-testid="import-passage-set-btn"
          >
            <Upload className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
          <button
            onClick={onExportAll}
            disabled={passageSets.length === 0}
            className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export all passage sets"
            aria-label="Export all passage sets"
            data-testid="export-all-passage-sets-btn"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          data-testid="new-passage-set-btn"
        >
          <Plus className="w-4 h-4" />
          <span>New Passage Set</span>
        </button>
      </div>

      <div className="space-y-2">
        {passageSets.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No passage sets</p>
            <p className="text-sm text-gray-500 mt-1">Create or import passage sets</p>
          </div>
        ) : (
          passageSets.map((ps) => (
            <div
              key={ps.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
            >
              <div>
                <h3 className="font-medium text-gray-900">{ps.name}</h3>
                {ps.description && (
                  <p className="text-sm text-gray-500 mt-1">{ps.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {countPassages(ps)} passage{countPassages(ps) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onExportOne(ps)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Export"
                  aria-label={`Export ${ps.name}`}
                  data-testid={`export-passage-set-${ps.id}`}
                >
                  <Download className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  onClick={() => onEdit(ps)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                  aria-label={`Edit ${ps.name}`}
                  data-testid={`edit-passage-set-${ps.id}`}
                >
                  <Edit2 className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  onClick={() => onDelete(ps.id)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                  aria-label={`Delete ${ps.name}`}
                  data-testid={`delete-passage-set-${ps.id}`}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
