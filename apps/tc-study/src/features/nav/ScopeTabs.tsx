import { BookMarked, BookOpen, Library } from 'lucide-react'

interface ScopeTabsProps {
  pickerScope: 'scripture' | 'obs'
  hasObsLoaded: boolean
  obsResourceTitle: string | null
  onSelectScripture: () => void
  onSelectObs: () => void
}

export function ScopeTabs({
  pickerScope,
  hasObsLoaded,
  obsResourceTitle,
  onSelectScripture,
  onSelectObs,
}: ScopeTabsProps) {
  return (
    <div className="flex border-b border-border bg-muted px-3 py-2 gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={onSelectScripture}
        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
          pickerScope === 'scripture'
            ? 'bg-surface text-accent-fg shadow-sm border border-border'
            : 'text-fg-secondary hover:bg-muted'
        }`}
      >
        <BookOpen className="w-4 h-4 shrink-0" />
      </button>
      <button
        type="button"
        disabled={!hasObsLoaded}
        onClick={onSelectObs}
        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
          pickerScope === 'obs'
            ? 'bg-surface text-accent-fg shadow-sm border border-border'
            : 'text-fg-secondary hover:bg-muted'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <BookMarked className="w-4 h-4 shrink-0" />
        {obsResourceTitle ?? 'Open Bible Stories'}
      </button>
    </div>
  )
}

interface ObsModeTabsProps {
  pickerObsMode: 'chapter' | 'verse'
  onSelectChapter: () => void
  onSelectVerse: () => void
}

export function ObsModeTabs({
  pickerObsMode,
  onSelectChapter,
  onSelectVerse,
}: ObsModeTabsProps) {
  return (
    <div className="flex border-b border-border bg-muted px-3 py-2 gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={onSelectChapter}
        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center ${
          pickerObsMode === 'chapter'
            ? 'bg-surface text-accent-fg shadow-sm border border-border'
            : 'text-fg-secondary hover:bg-muted'
        }`}
        title="Story"
        aria-label="Story"
      >
        <Library className="w-4 h-4 shrink-0" />
      </button>
      <button
        type="button"
        onClick={onSelectVerse}
        className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center ${
          pickerObsMode === 'verse'
            ? 'bg-surface text-accent-fg shadow-sm border border-border'
            : 'text-fg-secondary hover:bg-muted'
        }`}
        title="Frame"
        aria-label="Frame"
      >
        <BookMarked className="w-4 h-4 shrink-0" />
      </button>
    </div>
  )
}
