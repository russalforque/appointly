import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfirm } from './confirm'

/**
 * Asks before unsaved edits are thrown away. The app uses <BrowserRouter>, where useBlocker is
 * unavailable, so in-app links are caught on their way to React Router instead: a capture listener
 * on the document runs before the router's own click handler. Closing or reloading the tab gets the
 * browser's own prompt.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const navigateRef = useRef(navigate)
  const confirmRef = useRef(confirm)
  useEffect(() => {
    navigateRef.current = navigate
    confirmRef.current = confirm
  })

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()

    const onClick = async (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      const leave = await confirmRef.current({
        title: 'Leave without saving?',
        body: 'Your changes on this page have not been saved and will be lost.',
        confirmLabel: 'Leave page',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      })
      if (leave) navigateRef.current(url.pathname + url.search + url.hash)
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])
}
