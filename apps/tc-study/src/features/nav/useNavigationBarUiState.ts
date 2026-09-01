import { useEffect, useRef, useState } from 'react'

export function useNavigationBarUiState() {
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isVersionOpen, setIsVersionOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  return {
    isNavigatorOpen,
    setIsNavigatorOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    isMenuOpen,
    setIsMenuOpen,
    isVersionOpen,
    setIsVersionOpen,
    menuRef,
  }
}
