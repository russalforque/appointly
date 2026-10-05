import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  onClose: () => void
  title: ReactNode
  titleId: string
  children: ReactNode
  maxWidth?: string
  /** Pinned below the scrolling body — the sheet's actions stay in reach however long it gets. */
  footer?: ReactNode
}

/**
 * Accessible dialog: focus-trapped, Esc-to-close, scroll-locked, returns focus
 * to the trigger on close, and renders as a bottom sheet on mobile / centered
 * card on desktop. The caller mounts it conditionally (`{active && <Modal .../>}`)
 * so exit is instant, but entry animates in.
 */
export default function Modal({ onClose, title, titleId, children, maxWidth = 'max-w-md', footer }: ModalProps) {
  const [entered, setEntered] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)
  // Read through a ref so a parent passing a fresh arrow each render doesn't re-run the effect
  // below — which refocused the close button and replayed the entry animation on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    triggerRef.current = document.activeElement
    const raf = requestAnimationFrame(() => setEntered(true))

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      setEntered(false)
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [])

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 transition-opacity duration-200 ease-out sm:items-center sm:p-4 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        // dvh, not vh: on phones vh includes the area behind the browser toolbars, which pushed the
        // sheet's bottom actions off screen.
        className={`flex max-h-[88dvh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl transition-all duration-200 ease-out sm:max-h-[90dvh] sm:rounded-2xl ${
          entered ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Grab handle: tells a phone user this is a sheet over the page, not a new page */}
        <span aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-neutral-200 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-2.5 sm:pt-5">
          <h2 id={titleId} className="min-w-0 text-[17px] font-semibold text-neutral-900 wrap-break-word sm:text-[18px]">
            {title}
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600/50 sm:mr-0 sm:h-8 sm:w-8 sm:rounded-lg sm:bg-transparent"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${
            footer ? 'pb-4' : 'pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5'
          }`}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-neutral-100 bg-white px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
