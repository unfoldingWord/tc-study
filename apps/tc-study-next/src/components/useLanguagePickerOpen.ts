import { useCallback, useEffect, useState } from 'react'

/**
 * Uncontrolled by default (`autoOpen` / `required`). Pass `open` + `onOpenChange`
 * so an empty-state CTA can open the same picker instance.
 */
export function useLanguagePickerOpen(options: {
  autoOpen: boolean
  required: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}): { isOpen: boolean; setOpen: (next: boolean) => void } {
  const { autoOpen, required, open: openProp, onOpenChange } = options
  const [uncontrolled, setUncontrolled] = useState(() => autoOpen || required)
  const isControlled = openProp !== undefined
  const isOpen = isControlled ? openProp : uncontrolled

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  useEffect(() => {
    if (autoOpen || required) {
      setOpen(true)
    }
  }, [autoOpen, required, setOpen])

  return { isOpen, setOpen }
}
