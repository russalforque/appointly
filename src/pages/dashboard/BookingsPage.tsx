import { useCallback, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { fetchBookings } from '../../lib/booking'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { fmtDateTime, fmtTime, initials, todayIn, dayKey } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { btnPrimary, input, panel } from '../../lib/ui'
import type { BookingRow, BookingStatus, Service, Staff } from '../../lib/types'
import { ErrorText, ListSkeleton, StatGridSkeleton } from '../../components/Status'
import Select from '../../components/Select'
import Modal from '../../components/Modal'
import { BookingActions, StatusBadge } from './BookingParts'
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
        className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-neutral-400 outline-none transition-colors hover:bg-neutral-200 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </span>
  )
}

function reference(token: string) {
  return `#${token.slice(0, 8).toUpperCase()}`
}

function matches(b: BookingRow, q: string) {
  const haystack = `${b.customers?.name ?? ''} ${b.customers?.email ?? ''} ${b.customers?.phone ?? ''} ${reference(b.public_token)}`
  return haystack.toLowerCase().includes(q.toLowerCase())
}

function BookingDetails({
  booking,
  timezone,
  onClose,
  onChanged,
}: {
  booking: BookingRow
  timezone: string
  onClose: () => void
  onChanged: () => void
}) {
  const rows: [string, string | null][] = [
    ['Reference', reference(booking.public_token)],
    ['Customer', booking.customers?.name ?? '—'],
    ['Phone', booking.customers?.phone ?? null],
    ['Email', booking.customers?.email ?? null],
    ['Service', booking.services?.name ?? '—'],
    ['Staff', booking.staff ? [booking.staff.name, booking.staff.position].filter(Boolean).join(' · ') : 'Any available'],
    ['Date', fmtDateTime(booking.start_at, timezone).split(',')[0]],
    ['Start time', fmtTime(booking.start_at, timezone)],
    ['End time', fmtTime(booking.end_at, timezone)],
    ['Created', fmtDateTime(booking.created_at, timezone)],
  ]

  return (
    <Modal onClose={onClose} title="Booking details" titleId="booking-details-title" maxWidth="max-w-md sm:max-w-xl">
      <div className="mb-3">
        <StatusBadge status={booking.status} />
      </div>

      <dl className="space-y-2.5 text-sm sm:grid sm:grid-cols-2 sm:gap-x-10 sm:gap-y-3 sm:space-y-0">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <dt className="flex-none text-neutral-500">{label}</dt>
              <dd className="min-w-0 truncate text-right font-medium text-neutral-900">{value}</dd>
            </div>
          ))}
        {booking.notes && (
          <div className="sm:col-span-2">
            <dt className="text-neutral-500">Notes</dt>
            <dd className="mt-1 rounded-lg bg-neutral-50 p-2.5 text-neutral-700">{booking.notes}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4 sm:mt-6 sm:justify-end">
        <BookingActions booking={booking} onChanged={onChanged} />
      </div>
    </Modal>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
  tint,
  iconColor,
  className = '',
}: {
  label: string
  value: number
  icon: LucideIcon
  tint: string
  iconColor: string
  className?: string
}) {
  return (
    <div className={`${panel} !p-4 lg:!p-5 ${className}`}>
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

const STATUS_TABS: { value: BookingStatus | ''; label: string }[] = [
  { value: '', label: 'All Bookings' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No-show' },
]

export default function BookingsPage() {
  const { business, timezone } = useBusiness()
  const [status, setStatus] = useState<BookingStatus | ''>('')
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
    return {
      total: all.length,
      today: all.filter((b) => dayKey(b.start_at, timezone) === today).length,
      pending: all.filter((b) => b.status === 'pending').length,
      confirmed: all.filter((b) => b.status === 'confirmed').length,
      completed: all.filter((b) => b.status === 'completed').length,
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
    if (q.trim()) out.push({ key: 'q', label: `“${q.trim()}”`, clear: () => setQ('') })
    return out
  }, [dateFilter, staffId, serviceId, q, data])

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-24 sm:space-y-6 sm:pb-0 xl:max-w-7xl xl:space-y-7 2xl:max-w-[1680px]">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Bookings</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage and track your customer appointments.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/calendar"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:w-auto sm:justify-start sm:py-2"
          >
            <CalendarDays size={16} strokeWidth={1.75} />
            View calendar
          </a>
          <div className="hidden sm:block">
            <a href={bookingUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
              <Plus size={16} strokeWidth={1.75} />
              Add booking
            </a>
          </div>
        </div>
      </div>

      {/* Summary */}
      {loading ? (
        <StatGridSkeleton count={5} />
      ) : (
        data && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3 xl:gap-4">
            <Stat
              label="Total Bookings"
              value={summary.total}
              icon={BarChart3}
              tint="bg-indigo-50"
              iconColor="text-indigo-600"
              className="col-span-2 sm:col-span-1"
            />
            <Stat label="Today" value={summary.today} icon={CalendarDays} tint="bg-violet-50" iconColor="text-violet-600" />
            <Stat label="Pending" value={summary.pending} icon={Clock} tint="bg-amber-50" iconColor="text-amber-600" />
            <Stat label="Confirmed" value={summary.confirmed} icon={CheckCircle2} tint="bg-blue-50" iconColor="text-blue-600" />
            <Stat label="Completed" value={summary.completed} icon={CheckCheck} tint="bg-green-50" iconColor="text-green-600" />
          </div>
        )
      )}

      {/* Toolbar: tabs + search on one line; advanced filters collapse behind a toggle on
          mobile, sit on their own bar from sm, and fold into the same toolbar row from lg. */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 lg:gap-4">
        <div className="no-scrollbar order-2 flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-neutral-100 p-1 sm:order-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`flex-none whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 lg:px-4 ${
                status === tab.value ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Advanced filters */}
        <div
          id="booking-filters"
          className={`${panel} ${showFilters ? 'grid' : 'hidden'} order-3 grid-cols-2 gap-2.5 !p-3 sm:flex sm:w-full sm:flex-wrap sm:items-center sm:gap-2.5 sm:!p-3.5 lg:order-3 lg:w-auto lg:flex-none lg:flex-nowrap lg:!border-0 lg:!border-l lg:!border-neutral-200 lg:!bg-transparent lg:!p-0 lg:!pl-4 lg:!shadow-none`}
        >
          <div className="col-span-2 flex items-center gap-1.5 rounded-lg border border-neutral-300 pl-2.5 sm:col-span-1">
            <Filter size={14} strokeWidth={1.75} className="flex-none text-neutral-400" />
            <Select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="h-11 w-full border-none bg-transparent pl-1 text-sm text-neutral-700 outline-none sm:h-9 sm:w-28"
              aria-label="Filter by date"
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </Select>
          </div>
          <Select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className={`${input} !h-11 !w-full !rounded-lg !border-neutral-300 sm:!h-9 sm:!w-36`}
            aria-label="Filter by staff"
          >
            <option value="">All staff</option>
            {data?.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className={`${input} !h-11 !w-full !rounded-lg !border-neutral-300 sm:!h-9 sm:!w-40`}
            aria-label="Filter by service"
          >
            <option value="">All services</option>
            {data?.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="order-1 flex min-w-0 items-center gap-2 sm:order-2 sm:w-64 lg:order-2 lg:ml-auto lg:w-64 xl:w-72 2xl:w-80">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search bookings…"
              className={`${input} !h-11 !rounded-full !border-neutral-300 !pl-9 sm:!h-9`}
              aria-label="Search bookings"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="booking-filters"
            className={`flex h-11 flex-none items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:hidden ${
              advancedCount > 0
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-neutral-300 text-neutral-700 active:bg-neutral-50'
            }`}
          >
            <SlidersHorizontal size={16} strokeWidth={1.75} />
            Filters
            {advancedCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
                {advancedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active filters + result count */}
      {!loading && data && (data.bookings.length > 0 || hasFilters) && (
        <div className="-mb-1 flex flex-wrap items-center gap-x-3 gap-y-2 lg:-mb-2">
          <p className="text-xs font-medium text-neutral-500 lg:order-last lg:ml-auto lg:text-[13px]" aria-live="polite">
            {hasFilters ? `${rows.length} of ${data.bookings.length}` : data.bookings.length} bookings
          </p>
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />
          ))}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-md text-xs font-medium text-brand-600 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <ErrorText message={error} />

      {loading ? (
        <ListSkeleton />
      ) : (data?.bookings.length ?? 0) === 0 ? (
        <div className={`${panel} flex flex-col items-center px-4 py-10 text-center sm:py-14 lg:py-20`}>
          <CalendarDays size={28} strokeWidth={1.5} className="text-neutral-300 lg:h-9 lg:w-9" />
          <p className="mt-3 text-sm font-medium text-neutral-900 lg:mt-4 lg:text-base">No bookings yet</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">Customer appointments will appear here once they start booking.</p>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noreferrer"
            className={`mt-4 ${btnPrimary}`}
          >
            <Plus size={16} strokeWidth={1.75} />
            Add booking
          </a>
        </div>
      ) : rows.length === 0 ? (
        <div className={`${panel} flex flex-col items-center px-4 py-10 text-center sm:py-14 lg:py-20`}>
          <Filter size={28} strokeWidth={1.5} className="text-neutral-300 lg:h-9 lg:w-9" />
          <p className="mt-3 text-sm font-medium text-neutral-900 lg:mt-4 lg:text-base">No bookings found</p>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">Try changing your search or filters.</p>
          {hasFilters && (
            <button onClick={clearFilters} className={`mt-4 ${btnPrimary}`}>
              <X size={16} strokeWidth={1.75} />
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table (lg+; tablets keep the card list so nothing gets squashed) */}
          <div className={`${panel} hidden overflow-hidden !p-0 lg:block`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50/70 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="w-44 whitespace-nowrap px-4 py-3 font-medium xl:px-5">Date &amp; Time</th>
                    <th className="px-4 py-3 font-medium xl:px-5">Customer</th>
                    <th className="px-4 py-3 font-medium xl:px-5">Service</th>
                    <th className="px-4 py-3 font-medium xl:px-5">Staff</th>
                    <th className="w-32 px-4 py-3 font-medium xl:px-5">Status</th>
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
                        <div className="flex items-center gap-2.5">
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
                      <td className="px-4 py-3 align-middle text-neutral-700 xl:px-5">{b.services?.name}</td>
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
                          aria-label={`View booking ${reference(b.public_token)}`}
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

          {/* Mobile + tablet card list */}
          <ul className="space-y-2.5 sm:space-y-3 lg:hidden">
            {rows.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => setActive(b)}
                  className={`${panel} flex w-full items-center gap-3 !p-3.5 text-left outline-none transition-colors hover:bg-neutral-50 active:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-900 sm:gap-4 sm:!p-4`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                    {b.customers?.name ? initials(b.customers.name) : <User size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[14px] font-medium text-neutral-900">{b.customers?.name}</p>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{fmtDateTime(b.start_at, timezone)}</p>
                    <p className="mt-1 truncate text-sm text-neutral-600">
                      {b.services?.name} with {b.staff?.name ?? 'any staff'}
                    </p>
                  </div>
                  <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-neutral-300" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {active && (
        <BookingDetails booking={active} timezone={timezone} onClose={() => setActive(null)} onChanged={handleChanged} />
      )}

      {/* Mobile floating action button */}
      <a
        href={bookingUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Add booking"
        className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:hidden"
      >
        <Plus size={24} strokeWidth={2} />
      </a>
    </div>
  )
}
