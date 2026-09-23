import { Check } from 'lucide-react'
import { panel } from '../lib/ui'

export function Loading() {
  return <p className="p-6 text-sm text-slate-500">Loading…</p>
}

/** Base pulsing placeholder block. Compose with width/height utility classes. */
export function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-200 ${className}`} />
}

/** Page title + subtitle placeholder, optionally with a trailing action-button-shaped block. */
export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" aria-hidden="true">
      <div className="space-y-2">
        <Bone className="h-7 w-48" />
        <Bone className="h-3.5 w-72" />
      </div>
      {withAction && <Bone className="h-9 w-32 rounded-lg" />}
    </div>
  )
}

/** Row of KPI/stat-card placeholders, e.g. dashboard totals or customer summary counts. */
const STAT_GRID_COLS: Record<number, string> = {
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 gap-4 ${STAT_GRID_COLS[count] ?? 'sm:grid-cols-4'}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={panel}>
          <div className="flex items-center justify-between">
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-7 rounded-lg" />
          </div>
          <Bone className="mt-3 h-7 w-14" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder for the "table/list of items" pattern used by Services, Staff, Bookings, Customers. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={`${panel} !p-0`} aria-busy="true" aria-label="Loading">
      <div className="hidden items-center gap-4 border-b border-neutral-100 px-4 py-3 sm:flex">
        <Bone className="h-3 w-24" />
        <Bone className="ml-auto h-3 w-16" />
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-16" />
      </div>
      <ul className="animate-pulse divide-y divide-neutral-100 px-4">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 py-3.5">
            <div className="h-9 w-9 shrink-0 rounded-full bg-neutral-200" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 rounded bg-neutral-200" />
              <div className="h-3 w-1/4 rounded bg-neutral-200" />
            </div>
            <div className="hidden h-3 w-16 rounded bg-neutral-200 sm:block" />
            <div className="hidden h-5 w-20 rounded-full bg-neutral-200 sm:block" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Placeholder matching the calendar grid's panel dimensions. */
export function CalendarSkeleton() {
  return (
    <div className={`${panel} !p-2 sm:!p-3`} aria-busy="true" aria-label="Loading calendar">
      <div className="grid h-[560px] animate-pulse grid-cols-7 gap-1 sm:h-[680px] lg:h-[calc(100vh-25rem)] lg:min-h-150 2xl:h-[calc(100vh-24rem)] 2xl:min-h-180">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="rounded bg-neutral-100" />
        ))}
      </div>
    </div>
  )
}

/** Placeholder for form-heavy settings pages built from one or more panel sections. */
export function FormSkeleton({ sections = 1, fieldsPerSection = 3 }: { sections?: number; fieldsPerSection?: number }) {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className={`${panel} space-y-4`}>
          <div className="h-4 w-40 rounded bg-neutral-200" />
          {Array.from({ length: fieldsPerSection }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-neutral-200" />
              <div className="h-9 w-full rounded-lg bg-neutral-200" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null
}

/** Transient "Saved" confirmation next to a form's submit button. */
export function Saved({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
      <Check size={16} /> Saved
    </p>
  )
}
