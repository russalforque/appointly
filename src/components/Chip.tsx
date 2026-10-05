import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** A removable pill, used for blocked dates, shifts, and days off. */
export default function Chip({ children, onRemove, removeLabel }: { children: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 py-0.5 pl-3 pr-0.5 text-sm text-neutral-700">
      {/* A long day-off reason truncates instead of pushing the pill past the panel edge */}
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 outline-none hover:bg-neutral-200 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <X size={13} />
      </button>
    </span>
  )
}
