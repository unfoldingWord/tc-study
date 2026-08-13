import { BookOpen, LifeBuoy } from 'lucide-react'
import type { ReadPanelMode } from '../../features/read/readPanelModel'

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
      className="flex items-center justify-center rounded p-1 text-fg-secondary hover:bg-muted transition-colors min-h-11 min-w-11"
      title={modeTitle}
      aria-label={modeTitle}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}
