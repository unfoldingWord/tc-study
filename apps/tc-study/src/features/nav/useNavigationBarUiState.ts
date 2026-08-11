import { useEffect, useRef, useState } from 'react'

export function useNavigationBarUiState() {
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isVersionOpen, setIsVersionOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const typeSelectorRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!isTypeSelectorOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (typeSelectorRef.current && !typeSelectorRef.current.contains(e.target as Node)) {
        setIsTypeSelectorOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isTypeSelectorOpen])

  return {
    isNavigatorOpen,
    setIsNavigatorOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    isTypeSelectorOpen,
    setIsTypeSelectorOpen,
    isMenuOpen,
    setIsMenuOpen,
    isVersionOpen,
    setIsVersionOpen,
    menuRef,
    typeSelectorRef,
  }
}
