import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Clock3,
  Globe2,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { fetchBookings } from '../../lib/booking'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { addDays, dayKey, fmtDay, fmtPeso, fmtTime, paddedRange, todayIn } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { btnPrimary, panel } from '../../lib/ui'
import type { BookingRow, BusinessSettings } from '../../lib/types'
import { ErrorText } from '../../components/Status'
import NotificationBell from '../../components/NotificationBell'
import { StatusBadge } from './BookingParts'
import { useBusiness } from './useBusiness'

const SERIES_DAYS = 30
/** Desktop shows more of today because the panel sits beside a short rail — mobile stays at 4. */
const TODAY_VISIBLE = 4
const TODAY_VISIBLE_WIDE = 6

/** Presentational only: lets the row count follow the breakpoint the layout already uses. */
function useMinWidth(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return matches
}

type DaySeries = { date: string; count: number; revenue: number }
/** 'Today' was dropped: one data point draws no line, and the KPI row above already covers it. */
type Period = 'week' | 'month'
type Metric = 'bookings' | 'revenue'

/** Greeting for the current hour where the business is, not where the browser is. */
function greetingIn(tz: string): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const weekdayShort = (d: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${d}T00:00:00Z`))
const monthDay = (d: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${d}T00:00:00Z`))

function seriesForPeriod(series: DaySeries[], period: Period): { label: string; count: number; revenue: number }[] {
  if (period === 'week') {
    return series.slice(-7).map((d) => ({ label: weekdayShort(d.date), count: d.count, revenue: d.revenue }))
  }
  const chunks: { label: string; count: number; revenue: number }[] = []
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7)
    chunks.push({
      label: monthDay(chunk[0].date),
      count: chunk.reduce((s, x) => s + x.count, 0),
      revenue: chunk.reduce((s, x) => s + x.revenue, 0),
    })
  }
  return chunks
}

const ACCENT: Partial<Record<BookingRow['status'], string>> = {
  pending: 'bg-amber-400',
  confirmed: 'bg-brand-500',
}

function BookingRowItem({ b, tz, detailed = false }: { b: BookingRow; tz: string; detailed?: boolean }) {
  const price = b.services?.price
  return (
    <li>
      {/* The whole row opens Bookings — a 30px "View" link hidden below sm was unreachable on a phone */}
      <Link
        to="/dashboard/bookings"
        className={`-mx-2 flex items-center gap-2 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-neutral-50 active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600 sm:gap-3 ${
          detailed ? 'xl:gap-4 xl:px-3 xl:py-3' : ''
        }`}
      >
        <span
          className={`h-9 w-1 shrink-0 rounded-full ${ACCENT[b.status] ?? 'bg-neutral-200'} ${detailed ? 'xl:h-10' : ''}`}
          aria-hidden="true"
        />
        <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-neutral-900 sm:w-16">{fmtTime(b.start_at, tz)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">{b.customers?.name}</span>
          <span className="block truncate text-xs text-neutral-500">{b.services?.name}</span>
        </span>
        {/* Wide panels have room for the columns a phone has to hide */}
        {detailed && (
          <>
            <span className="hidden min-w-0 shrink-0 basis-32 truncate text-sm text-neutral-500 2xl:block">
              {b.staff?.name ?? '—'}
            </span>
            <span className="hidden w-20 shrink-0 text-right text-sm font-medium tabular-nums text-neutral-700 2xl:block">
              {price != null ? fmtPeso(price) : '—'}
            </span>
          </>
        )}
        <span className={`flex shrink-0 items-center gap-1 sm:gap-1.5 ${detailed ? '2xl:w-28 2xl:justify-end' : ''}`}>
          <StatusBadge status={b.status} />
          <ChevronRight size={15} strokeWidth={1.75} className="text-neutral-300" aria-hidden="true" />
        </span>
      </Link>
    </li>
  )
}

function DayGroup({ label, rows, tz }: { label: string; rows: BookingRow[]; tz: string }) {
  return (
    <div>
      <p className="sticky top-0 -mx-5 bg-white px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      <ul className="divide-y divide-neutral-100">
        {rows.map((b) => (
          <BookingRowItem key={b.id} b={b} tz={tz} />
        ))}
      </ul>
    </div>
  )
}

function groupByDay(rows: BookingRow[], tz: string) {
  const today = todayIn(tz)
  const tomorrow = addDays(today, 1)
  const order: string[] = []
  const groups = new Map<string, BookingRow[]>()
  for (const b of rows) {
    const key = dayKey(b.start_at, tz)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(b)
  }
  return order.map((key) => ({
    key,
    label: key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : fmtDay(key),
    rows: groups.get(key)!,
  }))
}

function SectionCount({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">{count}</span>
}

type EmptyAction = { label: string; to: string; external?: boolean; icon?: LucideIcon }

function EmptyState({ title, body, actions }: { title: string; body: string; actions?: EmptyAction[] }) {
  return (
    <div className="flex flex-col items-center py-10 text-center lg:py-14">
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-neutral-500 sm:max-w-sm">{body}</p>
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a, i) => {
            const cls =
              i === 0
                ? 'inline-flex h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 sm:h-9'
                : 'inline-flex h-11 items-center gap-1.5 rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:h-9'
            const Icon = a.icon
            return a.external ? (
              <a key={a.label} href={a.to} target="_blank" rel="noreferrer" className={cls}>
                {Icon && <Icon size={14} strokeWidth={1.75} />}
                {a.label}
              </a>
            ) : (
              <Link key={a.label} to={a.to} className={cls}>
                {Icon && <Icon size={14} strokeWidth={1.75} />}
                {a.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Trend({ value, format }: { value: number; format?: (n: number) => string }) {
  const shown = format ? format(Math.abs(value)) : String(Math.abs(value))
  if (value === 0) return <p className="mt-1.5 text-xs text-neutral-400">Same as yesterday</p>
  const up = value > 0
  return (
    <p className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
      {up ? '+' : '-'}
      {shown} vs yesterday
    </p>
  )
}

const KPI_TINTS = {
  blue: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
} as const

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  hint,
  tint,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  trend?: ReactNode
  hint?: string
  tint: keyof typeof KPI_TINTS
}) {
  return (
    <div className={`${panel} p-4 transition-shadow sm:p-5 lg:hover:shadow-md lg:hover:shadow-neutral-900/6 xl:p-6`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500 sm:text-xs">{label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg xl:h-9 xl:w-9 ${KPI_TINTS[tint]}`}>
          <Icon size={14} strokeWidth={1.75} />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-neutral-900 sm:text-2xl xl:mt-3 xl:text-[28px]">{value}</p>
      {trend}
      {hint && !trend && <p className="mt-1.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}

const METRIC_COLOR: Record<Metric, string> = { bookings: '#6366f1', revenue: '#10b981' }

function ChartTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: { label: string; count: number; revenue: number } }[]; metric: Metric }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const shown = metric === 'bookings' ? `${point.count} booking${point.count === 1 ? '' : 's'}` : fmtPeso(point.revenue)
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="text-xs text-neutral-500">{point.label}</p>
      <p className="font-semibold tabular-nums text-neutral-900">{shown}</p>
    </div>
  )
}

function ActivityChart({ series }: { series: DaySeries[] }) {
  const [period, setPeriod] = useState<Period>('week')
  const [metric, setMetric] = useState<Metric>('bookings')

  const bars = useMemo(() => seriesForPeriod(series, period), [series, period])
  const values = bars.map((b) => (metric === 'bookings' ? b.count : b.revenue))
  const hasActivity = values.some((v) => v > 0)
  const color = METRIC_COLOR[metric]

  return (
    <section className={`${panel} xl:p-6`}>
      {/* On wide panels the title and both toggles sit on one line instead of stacking */}
      <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 sm:text-[18px]">
            <BarChart3 size={18} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
            Bookings &amp; revenue
          </h2>
          <p className="mt-1 hidden text-sm text-neutral-500 lg:block">How your bookings and earnings have moved recently.</p>
        </div>

        {/* Both toggles share one scrollable row with thumb-sized targets, instead of two rows of 12px chips */}
        <div className="no-scrollbar -mx-5 mb-4 mt-3 flex items-center gap-2 overflow-x-auto px-5 lg:mx-0 lg:mb-0 lg:mt-0 lg:flex-none lg:gap-3 lg:overflow-visible lg:px-0">
          <div className="flex flex-none items-center gap-1 rounded-full bg-neutral-100 p-1">
            {(['bookings', 'revenue'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`flex flex-none items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 ${
                  metric === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${m === 'bookings' ? 'bg-brand-500' : 'bg-emerald-500'}`} />
                {m === 'bookings' ? 'Bookings' : 'Revenue'}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-none items-center gap-1 rounded-full bg-neutral-100 p-1">
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`flex-none whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 ${
                  period === p ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {p === 'week' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasActivity ? (
        <div className="flex h-48 items-center justify-center rounded-xl bg-neutral-50/70 text-sm text-neutral-400 sm:h-56 lg:mt-5 lg:h-64 xl:h-72 2xl:h-80">
          No activity in this period yet.
        </div>
      ) : (
        <div
          className="h-48 sm:h-56 lg:mt-5 lg:h-64 xl:h-72 2xl:h-80"
          role="img"
          aria-label={bars.map((b) => `${b.label}: ${metric === 'bookings' ? `${b.count} booking${b.count === 1 ? '' : 's'}` : `$${b.revenue.toFixed(2)}`}`).join(', ')}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bars} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f1f1f4" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#a3a3a3', fontSize: 11 }}
                dy={8}
              />
              <Tooltip cursor={{ stroke: '#e5e5e5', strokeWidth: 1 }} content={<ChartTooltip metric={metric} />} />
              <Area
                type="monotone"
                dataKey={metric === 'bookings' ? 'count' : 'revenue'}
                stroke={color}
                strokeWidth={2}
                fill="url(#activityFill)"
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl animate-pulse space-y-8 xl:max-w-360 2xl:max-w-400"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="space-y-2">
        <div className="h-3.5 w-32 rounded bg-neutral-200" />
        <div className="h-7 w-64 rounded bg-neutral-200" />
        <div className="h-3.5 w-80 rounded bg-neutral-200" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={panel}>
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-neutral-200" />
              <div className="h-7 w-7 rounded-lg bg-neutral-200" />
            </div>
            <div className="mt-3 h-7 w-14 rounded bg-neutral-200" />
          </div>
        ))}
      </div>
      {/* Mirrors the loaded layout: schedule + rail, then a full-width chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <div className={`${panel} h-72 xl:col-span-2`} />
        <div className={`${panel} h-72`} />
        <div className={`${panel} h-72 lg:col-span-2 xl:col-span-3 xl:h-96`} />
      </div>
    </div>
  )
}

export default function DashboardHome() {
  const { business, timezone } = useBusiness()
  const siteUrl = `${window.location.origin}/book/${business.slug}`
  const wide = useMinWidth('(min-width: 1280px)')
  const todayVisible = wide ? TODAY_VISIBLE_WIDE : TODAY_VISIBLE

  const load = useCallback(async () => {
    const today = todayIn(timezone)
    const yesterday = addDays(today, -1)
    const seriesStart = addDays(today, -(SERIES_DAYS - 1))
    const r = paddedRange(today, addDays(today, 1))
    const week = paddedRange(today, addDays(today, 8))
    const seriesRange = paddedRange(seriesStart, addDays(today, 1))
    const [day, yesterdayRaw, pending, week7, seriesRaw, services, staff, settings] = await Promise.all([
      fetchBookings(business.id, r),
      fetchBookings(business.id, paddedRange(yesterday, today)),
      fetchBookings(business.id, { status: 'pending', from: new Date().toISOString(), limit: 20 }),
      fetchBookings(business.id, { from: week.from, to: week.to, limit: 40 }),
      fetchBookings(business.id, { from: seriesRange.from, to: seriesRange.to, limit: 500 }),
      unwrap<{ id: string }[]>(supabase.from('services').select('id').eq('business_id', business.id).eq('is_active', true)),
      unwrap<{ id: string }[]>(supabase.from('staff').select('id').eq('business_id', business.id).eq('is_active', true)),
      unwrap<Pick<BusinessSettings, 'working_hours'>>(
        supabase.from('business_settings').select('working_hours').eq('business_id', business.id).single(),
      ),
    ])
    const todays = day.filter((b) => dayKey(b.start_at, timezone) === today && b.status !== 'cancelled')
    const yesterdays = yesterdayRaw.filter((b) => dayKey(b.start_at, timezone) === yesterday && b.status !== 'cancelled')
    const upcoming = week7
      .filter((b) => dayKey(b.start_at, timezone) !== today && b.status !== 'cancelled' && b.status !== 'completed')
      .slice(0, 5)
    const revenueOf = (rows: BookingRow[]) =>
      rows.filter((b) => b.status === 'completed').reduce((sum, b) => sum + (b.services?.price ?? 0), 0)

    const days: string[] = []
    for (let i = 0; i < SERIES_DAYS; i++) days.push(addDays(seriesStart, i))
    const series: DaySeries[] = days.map((d) => {
      const rows = seriesRaw.filter((b) => dayKey(b.start_at, timezone) === d && b.status !== 'cancelled')
      return { date: d, count: rows.length, revenue: revenueOf(rows) }
    })

    const hoursSet = Object.values(settings.working_hours ?? {}).some((slots) => slots.length > 0)
    return {
      today: todays,
      pending,
      upcoming,
      completedToday: todays.filter((b) => b.status === 'completed').length,
      completedYesterday: yesterdays.filter((b) => b.status === 'completed').length,
      bookingsDelta: todays.length - yesterdays.length,
      revenueToday: revenueOf(todays),
      revenueYesterday: revenueOf(yesterdays),
      series,
      servicesCount: services.length,
      staffCount: staff.length,
      hoursSet,
    }
  }, [business.id, timezone])
  const { data, loading, error } = useLoad(load)

  if (loading) return <DashboardSkeleton />
  if (error || !data) return <ErrorText message={error} />

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  const setupItems = [
    { done: Boolean(business.description && business.phone), label: 'Complete your business profile', to: '/dashboard/profile' },
    { done: data.hoursSet, label: 'Set your business hours', to: '/dashboard/hours' },
    { done: data.servicesCount > 0, label: 'Add at least one service', to: '/dashboard/services' },
    { done: data.staffCount > 0, label: 'Add at least one staff member', to: '/dashboard/staff' },
  ]
  const setupDone = setupItems.filter((i) => i.done).length
  const setupPct = Math.round((setupDone / setupItems.length) * 100)

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:space-y-8 sm:pb-0 xl:max-w-360 2xl:max-w-400">
      <div className="flex flex-wrap items-start justify-between gap-4 lg:items-center lg:border-b lg:border-neutral-200/80 lg:pb-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500 sm:text-[13px]">{dateLabel}</p>
          <h1 className="mt-1 text-xl font-semibold leading-snug tracking-tight text-neutral-900 sm:text-2xl sm:leading-normal lg:text-[28px] xl:text-3xl">
            {greetingIn(timezone)}, {business.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Here's what's happening with your bookings today.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:gap-3">
          <div className="hidden sm:block">
            <NotificationBell businessId={business.id} timezone={timezone} />
          </div>
          {/* Desktop has room for the secondary action the phone header cannot fit */}
          <a
            href={siteUrl}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 lg:inline-flex"
          >
            <Globe2 size={16} strokeWidth={1.75} />
            Booking page
          </a>
          <div className="hidden sm:block">
            <a href={siteUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
              <Plus size={16} strokeWidth={1.75} />
              Add booking
            </a>
          </div>
        </div>
      </div>

      {/* Mobile floating action button */}
      <a
        href={siteUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Add booking"
        className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:hidden"
      >
        <Plus size={24} strokeWidth={2} />
      </a>

      {/* Setup comes first while it is unfinished: an empty dashboard's KPIs are all zero, and
          nothing else on this page works until these four things exist. */}
      {setupDone < setupItems.length && (
        <section className="rounded-2xl border border-brand-200/70 bg-brand-50/50 p-4 shadow-sm shadow-neutral-900/[0.04] sm:p-5 xl:p-6">
          <div className="flex items-center justify-between gap-3 lg:gap-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 lg:text-base">Finish setting up</p>
              <p className="mt-0.5 text-xs text-neutral-600 lg:text-sm">
                {setupDone} of {setupItems.length} done — customers can't book until these are in place.
              </p>
            </div>
            {/* The bar moves up beside the heading on desktop rather than eating a full row */}
            <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${setupPct}%` }} />
              </div>
            </div>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white text-sm font-bold tabular-nums text-brand-700 shadow-sm">
              {setupPct}%
            </span>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/80 lg:hidden">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${setupPct}%` }} />
          </div>

          {/* Every step is its own tap target, so the next action is never more than one tap away */}
          <ul className="mt-3 space-y-1 lg:mt-4 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 2xl:grid-cols-4">
            {setupItems.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className={`flex items-center gap-2.5 rounded-xl px-2 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 lg:h-full lg:border lg:border-white/80 lg:bg-white/60 lg:px-3 lg:py-3 ${
                    item.done ? 'text-neutral-500' : 'font-medium text-neutral-900 hover:bg-white/70 active:bg-white lg:hover:bg-white'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-full ${
                      item.done ? 'bg-brand-600 text-white' : 'border border-neutral-300 bg-white'
                    }`}
                  >
                    {item.done && <CircleCheck size={13} strokeWidth={3} />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${item.done ? 'line-through' : ''}`}>{item.label}</span>
                  {!item.done && <ChevronRight size={15} strokeWidth={1.75} className="flex-none text-neutral-400" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Key statistics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:gap-5">
        <KpiCard
          icon={CalendarCheck}
          label="Today's bookings"
          value={data.today.length}
          trend={<Trend value={data.bookingsDelta} />}
          tint="blue"
        />
        <KpiCard
          icon={Clock3}
          label="Awaiting confirmation"
          value={data.pending.length}
          hint={data.pending.length > 0 ? 'Needs your review' : 'All caught up'}
          tint="amber"
        />
        <KpiCard
          icon={CircleCheck}
          label="Completed today"
          value={data.completedToday}
          trend={<Trend value={data.completedToday - data.completedYesterday} />}
          tint="emerald"
        />
        <KpiCard
          icon={Wallet}
          label="Revenue today"
          value={fmtPeso(data.revenueToday)}
          trend={<Trend value={data.revenueToday - data.revenueYesterday} format={fmtPeso} />}
          tint="violet"
        />
      </div>

      {/* Today's schedule & upcoming bookings */}
      {/* One grid holds all three panels so wide screens can rearrange them without reordering the DOM */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start xl:grid-cols-3 xl:gap-6">
        <section className={`${panel} xl:col-span-2 xl:p-6`}>
          <div className="mb-1 flex items-center justify-between xl:mb-2">
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-neutral-900">
              <CalendarCheck size={18} strokeWidth={1.75} className="text-neutral-400" />
              Today's schedule
              <SectionCount count={data.today.length} />
            </h2>
            <Link
              to="/dashboard/calendar"
              className="-mr-2 flex h-11 flex-none items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
            >
              Calendar
              <ChevronRight size={15} strokeWidth={1.75} />
            </Link>
          </div>
          {data.today.length === 0 ? (
            <EmptyState
              title="No appointments today"
              body="Your schedule is clear for today."
              actions={[
                { label: 'Create booking', to: siteUrl, external: true, icon: Plus },
                { label: 'View calendar', to: '/dashboard/calendar' },
              ]}
            />
          ) : (
            <>
              {/* Column captions only appear once the extra columns do */}
              <div className="hidden items-center gap-4 border-b border-neutral-100 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 2xl:flex">
                <span className="w-1 shrink-0" aria-hidden="true" />
                <span className="w-16 shrink-0">Time</span>
                <span className="min-w-0 flex-1">Customer &amp; service</span>
                <span className="shrink-0 basis-32">Staff</span>
                <span className="w-20 shrink-0 text-right">Price</span>
                <span className="w-28 shrink-0 text-right">Status</span>
              </div>
              <ul className="divide-y divide-neutral-100">
                {data.today.slice(0, todayVisible).map((b) => (
                  <BookingRowItem key={b.id} b={b} tz={timezone} detailed />
                ))}
              </ul>
              {data.today.length > todayVisible && (
                <Link
                  to="/dashboard/calendar"
                  className="mt-2 flex h-11 items-center justify-center rounded-xl bg-neutral-50 text-sm font-medium text-neutral-600 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 xl:mt-3"
                >
                  +{data.today.length - todayVisible} more today
                </Link>
              )}
            </>
          )}
        </section>

        <section className={`${panel} xl:self-start`}>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[18px] font-semibold text-neutral-900">
              <CalendarClock size={18} strokeWidth={1.75} className="text-neutral-400" />
              Upcoming bookings
              <SectionCount count={data.upcoming.length} />
            </h2>
            <Link
              to="/dashboard/bookings"
              className="-mr-2 flex h-11 flex-none items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
            >
              All
              <ChevronRight size={15} strokeWidth={1.75} />
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming bookings"
              body="Once customers start booking, you'll see appointments here."
              actions={[{ label: 'View booking page', to: siteUrl, external: true, icon: Globe2 }]}
            />
          ) : (
            <div className="space-y-1">
              {groupByDay(data.upcoming, timezone).map((group) => (
                <DayGroup key={group.key} label={group.label} rows={group.rows} tz={timezone} />
              ))}
            </div>
          )}
        </section>

        {/* Bookings & revenue overview — trends matter less than today's work, so they sit below it */}
        <div className="lg:col-span-2 xl:col-span-3">
          <ActivityChart series={data.series} />
        </div>
      </div>
    </div>
  )
}
