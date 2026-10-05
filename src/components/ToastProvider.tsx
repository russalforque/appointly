import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Info } from 'lucide-react'
import { ToastContext, type ToastTone } from '../lib/toast'

const ICON = { success: Check, error: AlertCircle, info: Info }
const DURATION = { success: 2500, info: 2500, error: 5000 }

/**
 * One toast at a time, centred above the phone tab bar (or the screen edge where there is none).
 * A new message replaces the current one rather than stacking, so rapid actions never pile up.
 */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null)
  const nextId = useRef(0)

  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    nextId.current += 1
    setToast({ id: nextId.current, message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), DURATION[toast.tone])
    return () => clearTimeout(t)
  }, [toast])

  const Icon = toast ? ICON[toast.tone] : null

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-above-bar z-[60] flex justify-center px-4" aria-live="polite" role="status">
          {toast && Icon && (
            <div
              key={toast.id}
              className={`toast-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-full py-2.5 pl-3.5 pr-4 text-sm font-medium shadow-lg shadow-neutral-900/15 ${
                toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-neutral-900 text-white'
              }`}
            >
              <Icon size={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
              <span className="min-w-0">{toast.message}</span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
