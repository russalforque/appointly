import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/**
 * Every dashboard page opens the same way: an optional back link, the title, one line of context,
 * and the page's actions. On phones the context line and desktop-only actions step aside — the
 * title says where you are, the tab bar and floating button cover what to do next.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  back,
  aside,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Shown from sm up; phones get the same action as a floating button or bottom bar. */
  actions?: ReactNode
  back?: { to: string; label: string }
  /** Small status next to the title that phones should still see (e.g. "Unsaved"). */
  aside?: ReactNode
}) {
  return (
    <header className="min-w-0">
      {back && (
        <Link
          to={back.to}
          className="-ml-2 mb-1 inline-flex h-10 items-center gap-0.5 rounded-lg pl-1 pr-2 text-sm font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-8"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 wrap-break-word sm:text-[28px]">
            {title}
          </h1>
          {subtitle && <p className="mt-1 hidden text-sm text-neutral-500 sm:block">{subtitle}</p>}
        </div>
        {aside && <div className="mt-1 shrink-0 sm:hidden">{aside}</div>}
        {actions && <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>}
      </div>
    </header>
  )
}
