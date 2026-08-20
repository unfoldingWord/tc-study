import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface Resource {
  id: string
  key: string
  title: string
  languageCode: string
  owner?: string
}

interface ResourceSelectorProps {
  resources: Resource[]
  currentIndex: number
  onIndexChange: (index: number) => void
  getResourceId: (resource: Resource) => string
  color: {
    gradient: string
    badge: string
    ring: string
    count: string
    button: string
    icon: string
  }
}

export const ResourceSelector: React.FC<ResourceSelectorProps> = ({
  resources,
  currentIndex,
  onIndexChange,
  getResourceId,
  color,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [availableWidth, setAvailableWidth] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)

  const currentResource = resources[currentIndex]

  // Track available width using ResizeObserver on the button/span
  useEffect(() => {
    const elementToMeasure = resources.length === 1 ? spanRef.current?.parentElement : buttonRef.current?.parentElement
    if (!elementToMeasure) return

    // Set initial width immediately
    const initialWidth = elementToMeasure.getBoundingClientRect().width
    setAvailableWidth(initialWidth)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        setAvailableWidth(width)
      }
    })

    resizeObserver.observe(elementToMeasure)
    return () => resizeObserver.disconnect()
  }, [resources.length])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Determine if we should show full title or just ID based on available width
  // Breakpoints: < 220px = ID only, >= 220px = full title
  const showFullTitle = availableWidth >= 220

  const handleSelect = (index: number) => {
    onIndexChange(index)
    setIsOpen(false)
  }

  if (!currentResource) {
    return null
  }

  // If only one resource, show ID or full title based on width
  if (resources.length === 1) {
    return (
      <div className="flex-1 min-w-0">
        <span
          ref={spanRef}
          className="text-xs md:text-sm font-bold block truncate"
          title={currentResource.title}
        >
          {showFullTitle ? currentResource.title : getResourceId(currentResource)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 relative">
      <div ref={dropdownRef}>
        {/* Trigger button - shows resource ID or full title based on width */}
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1 text-xs md:text-sm font-bold px-1 py-0.5 md:px-2 md:py-1 rounded ${color.button} focus:outline-none focus:ring-2 ${color.ring} transition-colors w-full`}
          title={currentResource.title}
        >
          <span className="truncate flex-1 text-left">
            {showFullTitle ? currentResource.title : getResourceId(currentResource)}
          </span>
          <ChevronDown className={`w-3 h-3 md:w-3.5 md:h-3.5 ${color.icon} transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown menu - shows full titles */}
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 w-64 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {resources.map((resource, idx) => (
              <button
                key={resource.id}
                onClick={() => handleSelect(idx)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
                  idx === currentIndex ? 'bg-blue-50 font-semibold' : ''
                } ${idx === 0 ? 'rounded-t-lg' : ''} ${
                  idx === resources.length - 1 ? 'rounded-b-lg' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-gray-500">
                    {getResourceId(resource)}
                  </span>
                  <span className="flex-1 truncate">{resource.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
