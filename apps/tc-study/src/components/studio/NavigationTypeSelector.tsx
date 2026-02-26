/**
 * NavigationTypeSelector - Dropdown for quick navigation type switching
 * 
 * Allows switching between:
 * - Custom Range (verse-by-verse or range)
 * - Chapter (whole chapter, arrows move by chapter)
 * - Sections (translator sections)
 * - Passage Sets (predefined passage lists)
 */

import { BookOpen, Library, List, ListOrdered } from 'lucide-react'
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
      mode: 'chapter' as NavigationMode,
      icon: Library,
      label: 'Chapter',
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
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
      />
      
      {/* Dropdown: opens upward on mobile (bar at bottom), downward on md+ (bar at top) */}
      <div
        className="absolute bottom-full left-0 mb-1 md:bottom-auto md:mb-0 md:top-full md:mt-1 bg-white rounded-lg shadow-md border border-gray-200 py-1 z-50"
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
