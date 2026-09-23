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
}

/**
 * Accessible dialog: focus-trapped, Esc-to-close, scroll-locked, returns focus
 * to the trigger on close, and renders as a bottom sheet on mobile / centered
 * card on desktop. The caller mounts it conditionally (`{active && <Modal .../>}`)
 * so exit is instant, but entry animates in.
 */
export default function Modal({ onClose, title, titleId, children, maxWidth = 'max-w-md' }: ModalProps) {
  const [entered, setEntered] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    triggerRef.current = document.activeElement
    const raf = requestAnimationFrame(() => setEntered(true))

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    closeRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
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
  }, [onClose])

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
        className={`max-h-[88vh] w-full ${maxWidth} overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl transition-all duration-200 ease-out sm:max-h-[90vh] sm:rounded-2xl sm:pb-5 ${
          entered ? 'translate-y-0 opacity-100 sm:scale-100' : 'translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-[18px] font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
