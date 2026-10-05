import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, LockKeyhole, Sparkles } from 'lucide-react'
import { UPGRADE_HREF } from '../lib/plans'

/**
 * Shown where a Business-plan feature would be. Deliberately quiet: it explains what the
 * control does and where to get it, without nagging.
 */
export default function UpgradeNotice({ feature, planName = 'Business' }: { feature: string; planName?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white text-neutral-400 shadow-sm">
        <LockKeyhole size={13} strokeWidth={2} />
      </span>
      <p className="min-w-0 text-sm text-neutral-600">
        {feature} {feature.endsWith('s') ? 'are' : 'is'} part of the {planName} plan.{' '}
        <Link
          to={UPGRADE_HREF}
          className="font-semibold text-brand-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          View {planName} plan
        </Link>
      </p>
    </div>
  )
}

/** A small "Business" tag beside a section heading whose controls the current plan doesn't include. */
export function PlanBadge({ planName = 'Business' }: { planName?: string }) {
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
      <LockKeyhole size={10} strokeWidth={2.5} aria-hidden />
      {planName}
    </span>
  )
}

/**
 * The one banner a page shows when several of its sections are locked, instead of a prompt in
 * every section. The locked controls stay visible (read-only) underneath, so the owner can see
 * exactly what they would get.
 */
export function UpgradeBanner({
  title,
  body,
  planName = 'Business',
  action,
}: {
  title: string
  body: ReactNode
  planName?: string
  /** Optional secondary action, e.g. "Reset to defaults". */
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="hidden h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-brand-600 shadow-sm sm:flex">
        <Sparkles size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-neutral-900">{title}</p>
        <div className="mt-0.5 text-neutral-600">{body}</div>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-2">
        {action}
        <Link
          to={UPGRADE_HREF}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:h-9 sm:rounded-lg sm:px-3.5"
        >
          View {planName} plan
        </Link>
      </div>
    </div>
  )
}

/** A whole page the plan doesn't include (e.g. Reports): what it is, what it shows, and the way in. */
export function LockedFeature({
  icon,
  title,
  description,
  points,
  planName = 'Business',
  preview,
}: {
  icon: ReactNode
  title: string
  description: string
  points: string[]
  planName?: string
  /** A faded, non-interactive glimpse of the feature. */
  preview?: ReactNode
}) {
  return (
    // Preview and card share one grid cell, so the panel is as tall as whichever is taller and the
    // card is never clipped on a narrow screen.
    <section className="grid overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm shadow-neutral-900/4">
      {preview && (
        <div
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 select-none opacity-40 blur-[1.5px] mask-[linear-gradient(to_bottom,black,transparent)]"
        >
          {preview}
        </div>
      )}
      <div className="col-start-1 row-start-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-lg shadow-neutral-900/5 sm:p-6">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</span>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand-700">Available on {planName}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-900">{title}</h2>
          <p className="mt-1.5 text-sm text-neutral-600">{description}</p>
          <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left text-sm text-neutral-700">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check size={15} strokeWidth={2.5} className="mt-0.5 flex-none text-brand-600" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          <Link
            to={UPGRADE_HREF}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:w-auto"
          >
            View {planName} plan
          </Link>
        </div>
      </div>
    </section>
  )
}
