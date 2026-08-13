import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into document.body so position:fixed overlays are
 * viewport-relative (not trapped by filter/transform/backdrop-filter ancestors).
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
