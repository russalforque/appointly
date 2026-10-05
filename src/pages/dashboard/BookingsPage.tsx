import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Plus,
  SlidersHorizontal,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { bookingRef, fetchBookings } from '../../lib/booking'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { dayKey, fmtDateTime, initials, relativeDay, todayIn } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { actionPrimary, actionSecondary, input, panel } from '../../lib/ui'
import type { BookingRow, BookingStatus, Service, Staff } from '../../lib/types'
import { EmptyState, ErrorState, ListSkeleton, StatGridSkeleton } from '../../components/Status'
import Select from '../../components/Select'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import SearchField from '../../components/SearchField'
import SegmentedTabs from '../../components/SegmentedTabs'
import Fab from '../../components/Fab'
import { BookingDetailsSheet, BookingListItem, StatusBadge } from './BookingParts'
import { STATUS_ORDER } from './calendarModel'
import { useBusiness } from './useBusiness'

type DateFilter = 'all' | 'today' | 'upcoming' | 'past'

const DATE_LABELS: Record<DateFilter, string> = {
  all: 'All dates',
  today: 'Today',
  upcoming: 'Upcoming',
  past: 'Past',
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 pr-1 text-xs font-medium text-neutral-700">
      <span className="truncate">{label}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-neutral-400 outline-none transition-colors hover:bg-neutral-200 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </span>
  )
}

function matches(b: BookingRow, q: string) {
  const haystack = `${b.customers?.name ?? ''} ${b.customers?.email ?? ''} ${b.customers?.phone ?? ''} ${bookingRef(b.public_token)}`
  return haystack.toLowerCase().includes(q.toLowerCase())
}

function Stat({
  label,
  value,
  icon: Icon,
  tint,
  iconColor,
}: {
  label: string
  value: number
  icon: LucideIcon
  tint: string
  iconColor: string
}) {
  return (
    <div className={`${panel} !p-4 lg:!p-5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xl font-bold leading-none text-neutral-900 lg:text-[28px]">{value}</p>
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full lg:h-10 lg:w-10 ${tint}`}>
          <Icon size={16} strokeWidth={2} className={iconColor} />
        </span>
      </div>
      <p className="mt-2 text-xs font-medium text-neutral-500 lg:mt-3 lg:text-[13px]">{label}</p>
    </div>
  )
}

const STATUS_LABELS: Record<BookingStatus | '', string> = {
  '': 'All',
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const isStatus = (v: string | null): v is BookingStatus => STATUS_ORDER.includes(v as BookingStatus)

/** Rows are newest-first; keep that order and break it into one group per day. */
function groupByDay(rows: BookingRow[], tz: string) {
  const groups: { key: string; rows: BookingRow[] }[] = []
  for (const b of rows) {
    const key = dayKey(b.start_at, tz)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.rows.push(b)
    else groups.push({ key, rows: [b] })
  }
  return groups
}

/** Date, staff and service filters — inline on wide screens, in this sheet on phones. */
function FilterFields({
  dateFilter,
  setDateFilter,
  staffId,
  setStaffId,
  serviceId,
  setServiceId,
  staff,
  services,
  stacked,
}: {
  dateFilter: DateFilter
  setDateFilter: (v: DateFilter) => void
  staffId: string
  setStaffId: (v: string) => void
  serviceId: string
  setServiceId: (v: string) => void
  staff: Staff[]
  services: Service[]
  stacked: boolean
}) {
  const select = stacked
    ? `${input} !h-12 !rounded-xl !border-neutral-300`
    : `${input} !h-9 !w-36 !rounded-lg !border-neutral-300`
  return (
    <div className={stacked ? 'space-y-5' : 'flex flex-wrap items-center gap-2.5'}>
      {stacked ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-700">Date</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(DATE_LABELS) as DateFilter[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dateFilter === d}
                onClick={() => setDateFilter(d)}
                className={`h-11 rounded-xl border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  dateFilter === d ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-700 active:bg-neutral-50'
                }`}
              >
                {DATE_LABELS[d]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-neutral-300 pl-2.5">
          <Filter size={14} strokeWidth={1.75} className="flex-none text-neutral-400" />
          <Select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="h-9 w-28 border-none bg-transparent pl-1 text-sm text-neutral-700 outline-none"
            aria-label="Filter by date"
          >
            {(Object.keys(DATE_LABELS) as DateFilter[]).map((d) => (
              <option key={d} value={d}>
                {DATE_LABELS[d]}
              </option>
            ))}
          </Select>
        </div>
      )}
      <label className={stacked ? 'block' : ''}>
        {stacked && <span className="mb-2 block text-sm font-medium text-neutral-700">Staff</span>}
        <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={select} aria-label="Filter by staff">
          <option value="">All staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      <label className={stacked ? 'block' : ''}>
        {stacked && <span className="mb-2 block text-sm font-medium text-neutral-700">Service</span>}
        <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={select} aria-label="Filter by service">
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}

export default function BookingsPage() {
  const { business, timezone } = useBusiness()
  // ?status=pending lets other pages link straight to the bookings that need a decision.
  const [params] = useSearchParams()
  const [status, setStatus] = useState<BookingStatus | ''>(() => {
    const s = params.get('status')
    return isStatus(s) ? s : ''
  })
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [staffId, setStaffId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<BookingRow | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(async () => {
    const [bookings, staff, services] = await Promise.all([
      fetchBookings(business.id, { limit: 300, descending: true }),
      unwrap<Staff[]>(supabase.from('staff').select('*').eq('business_id', business.id).order('name')),
      unwrap<Service[]>(supabase.from('services').select('*').eq('business_id', business.id).order('name')),
    ])
    return { bookings, staff, services }
  }, [business.id])
  const { data, loading, error, reload } = useLoad(load)

  const bookingUrl = `${window.location.origin}/book/${business.slug}`
  const today = todayIn(timezone)
  const now = new Date()

  const rows = useMemo(() => {
    let list = data?.bookings ?? []
    if (status) list = list.filter((b) => b.status === status)
    if (staffId) list = list.filter((b) => b.staff_id === staffId)
    if (serviceId) list = list.filter((b) => b.service_id === serviceId)
    if (dateFilter === 'today') list = list.filter((b) => dayKey(b.start_at, timezone) === today)
    else if (dateFilter === 'upcoming') list = list.filter((b) => new Date(b.start_at) >= now)
    else if (dateFilter === 'past') list = list.filter((b) => new Date(b.start_at) < now)
    if (q.trim()) list = list.filter((b) => matches(b, q.trim()))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, status, staffId, serviceId, dateFilter, q, timezone, today])

  const summary = useMemo(() => {
    const all = data?.bookings ?? []
    const byStatus = new Map<BookingStatus, number>()
    for (const b of all) byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1)
    return {
      total: all.length,
      today: all.filter((b) => dayKey(b.start_at, timezone) === today).length,
      byStatus,
    }
  }, [data, timezone, today])

  const advancedCount = (dateFilter !== 'all' ? 1 : 0) + (staffId ? 1 : 0) + (serviceId ? 1 : 0)

  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = []
    if (dateFilter !== 'all') out.push({ key: 'date', label: DATE_LABELS[dateFilter], clear: () => setDateFilter('all') })
    const staffName = data?.staff.find((s) => s.id === staffId)?.name
    if (staffName) out.push({ key: 'staff', label: staffName, clear: () => setStaffId('') })
    const serviceName = data?.services.find((s) => s.id === serviceId)?.name
    if (serviceName) out.push({ key: 'service', label: serviceName, clear: () => setServiceId('') })
    return out
  }, [dateFilter, staffId, serviceId, data])

  const hasFilters = Boolean(status || staffId || serviceId || q.trim() || dateFilter !== 'all')
  function clearFilters() {
    setStatus('')
    setStaffId('')
    setServiceId('')
    setQ('')
    setDateFilter('all')
  }

  function handleChanged() {
    reload()
    setActive(null)
  }

  const tabs = (['', ...STATUS_ORDER] as (BookingStatus | '')[]).map((value) => ({
    value,
    label: STATUS_LABELS[value],
    count: value ? (summary.byStatus.get(value) ?? 0) : summary.total,
  }))

  const filterProps = {
    dateFilter,
    setDateFilter,
    staffId,
    setStaffId,
    serviceId,
    setServiceId,
    staff: data?.staff ?? [],
    services: data?.services ?? [],
  }

  if (error && !data) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-6 xl:max-w-7xl xl:space-y-7 2xl:max-w-[1680px]">
      <PageHeader
        title="Bookings"
        subtitle="Manage and track your customer appointments."
        actions={
          <>
            <Link to="/dashboard/calendar" className={actionSecondary}>
              <CalendarDays size={16} strokeWidth={1.75} /> View calendar
            </Link>
            <a href={bookingUrl} target="_blank" rel="noreferrer" className={actionPrimary}>
              <Plus size={16} strokeWidth={2} /> Add booking
            </a>
          </>
        }
      />

      {/* Summary — phones read these counts off the status tabs instead of five stacked cards */}
      {loading ? (
        <div className="hidden sm:block">
          <StatGridSkeleton count={5} />
        </div>
      ) : (
        data && (
          <div className="hidden gap-3 sm:grid sm:grid-cols-5 xl:gap-4">
            <Stat label="Total Bookings" value={summary.total} icon={BarChart3} tint="bg-indigo-50" iconColor="text-indigo-600" />
            <Stat label="Today" value={summary.today} icon={CalendarDays} tint="bg-violet-50" iconColor="text-violet-600" />
            <Stat label="Pending" value={summary.byStatus.get('pending') ?? 0} icon={Clock} tint="bg-amber-50" iconColor="text-amber-600" />
            <Stat
              label="Confirmed"
              value={summary.byStatus.get('confirmed') ?? 0}
              icon={CheckCircle2}
              tint="bg-blue-50"
              iconColor="text-blue-600"
            />
            <Stat
              label="Completed"
              value={summary.byStatus.get('completed') ?? 0}
              icon={CheckCheck}
              tint="bg-green-50"
              iconColor="text-green-600"
            />
          </div>
        )
      )}

      {/* Toolbar. Phones: search + Filters button, then status tabs. Tablets: filters inline
          under the tabs. Desktop: tabs and search share a row, filters on the next. */}
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-2 lg:hidden">
          <SearchField value={q} onChange={setQ} placeholder="Search bookings" label="Search bookings" className="flex-1" />
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            aria-haspopup="dialog"
            className={`relative flex h-11 flex-none items-center gap-1.5 rounded-xl border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:hidden ${
              advancedCount > 0 ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-700 active:bg-neutral-50'
            }`}
          >
            <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
            Filters
            {advancedCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
                {advancedCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-4">
          <SegmentedTabs options={tabs} value={status} onChange={setStatus} label="Filter by status" className="min-w-0" />
          <SearchField value={q} onChange={setQ} placeholder="Search bookings" label="Search bookings" className="hidden w-72 flex-none lg:block" />
        </div>
        <div className="hidden sm:block">
          <FilterFields {...filterProps} stacked={false} />
        </div>
      </div>

      {/* Active filters + result count */}
      {!loading && data && (chips.length > 0 || hasFilters) && (
        <div className="-mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs font-medium text-neutral-500" aria-live="polite">
            {rows.length} of {data.bookings.length} bookings
          </p>
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />
          ))}
          <button
            onClick={clearFilters}
            className="-mx-1.5 min-h-8 rounded-md px-1.5 text-xs font-medium text-brand-600 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            Clear all
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <ListSkeleton />
      ) : (data?.bookings.length ?? 0) === 0 ? (
        <div className={`${panel} !p-0`}>
          <EmptyState
            icon={CalendarDays}
            title="No bookings yet"
            body="Share your booking page and appointments will appear here as customers book."
            action={
              <a href={bookingUrl} target="_blank" rel="noreferrer" className={actionPrimary}>
                <Plus size={16} strokeWidth={2} /> Add booking
              </a>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className={`${panel} !p-0`}>
          <EmptyState
            icon={Filter}
            title="No bookings match"
            body="Try a different search, or clear the filters to see everything."
            action={
              <button onClick={clearFilters} className={actionSecondary}>
                <X size={16} strokeWidth={2} /> Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table (lg+; tablets keep the list so nothing gets squashed). Fixed layout:
              the text columns share what's left and truncate, instead of forcing a sideways scroll
              on a 1024px laptop with the sidebar open. */}
          <div className={`${panel} hidden overflow-hidden !p-0 lg:block`}>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50/70 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="w-40 whitespace-nowrap px-4 py-3 font-medium xl:w-44 xl:px-5">Date &amp; Time</th>
                    <th className="px-4 py-3 font-medium xl:px-5">Customer</th>
                    <th className="px-4 py-3 font-medium xl:px-5">Service</th>
                    <th className="px-4 py-3 font-medium xl:px-5">Staff</th>
                    <th className="w-30 px-4 py-3 font-medium xl:w-32 xl:px-5">Status</th>
                    <th className="hidden w-40 whitespace-nowrap px-4 py-3 font-medium xl:table-cell xl:px-5">Created</th>
                    <th className="w-16 px-4 py-3 font-medium xl:px-5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((b) => (
                    <tr key={b.id} className="group transition-colors hover:bg-neutral-50/80">
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-medium text-neutral-900 xl:px-5">
                        {fmtDateTime(b.start_at, timezone)}
                      </td>
                      <td className="px-4 py-3 align-middle xl:px-5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="hidden h-8 w-8 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600 xl:flex">
                            {b.customers?.name ? initials(b.customers.name) : <User size={14} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-neutral-900">{b.customers?.name}</span>
                            <span className="block truncate text-[12px] leading-tight text-neutral-500">
                              {b.customers?.email ?? b.customers?.phone}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="truncate px-4 py-3 align-middle text-neutral-700 xl:px-5" title={b.services?.name}>
                        {b.services?.name}
                      </td>
                      <td className="px-4 py-3 align-middle text-neutral-700 xl:px-5">
                        {b.staff ? (
                          <>
                            <span className="block truncate">{b.staff.name}</span>
                            {b.staff.position && (
                              <span className="block truncate text-[12px] leading-tight text-neutral-500">{b.staff.position}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle xl:px-5">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 align-middle text-[12px] text-neutral-500 xl:table-cell xl:px-5">
                        {fmtDateTime(b.created_at, timezone)}
                      </td>
                      <td className="px-4 py-3 text-right align-middle xl:px-5">
                        <button
                          onClick={() => setActive(b)}
                          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-neutral-400 outline-none transition-colors hover:border-neutral-200 hover:bg-white hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 group-hover:text-neutral-600"
                          aria-label={`View booking ${bookingRef(b.public_token)}`}
                          title="View booking"
                        >
                          <Eye size={16} strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phones + tablets: one list, broken up by day, each row a single tap to open */}
          <div className={`${panel} overflow-hidden !p-0 lg:hidden`}>
            {groupByDay(rows, timezone).map((g, i) => (
              <section key={g.key} aria-label={relativeDay(g.key, today)} className={i > 0 ? 'border-t border-neutral-100' : ''}>
                <h2 className="flex items-baseline justify-between bg-neutral-50/80 px-4 py-2 text-xs font-semibold text-neutral-500">
                  <span className={g.key === today ? 'text-brand-700' : ''}>{relativeDay(g.key, today)}</span>
                  <span className="font-normal text-neutral-400">{g.rows.length}</span>
                </h2>
                <ul className="divide-y divide-neutral-100">
                  {g.rows.map((b) => (
                    <BookingListItem key={b.id} booking={b} timezone={timezone} onSelect={setActive} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {showFilters && (
        <Modal
          onClose={() => setShowFilters(false)}
          title="Filter bookings"
          titleId="booking-filters-title"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDateFilter('all')
                  setStaffId('')
                  setServiceId('')
                }}
                disabled={advancedCount === 0}
                className={`${actionSecondary} flex-none`}
              >
                Reset
              </button>
              <button type="button" onClick={() => setShowFilters(false)} className={`${actionPrimary} flex-1`}>
                Show {rows.length} booking{rows.length === 1 ? '' : 's'}
              </button>
            </div>
          }
        >
          <FilterFields {...filterProps} stacked />
        </Modal>
      )}

      {active && (
        <BookingDetailsSheet booking={active} timezone={timezone} onClose={() => setActive(null)} onChanged={handleChanged} />
      )}

      <Fab label="Add booking" href={bookingUrl} />
      {/* Keeps the last row clear of the floating button */}
      <div aria-hidden className="h-16 sm:hidden" />
    </div>
  )
}
