import { useCallback, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { BarChart3, CalendarCheck, CalendarX2, TrendingDown, TrendingUp, UserPlus, Wallet, type LucideIcon } from 'lucide-react'
import { fetchReport, pctChange, type BusinessReport, type ReportDays } from '../../lib/reports'
import { fmtPeso } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { panel } from '../../lib/ui'
import PageHeader from '../../components/PageHeader'
import SegmentedTabs from '../../components/SegmentedTabs'
import { Bone, ErrorState, PageHeaderSkeleton } from '../../components/Status'
import { LockedFeature } from '../../components/UpgradeNotice'
import { useBusiness } from './useBusiness'

const PERIODS: { value: `${ReportDays}`; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Metric = 'bookings' | 'revenue'
type Point = { label: string; bookings: number; revenue: number }

const utc = (d: string) => new Date(`${d}T00:00:00Z`)
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(utc(d))

/** Daily points for short periods, weekly for a quarter, monthly for a year — always a readable number of points. */
function bucket(series: BusinessReport['series'], days: ReportDays): Point[] {
  if (days <= 30) return series.map((s) => ({ label: fmt(s.date, days === 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }), bookings: s.bookings, revenue: s.revenue }))
  const groups = new Map<string, Point>()
  series.forEach((s, i) => {
    const key = days === 365 ? s.date.slice(0, 7) : String(Math.floor(i / 7))
    const label = days === 365 ? fmt(s.date, { month: 'short' }) : fmt(s.date, { month: 'short', day: 'numeric' })
    const g = groups.get(key) ?? { label, bookings: 0, revenue: 0 }
    g.bookings += s.bookings
    g.revenue += s.revenue
    groups.set(key, g)
  })
  return [...groups.values()]
}

function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="text-xs text-neutral-400">New this period</span>
  if (value === 0) return <span className="text-xs text-neutral-400">No change</span>
  const good = inverse ? value < 0 : value > 0
  const Icon = value > 0 ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={13} strokeWidth={2} aria-hidden />
      {value > 0 ? '+' : ''}
      {value}%<span className="sr-only"> compared with the previous period</span>
    </span>
  )
}

function Kpi({ icon: Icon, label, value, delta, tint }: { icon: LucideIcon; label: string; value: string; delta: React.ReactNode; tint: string }) {
  return (
    <div className={`${panel} p-4! sm:p-5!`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-500 sm:text-sm">{label}</p>
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${tint}`}>
          <Icon size={16} strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">{value}</p>
      <div className="mt-1">{delta}</div>
    </div>
  )
}

function TrendChart({ points, metric }: { points: Point[]; metric: Metric }) {
  const color = metric === 'bookings' ? '#6366f1' : '#10b981'
  const has = points.some((p) => p[metric] > 0)
  if (!has)
    return (
      <div className="flex h-56 items-center justify-center rounded-xl bg-neutral-50/70 text-sm text-neutral-400 lg:h-72">
        No {metric === 'bookings' ? 'bookings' : 'revenue'} in this period yet.
      </div>
    )
  return (
    <div
      className="h-56 lg:h-72"
      role="img"
      aria-label={points.map((p) => `${p.label}: ${metric === 'bookings' ? `${p.bookings} bookings` : fmtPeso(p.revenue)}`).join(', ')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="reportFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#f1f1f4" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#a3a3a3', fontSize: 11 }} dy={8} minTickGap={16} />
          <Tooltip
            cursor={{ stroke: '#e5e5e5' }}
            formatter={(v) => (metric === 'bookings' ? [`${v} bookings`, ''] : [fmtPeso(Number(v)), ''])}
            separator=""
            contentStyle={{ borderRadius: 8, borderColor: '#e5e5e5', fontSize: 13 }}
          />
          <Area type="monotone" dataKey={metric} stroke={color} strokeWidth={2} fill="url(#reportFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** A horizontal bar list: readable on a phone where a bar chart's axis labels would not be. */
function BarList({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-neutral-800">{r.label}</span>
            <span className="flex-none tabular-nums text-neutral-600">
              {format(r.value)}
              {r.sub && <span className="ml-1.5 text-xs text-neutral-400">{r.sub}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ReportsSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5" aria-busy="true" aria-label="Loading reports">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${panel} space-y-3`}>
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className={`${panel} h-80`} />
    </div>
  )
}

/** Shown behind the upgrade card: the page's shape, with no numbers in it. */
function LockedPreview() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-neutral-200 bg-neutral-50" />
        ))}
      </div>
      <div className="flex h-64 items-end gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        {[30, 45, 38, 60, 52, 70, 64, 80, 72, 90, 84, 76].map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-brand-200" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const { business, can } = useBusiness()
  const [period, setPeriod] = useState<`${ReportDays}`>('30')
  const [metric, setMetric] = useState<Metric>('bookings')
  const days = Number(period) as ReportDays

  // Not loaded at all without the plan: the database would refuse it anyway.
  const load = useCallback(
    () => (can.analytics ? fetchReport(business.id, days) : Promise.resolve(null)),
    [business.id, days, can.analytics],
  )
  const { data, loading, error, reload } = useLoad(load)
  const points = useMemo(() => (data ? bucket(data.series, days) : []), [data, days])

  if (!can.analytics)
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader title="Reports" subtitle="How your bookings, revenue and team are trending." />
        <LockedFeature
          icon={<BarChart3 size={20} strokeWidth={1.75} />}
          title="See how your business is really doing"
          description="Reports turn your bookings into trends you can act on."
          points={[
            'Bookings and revenue over 7 days to 12 months',
            'Your top services and busiest days',
            'Staff performance, cancellations and no-shows',
            'New vs returning customers',
          ]}
          preview={<LockedPreview />}
        />
      </div>
    )

  if (loading && !data) return <ReportsSkeleton />
  if (error || !data) return <ErrorState message={error} onRetry={reload} />

  const { current: c, previous: p } = data
  const noShowRate = c.bookings ? Math.round((c.no_show / c.bookings) * 100) : 0
  const prevNoShowRate = p.bookings ? Math.round((p.no_show / p.bookings) * 100) : 0
  const busiest = [...data.weekdays].sort((a, b) => b.bookings - a.bookings)
  const range = `${fmt(data.from, { month: 'short', day: 'numeric' })} – ${fmt(data.to, { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <PageHeader title="Reports" subtitle={`How your bookings, revenue and team are trending · ${range}`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs options={PERIODS} value={period} onChange={setPeriod} label="Report period" />
        <p className="text-xs text-neutral-500 sm:hidden">{range}</p>
      </div>

      <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
        <Kpi
          icon={CalendarCheck}
          label="Bookings"
          value={String(c.bookings)}
          delta={<Delta value={pctChange(c.bookings, p.bookings)} />}
          tint="bg-indigo-50 text-indigo-600"
        />
        <Kpi
          icon={Wallet}
          label="Revenue"
          value={fmtPeso(c.revenue)}
          delta={<Delta value={pctChange(c.revenue, p.revenue)} />}
          tint="bg-emerald-50 text-emerald-600"
        />
        <Kpi
          icon={UserPlus}
          label="New customers"
          value={String(c.new_customers)}
          delta={<span className="text-xs text-neutral-500">{c.customers} customers booked</span>}
          tint="bg-blue-50 text-blue-600"
        />
        <Kpi
          icon={CalendarX2}
          label="No-show rate"
          value={`${noShowRate}%`}
          delta={
            <span className="text-xs text-neutral-500">
              {c.cancelled} cancelled ·{' '}
              {noShowRate === prevNoShowRate ? 'no change' : `${noShowRate > prevNoShowRate ? 'up' : 'down'} from ${prevNoShowRate}%`}
            </span>
          }
          tint="bg-amber-50 text-amber-600"
        />
      </div>

      <section className={`${panel} xl:p-6`} aria-labelledby="trend-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="trend-heading" className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <BarChart3 size={18} strokeWidth={1.75} className="text-neutral-400" aria-hidden />
            {metric === 'bookings' ? 'Bookings' : 'Revenue'} over time
          </h2>
          <div className="flex items-center gap-1 rounded-full bg-neutral-100 p-1" role="group" aria-label="Chart metric">
            {(['bookings', 'revenue'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`rounded-full px-3 py-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 ${
                  metric === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {m === 'bookings' ? 'Bookings' : 'Revenue'}
              </button>
            ))}
          </div>
        </div>
        <TrendChart points={points} metric={metric} />
        <p className="mt-3 text-xs text-neutral-400">Revenue counts completed bookings at the service price. Cancelled bookings are excluded.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <section className={panel} aria-labelledby="services-heading">
          <h2 id="services-heading" className="mb-4 text-base font-semibold text-neutral-900">
            Top services
          </h2>
          {data.services.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">No bookings in this period.</p>
          ) : (
            <BarList
              rows={data.services.map((s) => ({ label: s.name, value: s.bookings, sub: s.revenue ? fmtPeso(s.revenue) : undefined }))}
              format={(n) => `${n} booking${n === 1 ? '' : 's'}`}
            />
          )}
        </section>

        <section className={panel} aria-labelledby="days-heading">
          <h2 id="days-heading" className="mb-4 text-base font-semibold text-neutral-900">
            Busiest days
          </h2>
          {busiest[0]?.bookings ? (
            <BarList
              rows={[1, 2, 3, 4, 5, 6, 0].map((d) => ({
                label: WEEKDAYS[d],
                value: data.weekdays.find((w) => w.dow === d)?.bookings ?? 0,
              }))}
              format={(n) => String(n)}
            />
          ) : (
            <p className="py-6 text-center text-sm text-neutral-400">No bookings in this period.</p>
          )}
        </section>
      </div>

      <section className={`${panel} overflow-hidden p-0!`} aria-labelledby="staff-heading">
        <h2 id="staff-heading" className="px-5 pb-3 pt-5 text-base font-semibold text-neutral-900">
          Staff performance
        </h2>
        {data.staff.length === 0 ? (
          <p className="px-5 pb-6 text-center text-sm text-neutral-400">No bookings in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-120 text-left text-sm">
              <thead className="border-y border-neutral-100 bg-neutral-50/70 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Staff</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Bookings</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Completed</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">No-shows</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.staff.map((s, i) => (
                  <tr key={`${s.name}-${i}`}>
                    <th scope="row" className="px-5 py-3 font-medium text-neutral-900">{s.name}</th>
                    <td className="px-3 py-3 text-right tabular-nums">{s.bookings}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.completed}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.no_show}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtPeso(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
