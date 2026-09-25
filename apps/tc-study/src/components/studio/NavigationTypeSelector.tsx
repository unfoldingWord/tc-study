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
import {
  BIBLE_NAVIGATION_MODE_ORDER,
  nextNavigationMode,
  resolveNavigationModeInOrder,
} from '../../features/nav/navigationTypeCycle'
import { markReadNavigationInternal } from '../../features/read/replaceReadUrlFromUi'

interface NavigationTypeSelectorProps {
  onClose: () => void
  align?: 'start' | 'end'
  /** `menu` is a single current-mode cycle control inside NavigationBarMenu. */
  variant?: 'dropdown' | 'menu'
}

export function NavigationTypeSelector({
  onClose,
  align = 'start',
  variant = 'dropdown',
}: NavigationTypeSelectorProps) {
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
    markReadNavigationInternal()
    navigation.setNavigationMode(mode)
    onClose()
  }

  if (variant === 'menu') {
    const current =
      navigationTypes.find(
        (type) => type.mode === resolveNavigationModeInOrder(BIBLE_NAVIGATION_MODE_ORDER, currentMode)
      ) ?? navigationTypes[0]
    const nextMode = nextNavigationMode(BIBLE_NAVIGATION_MODE_ORDER, currentMode)
    const next = navigationTypes.find((type) => type.mode === nextMode) ?? navigationTypes[0]
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

  const options = navigationTypes.map(({ mode, icon: Icon, label }) => {
    const isActive = mode === currentMode

    return (
      <button
        key={mode}
        type="button"
        onClick={() => handleSelect(mode)}
        className={`w-full flex items-center justify-center px-3 py-2 transition-colors relative ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-fg-secondary hover:bg-muted'
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
      {/* Backdrop - transparent click-outside handler */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
      />
      
      {/* Dropdown: opens upward on mobile (bar at bottom), downward on md+ (bar at top) */}
      <div
        className={`absolute bottom-full mb-1 md:bottom-auto md:mb-0 md:top-full md:mt-1 bg-elevated rounded-lg shadow-md border border-border py-1 z-50 ${
          align === 'end' ? 'right-0' : 'left-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {options}
      </div>
    </>
  )
}
