import { Columns2, Square } from 'lucide-react'
import type { ReadLayoutMode } from '../../features/read/readPanelPersistence'

interface ReadLayoutToggleProps {
  layout: ReadLayoutMode
  onLayoutChange: (layout: ReadLayoutMode) => void
}

export function ReadLayoutToggle({ layout, onLayoutChange }: ReadLayoutToggleProps) {
  const next: ReadLayoutMode = layout === 'one' ? 'two' : 'one'
  const title = next === 'two' ? 'Show two panels' : 'Show one panel'
  return (
    <button
      type="button"
      onClick={() => onLayoutChange(next)}
      className="min-h-11 min-w-11 flex items-center justify-center rounded-md hover:bg-muted text-fg-secondary"
      title={title}
      aria-label={title}
    >
      {next === 'two' ? <Columns2 className="w-5 h-5" /> : <Square className="w-5 h-5" />}
    </button>
  )
}
