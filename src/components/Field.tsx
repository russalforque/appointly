import type { ReactNode } from 'react'

export default function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-neutral-500">{hint}</span>}
    </label>
  )
}
