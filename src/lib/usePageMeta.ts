import { useEffect } from 'react'

/**
 * Sets the document title and the description/Open Graph tags for a route, restoring the
 * previous values when the route unmounts.
 *
 * Appointly is a single-page app, so the tags in index.html are shared by every route: without
 * the restore, a visitor who reaches a booking page from the landing page would leave the
 * landing page's description attached to the business's page (and vice versa). Crawlers that
 * do not run JavaScript still get the index.html defaults.
 */
export function usePageMeta(meta: { title: string; description?: string; image?: string }) {
  const { title, description, image } = meta

  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const restore: (() => void)[] = []

    const set = (selector: string, attr: 'name' | 'property', key: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
        restore.push(() => el?.remove())
        el.setAttribute('content', value)
        return
      }
      const previous = el.getAttribute('content')
      el.setAttribute('content', value)
      restore.push(() => {
        if (previous === null) el?.removeAttribute('content')
        else el?.setAttribute('content', previous)
      })
    }

    set('meta[property="og:title"]', 'property', 'og:title', title)
    if (description) {
      set('meta[name="description"]', 'name', 'description', description)
      set('meta[property="og:description"]', 'property', 'og:description', description)
    }
    if (image) set('meta[property="og:image"]', 'property', 'og:image', image)

    return () => {
      document.title = previousTitle
      for (const undo of restore) undo()
    }
  }, [title, description, image])
}
