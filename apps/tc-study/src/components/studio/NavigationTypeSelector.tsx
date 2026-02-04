/**
 * NavigationTypeSelector - Dropdown for quick navigation type switching
 * 
 * Allows switching between:
 * - Verse (verse-by-verse)
 * - Sections (translator sections)
 * - Passage Sets (predefined passage lists)
 */

import { BookOpen, List, ListOrdered } from 'lucide-react'
import { useNavigation, useNavigationMode } from '../../contexts'
import type { NavigationMode } from '../../contexts/types'

interface NavigationTypeSelectorProps {
  onClose: () => void
}

export function NavigationTypeSelector({ onClose }: NavigationTypeSelectorProps) {
  const navigation = useNavigation()
  const currentMode = useNavigationMode()

  const navigationTypes = [
    {
      mode: 'verse' as NavigationMode,
      icon: BookOpen,
      label: 'Custom Range',
    },
    {
      mode: 'section' as NavigationMode,
      icon: List,
      label: 'Section',
    },
    {
      mode: 'passage-set' as NavigationMode,
      icon: ListOrdered,
      label: 'Passage Set',
    },
  ]

  const handleSelect = (mode: NavigationMode) => {
    navigation.setNavigationMode(mode)
    onClose()
  }

  return (
    <>
      {/* Backdrop - transparent click-outside handler */}
      <div
        className="fixed inset-0 top-[88px] z-40 bg-transparent"
        onClick={onClose}
      />
      
      {/* Compact dropdown - icon only */}
      <div
        className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-md border border-gray-200 py-1 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {navigationTypes.map(({ mode, icon: Icon, label }) => {
          const isActive = mode === currentMode

          return (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className={`
                w-full flex items-center justify-center px-3 py-2 transition-colors relative
                ${isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
                }
              `}
              title={label}
              aria-label={label}
            >
              <Icon className="w-4 h-4" />
              {isActive && (
                <div className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-blue-600" />
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
