import { useCallback } from 'react'
import { ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import { proofUrl } from '../lib/payments'
import { useLoad } from '../lib/useLoad'

/** Receipts live in a private bucket, so each view fetches its own short-lived signed URL. */
export default function ProofPreview({ path }: { path: string }) {
  const load = useCallback(() => proofUrl(path), [path])
  const { data: url, loading, error } = useLoad(load)

  if (loading)
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )

  if (error || !url)
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
        <ImageOff size={20} strokeWidth={1.75} className="text-neutral-400" />
        Could not load the receipt.
      </div>
    )

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
        <img src={url} alt="Proof of payment" className="max-h-96 w-full object-contain" />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center gap-1.5 text-xs font-medium text-brand-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <ExternalLink size={13} strokeWidth={1.75} />
        Open full size
      </a>
    </div>
  )
}
