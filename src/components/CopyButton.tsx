import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Copies `value` and confirms in place; falls back silently when the clipboard is unavailable. */
export default function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-600 outline-none transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      {copied ? <Check size={14} strokeWidth={2} className="text-green-600" /> : <Copy size={14} strokeWidth={1.75} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
