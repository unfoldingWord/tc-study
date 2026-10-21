/**
 * Fixed-position popover for CombinedHelps chrome menus (Sources, kind filter):
 * anchored under the trigger, follows resize/scroll, closes on Escape / outside press.
 */

import { useEffect, useRef, useState } from 'react'

export type HelpsMenuPopoverPos = { top: number; right: number }

/** `fallbackPos` is used when the trigger has no rect yet; without it the menu waits. */
export function useHelpsMenuPopover(fallbackPos?: HelpsMenuPopoverPos) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<HelpsMenuPopoverPos | null>(null)

  useEffect(() => {
    if (!open) return
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) {
        if (fallbackPos) setPos(fallbackPos)
        return
      }
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, fallbackPos])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return { open, setOpen, buttonRef, menuRef, pos }
}
