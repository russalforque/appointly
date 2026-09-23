import { useCallback, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Eye,
  Mail,
  Phone,
  Plus,
  Repeat2,
  Search,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { fetchBookings } from '../../lib/booking'
import { useLoad } from '../../lib/useLoad'
import { fmtDateTime, initials } from '../../lib/format'
import { btnPrimary, input, panel } from '../../lib/ui'
import type { BookingRow, Customer } from '../../lib/types'
import { ErrorText, ListSkeleton, PageHeaderSkeleton, StatGridSkeleton } from '../../components/Status'
import Modal from '../../components/Modal'
import { StatusBadge } from './BookingParts'
import { useBusiness } from './useBusiness'

type Filter = 'all' | 'upcoming' | 'new' | 'returning'

interface CustomerStats {
  total: number
  completed: number
  cancelled: number
  upcoming: number
  last: BookingRow | null
  next: BookingRow | null
  history: BookingRow[]
}

function buildStats(bookings: BookingRow[], now: Date): Map<string, CustomerStats> {
  const map = new Map<string, CustomerStats>()
  const byCustomer = new Map<string, BookingRow[]>()
  for (const b of bookings) {
    const list = byCustomer.get(b.customer_id) ?? []
    list.push(b)
    byCustomer.set(b.customer_id, list)
  }
  for (const [customerId, list] of byCustomer) {
    const sorted = [...list].sort((a, b) => b.start_at.localeCompare(a.start_at))
    const past = sorted.filter((b) => new Date(b.start_at) <= now && b.status !== 'cancelled')
    const future = sorted
      .filter((b) => new Date(b.start_at) > now && (b.status === 'pending' || b.status === 'confirmed'))
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
    map.set(customerId, {
      total: list.length,
      completed: list.filter((b) => b.status === 'completed').length,
      cancelled: list.filter((b) => b.status === 'cancelled').length,
      upcoming: future.length,
      last: past[0] ?? null,
      next: future[0] ?? null,
      history: sorted.slice(0, 5),
    })
  }
  return map
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
    <div className={`${panel} !p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xl font-bold leading-none text-neutral-900">{value}</p>
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${tint}`}>
          <Icon size={16} strokeWidth={2} className={iconColor} />
        </span>
      </div>
      <p className="mt-2 text-xs font-medium text-neutral-500">{label}</p>
    </div>
  )
}

const FILTER_TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All Customers' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'new', label: 'New' },
  { value: 'returning', label: 'Returning' },
]

function CustomerDetails({
  customer,
  stats,
  timezone,
  bookingUrl,
  onClose,
}: {
  customer: Customer
  stats: CustomerStats | undefined
  timezone: string
  bookingUrl: string
  onClose: () => void
}) {
  const s = stats ?? { total: 0, completed: 0, cancelled: 0, upcoming: 0, last: null, next: null, history: [] }

  return (
    <Modal onClose={onClose} title="Customer details" titleId="customer-details-title">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
          {initials(customer.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-neutral-900">{customer.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {[customer.phone, customer.email].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      {(customer.phone || customer.email) && (
        <div className="mt-4 flex gap-2">
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 outline-none transition-colors active:bg-neutral-50 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Phone size={16} strokeWidth={1.75} />
              Call
            </a>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 outline-none transition-colors active:bg-neutral-50 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <Mail size={16} strokeWidth={1.75} />
              Email
            </a>
          )}
        </div>
      )}

      {customer.notes && (
        <div className="mt-3 rounded-lg bg-neutral-50 p-2.5 text-sm text-neutral-700">{customer.notes}</div>
      )}

      <div className="mt-4 grid grid-cols-4 divide-x divide-neutral-100 rounded-lg border border-neutral-100">
        {[
          ['Total', s.total],
          ['Completed', s.completed],
          ['Cancelled', s.cancelled],
          ['Upcoming', s.upcoming],
        ].map(([label, value]) => (
          <div key={label} className="px-2 py-2.5 text-center">
            <p className="text-base font-semibold text-neutral-900">{value}</p>
            <p className="text-[11px] text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">Recent bookings</p>
        {s.history.length === 0 ? (
          <p className="text-sm text-neutral-500">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {s.history.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{fmtDateTime(b.start_at, timezone)}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {b.services?.name}
                    {b.staff?.name ? ` · ${b.staff.name}` : ''}
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <a href={bookingUrl} target="_blank" rel="noreferrer" className={`${btnPrimary} h-11 w-full sm:h-auto`}>
          <Plus size={16} strokeWidth={1.75} />
          Add booking
        </a>
      </div>
    </Modal>
  )
}

export default function CustomersPage() {
  const { business, timezone } = useBusiness()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    const [customers, bookings] = await Promise.all([
      unwrap<Customer[]>(
        supabase
          .from('customers')
          .select('id, name, email, phone, notes, created_at, bookings(count)')
          .eq('business_id', business.id)
          .order('name'),
      ),
      fetchBookings(business.id, { limit: 500, descending: true }),
    ])
    return { customers, bookings }
  }, [business.id])
  const { data, loading, error } = useLoad(load)

  const bookingUrl = `${window.location.origin}/book/${business.slug}`
  // Deliberate: `data` re-reads the clock when the page reloads, so "upcoming" is not frozen at mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [data])
  const statsById = useMemo(() => buildStats(data?.bookings ?? [], now), [data, now])

  const summary = useMemo(() => {
    const customers = data?.customers ?? []
    const newCount = customers.filter((c) => (c.bookings[0]?.count ?? 0) <= 1).length
    const upcomingBookings = (data?.bookings ?? []).filter(
      (b) => new Date(b.start_at) > now && (b.status === 'pending' || b.status === 'confirmed'),
    ).length
    return {
      total: customers.length,
      newCount,
      returningCount: customers.length - newCount,
      upcomingBookings,
    }
  }, [data, now])

  const rows = useMemo(() => {
    let list = data?.customers ?? []
    const term = q.trim().toLowerCase()
    if (term) list = list.filter((c) => [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(term)))
    if (filter === 'upcoming') list = list.filter((c) => (statsById.get(c.id)?.upcoming ?? 0) > 0)
    else if (filter === 'new') list = list.filter((c) => (c.bookings[0]?.count ?? 0) <= 1)
    else if (filter === 'returning') list = list.filter((c) => (c.bookings[0]?.count ?? 0) > 1)
    return list
  }, [data, q, filter, statsById])

  const hasFilters = Boolean(q.trim() || filter !== 'all')
  function clearFilters() {
    setQ('')
    setFilter('all')
  }

  if (loading)
    return (
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <PageHeaderSkeleton />
        <StatGridSkeleton />
        <ListSkeleton />
      </div>
    )

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-[env(safe-area-inset-bottom)] sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Customers</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage your customers and view their booking history.</p>
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4">
          <Stat label="Total customers" value={summary.total} icon={Users} tint="bg-indigo-50" iconColor="text-indigo-600" />
          <Stat label="New" value={summary.newCount} icon={UserPlus} tint="bg-violet-50" iconColor="text-violet-600" />
          <Stat label="Returning" value={summary.returningCount} icon={Repeat2} tint="bg-blue-50" iconColor="text-blue-600" />
          <Stat label="Upcoming bookings" value={summary.upcomingBookings} icon={CalendarDays} tint="bg-green-50" iconColor="text-green-600" />
        </div>
      )}

      {/* Filter bar: pinned under the mobile app bar, inline from md up */}
      <div className="sticky top-14 z-10 -mx-4 border-b border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:static md:z-auto md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div className="no-scrollbar order-2 flex items-center gap-1 overflow-x-auto rounded-full bg-neutral-100 p-1 sm:order-none">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`flex-none whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 ${
                  filter === tab.value ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative order-1 min-w-0 flex-1 sm:order-none sm:w-64 sm:flex-none">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              enterKeyHint="search"
              placeholder="Search customers…"
              className={`${input} !h-11 !rounded-full !border-neutral-300 !pl-9 [&::-webkit-search-cancel-button]:hidden sm:!h-9`}
              aria-label="Search customers"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 outline-none transition-colors active:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 sm:hidden"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Result count */}
      {data && data.customers.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs font-medium text-neutral-500" aria-live="polite">
            {hasFilters ? `${rows.length} of ${data.customers.length}` : data.customers.length} customers
          </p>
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

      {(data?.customers.length ?? 0) === 0 ? (
        <div className={`${panel} flex flex-col items-center px-4 py-10 text-center sm:py-14`}>
          <Users size={28} strokeWidth={1.5} className="text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-900">No customers yet</p>
          <p className="mt-1 text-sm text-neutral-500">Customers will appear here when they book an appointment.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className={`${panel} flex flex-col items-center px-4 py-10 text-center sm:py-14`}>
          <Search size={28} strokeWidth={1.5} className="text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-900">No customers found</p>
          <p className="mt-1 text-sm text-neutral-500">Try a different name, phone number, or email.</p>
          {hasFilters && (
            <button onClick={clearFilters} className={`mt-4 h-11 ${btnPrimary} sm:h-auto`}>
              <X size={16} strokeWidth={1.75} />
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${panel} hidden overflow-x-auto !p-0 md:block`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-[12px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="p-3.5 font-medium">Customer</th>
                  <th className="p-3.5 font-medium">Contact</th>
                  <th className="p-3.5 font-medium">Total bookings</th>
                  <th className="p-3.5 font-medium">Last booking</th>
                  <th className="p-3.5 font-medium">Next booking</th>
                  <th className="p-3.5 font-medium">Status</th>
                  <th className="p-3.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = statsById.get(c.id)
                  const total = c.bookings[0]?.count ?? 0
                  return (
                    <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                      <td className="p-3.5 align-middle">
                        <span className="text-[14px] font-medium text-neutral-900">{c.name}</span>
                      </td>
                      <td className="p-3.5 align-middle text-neutral-600">
                        {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="p-3.5 align-middle text-neutral-700">{total}</td>
                      <td className="whitespace-nowrap p-3.5 align-middle text-neutral-600">
                        {s?.last ? fmtDateTime(s.last.start_at, timezone) : '—'}
                      </td>
                      <td className="whitespace-nowrap p-3.5 align-middle text-neutral-600">
                        {s?.next ? fmtDateTime(s.next.start_at, timezone) : '—'}
                      </td>
                      <td className="p-3.5 align-middle">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            total <= 1 ? 'bg-neutral-100 text-neutral-600' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {total <= 1 ? 'New' : 'Returning'}
                        </span>
                      </td>
                      <td className="p-3.5 align-middle">
                        <button
                          onClick={() => setActive(c)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900"
                          aria-label="View customer"
                          title="View customer"
                        >
                          <Eye size={16} strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((c) => {
              const s = statsById.get(c.id)
              const total = c.bookings[0]?.count ?? 0
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActive(c)}
                    className={`${panel} flex w-full items-center gap-3 !p-3.5 text-left outline-none transition-[transform,background-color] duration-100 active:scale-[0.99] active:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-900`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                      {initials(c.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[15px] font-medium text-neutral-900">{c.name}</p>
                        <span
                          className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${
                            total <= 1 ? 'bg-neutral-100 text-neutral-600' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {total <= 1 ? 'New' : 'Returning'}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="flex-none text-neutral-500">{total} bookings</span>
                        <span className="text-neutral-300">·</span>
                        <span
                          className={`flex min-w-0 items-center gap-1 ${s?.next ? 'font-medium text-brand-600' : 'text-neutral-400'}`}
                        >
                          <CalendarDays size={12} strokeWidth={2} className="flex-none" />
                          <span className="truncate">{s?.next ? fmtDateTime(s.next.start_at, timezone) : 'No upcoming'}</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-neutral-300" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {active && (
        <CustomerDetails
          customer={active}
          stats={statsById.get(active.id)}
          timezone={timezone}
          bookingUrl={bookingUrl}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  )
}
