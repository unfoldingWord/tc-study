import { ArrowLeftRight, Info, MoreVertical, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ResourceInfoModal } from './ResourceInfoModal'
import { ResourceTabs } from './ResourceTabs'

interface PanelHeaderProps {
  panelNumber: 1 | 2
  resources: any[]
  currentIndex: number
  currentResource: any
  onIndexChange: (index: number) => void
  onRemove: () => void
  /** Move current resource to the other panel. When provided, shows menu item. */
  onMoveToOtherPanel?: () => void
  colorScheme: 'blue' | 'purple'
  /** Panel id (e.g. 'panel-1'). Required for dnd-kit sortable tabs. */
  panelId?: string
  /** Show a ghost placeholder tab when dragging from another panel */
  showDropPlaceholder?: boolean
  /** Label for the placeholder tab */
  placeholderLabel?: string
  /** Index where the placeholder should appear (null = end of tabs) */
  placeholderIndex?: number | null
}

const getResourceId = (resource: any): string => {
  if (resource?.key) {
    const parts = resource.key.split('/')
    const lastPart = parts[parts.length - 1] || ''
    if (lastPart) return lastPart.toUpperCase()
  }
  if (resource?.title) {
    const t = resource.title
    if (t.includes('Greek New Testament')) return 'UGNT'
    if (t.includes('Hebrew Old Testament')) return 'UHB'
    if (t.includes('Literal Text')) return 'ULT'
    if (t.includes('Simplified Text')) return 'UST'
    if (t.includes('Translation Notes')) return 'UTN'
    if (t.includes('Translation Words')) return 'UTW'
    if (t.includes('Translation Questions')) return 'UTQ'
    if (t.includes('Translation Academy')) return 'UTA'
    const words = t.split(/\s+/)
    for (const w of words) {
      if (['unfoldingWord', 'the', 'a', 'an', 'of'].includes(w)) continue
      return w.substring(0, 4).toUpperCase()
    }
  }
  return 'N/A'
}

export function PanelHeader({
  panelNumber,
  resources,
  currentIndex,
  currentResource,
  onIndexChange,
  onRemove,
  onMoveToOtherPanel,
  colorScheme,
  panelId: panelIdProp,
  showDropPlaceholder = false,
  placeholderLabel = '',
  placeholderIndex = null,
}: PanelHeaderProps) {
  const panelId = panelIdProp ?? `panel-${panelNumber}`
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const colors = {
    blue: {
      gradient: 'from-blue-50 to-gray-50',
      badge: 'bg-blue-100 text-blue-600',
      button: 'hover:bg-blue-100 active:bg-blue-200',
      icon: 'text-blue-600',
    },
    purple: {
      gradient: 'from-purple-50 to-gray-50',
      badge: 'bg-purple-100 text-purple-600',
      button: 'hover:bg-purple-100 active:bg-purple-200',
      icon: 'text-purple-600',
    },
  }
  const c = colors[colorScheme]

  return (
    <div className={`px-2 pt-1.5 pb-0 md:px-3 md:pt-2 md:pb-0 border-b border-gray-200 bg-gradient-to-r ${c.gradient}`}>
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={`w-5 h-5 rounded ${c.badge} flex items-center justify-center font-semibold text-xs flex-shrink-0`}
          title={`Panel ${panelNumber}`}
        >
          {panelNumber}
        </div>

        <ResourceTabs
          resources={resources}
          currentIndex={currentIndex}
          onIndexChange={onIndexChange}
          getResourceId={getResourceId}
          colorScheme={colorScheme}
          panelId={panelId}
          showDropPlaceholder={showDropPlaceholder}
          placeholderLabel={placeholderLabel}
          placeholderIndex={placeholderIndex}
        />

        {currentResource && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`p-1.5 rounded ${c.button} transition-colors`}
              title="Actions"
              aria-label="Resource actions"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <MoreVertical className={`w-4 h-4 ${c.icon}`} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-auto py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                role="menu"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowInfoModal(true)
                    setMenuOpen(false)
                  }}
                  className="flex items-center justify-center p-2 hover:bg-gray-100"
                  title="Resource info"
                  aria-label="Resource info"
                >
                  <Info className="w-4 h-4 text-gray-500" />
                </button>
                {onMoveToOtherPanel && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      onMoveToOtherPanel()
                      setMenuOpen(false)
                    }}
                    className="flex items-center justify-center p-2 hover:bg-gray-100"
                    title="Move to other panel"
                    aria-label="Move to other panel"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-gray-500" />
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    onRemove()
                    setMenuOpen(false)
                  }}
                  className="flex items-center justify-center p-2 hover:bg-red-50"
                  title="Remove from panel"
                  aria-label="Remove from panel"
                >
                  <X className="w-4 h-4 text-red-600" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {currentResource && (
        <ResourceInfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          resource={currentResource}
        />
      )}
    </div>
  )
}
