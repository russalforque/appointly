import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ConfirmContext, type ConfirmOptions } from '../lib/confirm'
import { actionDangerSolid, actionPrimary, actionSecondary } from '../lib/ui'
import Modal from './Modal'

/**
 * Promise-based confirmation sheet. On phones it rises from the bottom with full-width buttons;
 * the safe choice sits nearest the thumb, so a hurried tap never lands on the destructive one.
 */
export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setRequest(options)
      }),
    [],
  )

  function settle(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setRequest(null)
  }

  const danger = request?.tone === 'danger'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Modal onClose={() => settle(false)} title={request.title} titleId="confirm-title" maxWidth="max-w-sm">
          <div className="flex items-start gap-3">
            {danger && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle size={17} strokeWidth={2} aria-hidden />
              </span>
            )}
            {request.body && <p className="pt-1.5 text-sm leading-relaxed text-neutral-600">{request.body}</p>}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => settle(false)} className={`${actionSecondary} w-full sm:w-auto`}>
              {request.cancelLabel ?? 'Keep it'}
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={`${danger ? actionDangerSolid : actionPrimary} w-full sm:w-auto`}
            >
              {request.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
