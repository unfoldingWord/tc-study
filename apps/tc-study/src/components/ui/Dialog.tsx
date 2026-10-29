/**
 * tC4 Modal: a radius-16 panel with the modal shadow over the overlay scrim, titled in helps-fg
 * (Ocean / white). Escape or a press on the scrim closes it. See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react'
import { X } from 'lucide-react'
import { ModalPortal } from '../shared/ModalPortal'
import { IconButton } from './IconButton'

interface DialogContent {
  title: string
  closeLabel: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
}

/** The scrim and panel, without the portal or focus handling, so it renders on the server. */
export function DialogFrame({
  titleId,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  panelRef,
}: DialogContent & { titleId: string; panelRef?: Ref<HTMLDivElement> }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[min(90vh,860px)] w-full max-w-[520px] flex-col rounded-2xl bg-elevated shadow-xl outline-none"
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-3">
          <h2 id={titleId} className="min-w-0 flex-1 pt-1 text-xl font-extrabold text-helps-fg">
            {title}
          </h2>
          <IconButton label={closeLabel} onClick={onClose} className="-mr-2">
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 text-sm text-fg">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

export function Dialog({ open, ...content }: DialogContent & { open: boolean }) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
      else document.body.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <ModalPortal>
      <DialogFrame {...content} titleId={titleId} panelRef={panelRef} />
    </ModalPortal>
  )
}
