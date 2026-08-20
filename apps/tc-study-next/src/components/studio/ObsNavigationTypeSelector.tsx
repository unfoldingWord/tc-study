import { BookMarked, Library } from 'lucide-react'
import { useNavigation, useNavigationMode } from '../../contexts'

export function ObsNavigationTypeSelector({ onClose }: { onClose: () => void }) {
  const navigation = useNavigation()
  const currentMode = useNavigationMode()

  const modes = [
    { mode: 'verse' as const, icon: BookMarked, label: 'Frame' },
    { mode: 'chapter' as const, icon: Library, label: 'Story' },
  ]

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />
      <div
        className="absolute bottom-full left-0 mb-1 md:bottom-auto md:mb-0 md:top-full md:mt-1 bg-white rounded-lg shadow-md border border-gray-200 py-1 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {modes.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => {
              navigation.setNavigationMode(mode)
              onClose()
            }}
            className={`w-full flex items-center justify-center px-3 py-2 transition-colors relative ${
              mode === currentMode ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
            title={label}
            aria-label={label}
          >
            <Icon className="w-4 h-4" />
            {mode === currentMode && (
              <div className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-blue-600" />
            )}
          </button>
        ))}
      </div>
    </>
  )
}
