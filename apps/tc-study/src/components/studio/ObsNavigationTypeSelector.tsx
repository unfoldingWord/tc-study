import { BookMarked, Library } from 'lucide-react'
import { useNavigation, useNavigationMode } from '../../contexts'
import {
  OBS_NAVIGATION_MODE_ORDER,
  nextNavigationMode,
  resolveNavigationModeInOrder,
} from '../../features/nav/navigationTypeCycle'
import { markReadNavigationInternal } from '../../features/read/replaceReadUrlFromUi'

export function ObsNavigationTypeSelector({
  onClose,
  align = 'start',
  variant = 'dropdown',
}: {
  onClose: () => void
  align?: 'start' | 'end'
  /** `menu` is a single current-mode cycle control inside NavigationBarMenu. */
  variant?: 'dropdown' | 'menu'
}) {
  const navigation = useNavigation()
  const currentMode = useNavigationMode()

  const modes = [
    { mode: 'verse' as const, icon: BookMarked, label: 'Frame' },
    { mode: 'chapter' as const, icon: Library, label: 'Story' },
  ]

  if (variant === 'menu') {
    const current =
      modes.find(
        (type) => type.mode === resolveNavigationModeInOrder(OBS_NAVIGATION_MODE_ORDER, currentMode)
      ) ?? modes[0]
    const nextMode = nextNavigationMode(OBS_NAVIGATION_MODE_ORDER, currentMode)
    const next = modes.find((type) => type.mode === nextMode) ?? modes[0]
    const Icon = current.icon
    const title = `${current.label}. Switch to ${next.label}`

    return (
      <button
        type="button"
        onClick={() => {
          markReadNavigationInternal()
          navigation.setNavigationMode(nextMode)
        }}
        className="flex items-center justify-center p-2 w-full bg-accent-soft text-accent-fg hover:bg-muted hover:text-fg"
        title={title}
        aria-label={title}
      >
        <Icon className="w-4 h-4" />
      </button>
    )
  }

  const options = modes.map(({ mode, icon: Icon, label }) => {
    const isActive = mode === currentMode
    return (
      <button
        key={mode}
        type="button"
        onClick={() => {
          markReadNavigationInternal()
          navigation.setNavigationMode(mode)
          onClose()
        }}
        className={`w-full flex items-center justify-center px-3 py-2 transition-colors relative ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
        }`}
        title={label}
        aria-label={label}
        aria-pressed={isActive}
      >
        <Icon className="w-4 h-4" />
        {isActive && <div className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-blue-600" />}
      </button>
    )
  })

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />
      <div
        className={`absolute bottom-full mb-1 md:bottom-auto md:mb-0 md:top-full md:mt-1 bg-white rounded-lg shadow-md border border-gray-200 py-1 z-50 ${
          align === 'end' ? 'right-0' : 'left-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {options}
      </div>
    </>
  )
}
