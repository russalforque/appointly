import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, RefreshCw, SearchX, WifiOff, type LucideIcon } from 'lucide-react'
import { actionSecondary, panel } from '../lib/ui'

/** Whole-screen wait (route chunks, public pages). Pages with a known shape use skeletons instead. */
export function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center" role="status" aria-label="Loading">
      <Loader2 size={24} className="animate-spin text-neutral-300" aria-hidden />
    </div>
  )
}

/**
 * The one empty-state pattern: a quiet icon, what is missing, why it matters, and the single
 * next step. Sits inside whatever surface the list would have filled.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className = '',
}: {
  icon: LucideIcon
  title: string
  body?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center sm:py-16 ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
        <Icon size={22} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-neutral-900">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm leading-relaxed text-neutral-500">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  )
}

/** A page whose data failed to load: says so plainly and offers the retry, instead of a dead end. */
export function ErrorState({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  return (
    <div className={`${panel} mx-auto max-w-md`}>
      <EmptyState
        icon={WifiOff}
        title="Couldn't load this page"
        body={message ?? 'Something went wrong. Check your connection and try again.'}
        action={
          onRetry && (
            <button type="button" onClick={onRetry} className={actionSecondary}>
              <RefreshCw size={15} strokeWidth={2} aria-hidden /> Try again
            </button>
          )
        }
      />
    </div>
  )
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

/** Full-page dead end for public links (unknown booking page, expired booking link), with a way out. */
export function NotFoundPage({ title, body }: { title: string; body: string }) {
  return (
    <main className="font-site grid min-h-dvh place-items-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-slate-400 shadow-sm">
          <SearchX size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10"
        >
          Go to Appointly
        </Link>
      </div>
    </main>
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
