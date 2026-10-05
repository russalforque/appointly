import type { ShowToast } from './toast'

/** Copies text and confirms it with a toast; says so when the browser refuses. */
export async function copyText(text: string, toast: ShowToast, what = 'Link') {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} copied`)
  } catch {
    toast(`Couldn't copy — press and hold the ${what.toLowerCase()} to copy it`, 'error')
  }
}

/**
 * The phone's own share sheet (Messenger, Viber, SMS…) where there is one — that is how owners
 * actually send their booking link — and a copy everywhere else.
 */
export async function shareLink(url: string, title: string, toast: ShowToast) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  await copyText(url, toast)
}
