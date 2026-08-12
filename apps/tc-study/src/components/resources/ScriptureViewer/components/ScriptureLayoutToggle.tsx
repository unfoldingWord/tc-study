import { AlignLeft, List } from 'lucide-react'
import { useScriptureDisplayStore } from '../../../../lib/stores/scriptureDisplayStore'
import { chromeIconButtonClass } from '../../common/chromeIconButton'

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
      className={chromeIconButtonClass(isFormatted)}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}
