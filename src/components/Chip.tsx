import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** A removable pill, used for blocked dates, shifts, and days off. */
export default function Chip({ children, onRemove, removeLabel }: { children: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1.5 text-sm text-neutral-700">
      {children}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 outline-none hover:bg-neutral-200 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <X size={12} />
      </button>
    </span>
  )
}
