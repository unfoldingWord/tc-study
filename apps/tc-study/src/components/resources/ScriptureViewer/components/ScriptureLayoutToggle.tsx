import { AlignLeft, List } from 'lucide-react'
import { useScriptureDisplayStore } from '../../../../lib/stores/scriptureDisplayStore'

/**
 * Icon-only toggle between verse-block and USJ-formatted scripture layout.
 */
export function ScriptureLayoutToggle() {
  const layoutMode = useScriptureDisplayStore((s) => s.layoutMode)
  const toggleLayoutMode = useScriptureDisplayStore((s) => s.toggleLayoutMode)
  const isFormatted = layoutMode === 'formatted'

  const title = isFormatted
    ? 'Switch to verse blocks'
    : 'Switch to formatted paragraphs'
  const Icon = isFormatted ? AlignLeft : List

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        toggleLayoutMode()
      }}
      title={title}
      aria-label={title}
      aria-pressed={isFormatted}
      data-scripture-layout-toggle={layoutMode}
      className={`p-1.5 rounded-md transition-colors ${
        isFormatted
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}
