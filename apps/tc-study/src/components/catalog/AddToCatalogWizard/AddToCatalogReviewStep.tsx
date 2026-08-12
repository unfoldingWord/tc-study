import { BookOpen, CheckCircle } from 'lucide-react'
import type { WizardSelectableResource } from './types'

interface AddToCatalogReviewStepProps {
  reviewResources: Map<string, WizardSelectableResource>
  selectedForDownload: Set<string>
  onSelectionChange: (next: Set<string>) => void
}

export function AddToCatalogReviewStep({
  reviewResources,
  selectedForDownload,
  onSelectionChange,
}: AddToCatalogReviewStepProps) {
  return (
    <div className="space-y-2">
      {reviewResources.size === 0 && (
        <div className="bg-accent-soft border border-border rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-accent" />
          <span className="text-xs text-accent-fg">All resources already in catalog</span>
        </div>
      )}

      {reviewResources.size > 0 ? (
        <div className="space-y-1.5">
          {Array.from(reviewResources.entries()).map(([resourceKey, resource]) => {
            const isSelected = selectedForDownload.has(resourceKey)
            return (
              <div
                key={resourceKey}
                className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const newSelection = new Set(selectedForDownload)
                    if (e.target.checked) {
                      newSelection.add(resourceKey)
                    } else {
                      newSelection.delete(resourceKey)
                    }
                    onSelectionChange(newSelection)
                  }}
                  className="w-4 h-4 text-accent rounded focus:ring-2 focus:ring-accent cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-fg text-sm truncate">{resource.title}</h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 bg-muted text-fg-secondary rounded font-mono">
                      {resource.language || '??'}
                    </span>
                    {resource.ingredients && (
                      <span className="flex items-center gap-0.5 text-xs text-fg-secondary">
                        <BookOpen className="w-3 h-3" />
                        {resource.ingredients.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
