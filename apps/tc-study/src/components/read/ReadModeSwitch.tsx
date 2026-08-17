import { BookOpen, LifeBuoy } from 'lucide-react'
import type { ReadPanelMode } from '../../features/read/readPanelModel'
import { READ_HEADER_ICON_BUTTON } from './readHeaderChrome'

interface ReadModeSwitchProps {
  mode: ReadPanelMode
  onModeSwitch: (mode: ReadPanelMode) => void
}

export function ReadModeSwitch({ mode, onModeSwitch }: ReadModeSwitchProps) {
  const nextMode: ReadPanelMode = mode === 'scripture' ? 'helps' : 'scripture'
  const modeTitle = nextMode === 'helps' ? 'Show helps' : 'Show scripture'
  const Icon = nextMode === 'helps' ? LifeBuoy : BookOpen

  return (
    <button
      type="button"
      onClick={() => onModeSwitch(nextMode)}
      className={READ_HEADER_ICON_BUTTON}
      title={modeTitle}
      aria-label={modeTitle}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}
