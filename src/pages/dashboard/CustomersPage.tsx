import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Eye, Mail, Phone, Plus, Repeat2, Search, UserPlus, Users, X, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { fetchBookings } from '../../lib/booking'
import { useLoad } from '../../lib/useLoad'
import { fmtDateTime, initials } from '../../lib/format'
import { actionPrimary, actionSecondary, panel } from '../../lib/ui'
import type { BookingRow, Customer } from '../../lib/types'
import { EmptyState, ErrorState, ListSkeleton, PageHeaderSkeleton, StatGridSkeleton } from '../../components/Status'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import SearchField from '../../components/SearchField'
import SegmentedTabs from '../../components/SegmentedTabs'
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
    <div className={`${panel} p-4!`}>
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

function KindTag({ returning }: { returning: boolean }) {
  return (
    <span
      className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${
        returning ? 'bg-brand-50 text-brand-700' : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {returning ? 'Returning' : 'New'}
    </span>
  )
}

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
  const hasContact = Boolean(customer.phone || customer.email)

  return (
    <Modal
      onClose={onClose}
      title="Customer"
      titleId="customer-details-title"
      footer={
        hasContact ? (
          <div className="flex gap-2">
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className={`${actionPrimary} flex-1`}>
                <Phone size={16} strokeWidth={2} aria-hidden /> Call
              </a>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className={`${customer.phone ? actionSecondary : actionPrimary} flex-1`}>
                <Mail size={16} strokeWidth={2} aria-hidden /> Email
              </a>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
          {initials(customer.name)}
        </div>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-neutral-900 wrap-anywhere">{customer.name}</p>
          <p className="text-[13px] text-neutral-500 wrap-anywhere">
            {[customer.phone, customer.email].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
        </div>
      </div>

      {customer.notes && <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{customer.notes}</div>}

      <dl className="mt-4 grid grid-cols-4 divide-x divide-neutral-100 rounded-xl border border-neutral-100">
        {(
          [
            ['Total', s.total],
            ['Done', s.completed],
            ['Cancelled', s.cancelled],
            ['Upcoming', s.upcoming],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="px-1 py-2.5 text-center">
            <dd className="text-base font-semibold tabular-nums text-neutral-900">{value}</dd>
            <dt className="truncate text-[11px] text-neutral-500">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Recent bookings</p>
        {s.history.length === 0 ? (
          <p className="py-2 text-sm text-neutral-500">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {s.history.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
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

      <a href={bookingUrl} target="_blank" rel="noreferrer" className={`${actionSecondary} mt-4 w-full`}>
        <Plus size={16} strokeWidth={2} aria-hidden /> New booking for this customer
      </a>
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
  const { data, loading, error, reload } = useLoad(load)

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
    const withUpcoming = customers.filter((c) => (statsById.get(c.id)?.upcoming ?? 0) > 0).length
    return {
      total: customers.length,
      newCount,
      returningCount: customers.length - newCount,
      upcomingBookings,
      withUpcoming,
    }
  }, [data, now, statsById])

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
        <div className="hidden sm:block">
          <StatGridSkeleton />
        </div>
        <ListSkeleton />
      </div>
    )
  if (error && !data) return <ErrorState message={error} onRetry={reload} />

  const tabs = [
    { value: 'all' as const, label: 'All', count: summary.total },
    { value: 'upcoming' as const, label: 'Upcoming', count: summary.withUpcoming },
    { value: 'new' as const, label: 'New', count: summary.newCount },
    { value: 'returning' as const, label: 'Returning', count: summary.returningCount },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      <PageHeader title="Customers" subtitle="Manage your customers and view their booking history." />

      {/* Summary — phones read these counts off the filter tabs */}
      {data && (
        <div className="hidden gap-3 sm:grid sm:grid-cols-4">
          <Stat label="Total customers" value={summary.total} icon={Users} tint="bg-indigo-50" iconColor="text-indigo-600" />
          <Stat label="New" value={summary.newCount} icon={UserPlus} tint="bg-violet-50" iconColor="text-violet-600" />
          <Stat label="Returning" value={summary.returningCount} icon={Repeat2} tint="bg-blue-50" iconColor="text-blue-600" />
          <Stat label="Upcoming bookings" value={summary.upcomingBookings} icon={CalendarDays} tint="bg-green-50" iconColor="text-green-600" />
        </div>
      )}

      {/* Filter bar: pinned under the app bar on phones so search is always in reach, inline from md */}
      <div className="sticky top-14 z-10 -mx-4 space-y-2.5 border-b border-neutral-200/70 bg-neutral-50/95 px-4 pb-3 pt-1 backdrop-blur-sm sm:-mx-6 sm:px-6 md:static md:z-auto md:mx-0 md:flex md:flex-row-reverse md:items-center md:justify-between md:gap-3 md:space-y-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <SearchField value={q} onChange={setQ} placeholder="Search name, phone or email" label="Search customers" className="md:w-72" />
        <SegmentedTabs options={tabs} value={filter} onChange={setFilter} label="Filter customers" />
      </div>

      {hasFilters && data && data.customers.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs font-medium text-neutral-500" aria-live="polite">
            {rows.length} of {data.customers.length} customers
          </p>
          <button
            onClick={clearFilters}
            className="min-h-8 rounded-md text-xs font-medium text-brand-600 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            Clear all
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {(data?.customers.length ?? 0) === 0 ? (
        <div className={`${panel} p-0!`}>
          <EmptyState
            icon={Users}
            title="No customers yet"
            body="Everyone who books through your booking page is added here automatically."
            action={
              <a href={bookingUrl} target="_blank" rel="noreferrer" className={actionSecondary}>
                Open booking page
              </a>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className={`${panel} p-0!`}>
          <EmptyState
            icon={Search}
            title="No customers found"
            body="Try a different name, phone number, or email."
            action={
              <button onClick={clearFilters} className={actionSecondary}>
                <X size={16} strokeWidth={2} /> Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table (lg+). Contact sits under the name rather than in its own column, and the
              fixed layout truncates long names/emails instead of pushing the table off the panel. */}
          <div className={`${panel} hidden overflow-hidden p-0! lg:block`}>
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-neutral-200 text-[12px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="p-3.5 font-medium">Customer</th>
                  <th className="w-24 p-3.5 font-medium">Bookings</th>
                  <th className="hidden w-40 p-3.5 font-medium xl:table-cell">Last booking</th>
                  <th className="w-40 p-3.5 font-medium">Next booking</th>
                  <th className="w-28 p-3.5 font-medium">Status</th>
                  <th className="w-16 p-3.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = statsById.get(c.id)
                  const total = c.bookings[0]?.count ?? 0
                  const contact = [c.phone, c.email].filter(Boolean).join(' · ')
                  return (
                    <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                      <td className="p-3.5 align-middle">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600">
                            {initials(c.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium text-neutral-900" title={c.name}>
                              {c.name}
                            </span>
                            <span className="block truncate text-[12px] leading-tight text-neutral-500" title={contact || undefined}>
                              {contact || '—'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="p-3.5 align-middle tabular-nums text-neutral-700">{total}</td>
                      <td className="hidden whitespace-nowrap p-3.5 align-middle text-neutral-600 xl:table-cell">
                        {s?.last ? fmtDateTime(s.last.start_at, timezone) : '—'}
                      </td>
                      <td className="whitespace-nowrap p-3.5 align-middle text-neutral-600">
                        {s?.next ? fmtDateTime(s.next.start_at, timezone) : '—'}
                      </td>
                      <td className="p-3.5 align-middle">
                        <KindTag returning={total > 1} />
                      </td>
                      <td className="p-3.5 text-right align-middle">
                        <button
                          onClick={() => setActive(c)}
                          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900"
                          aria-label={`View ${c.name}`}
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

          {/* Phones + tablets: one divided list; contact details wait in the sheet */}
          <ul className={`${panel} divide-y divide-neutral-100 overflow-hidden p-0! lg:hidden`}>
            {rows.map((c) => {
              const s = statsById.get(c.id)
              const total = c.bookings[0]?.count ?? 0
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActive(c)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors active:bg-neutral-100 focus-visible:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[13px] font-semibold text-neutral-600">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-[15px] font-medium text-neutral-900">{c.name}</span>
                        <KindTag returning={total > 1} />
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
                        {s?.next ? (
                          <span className="flex min-w-0 items-center gap-1 font-medium text-brand-600">
                            <CalendarDays size={13} strokeWidth={2} className="flex-none" aria-hidden />
                            <span className="truncate">Next {fmtDateTime(s.next.start_at, timezone)}</span>
                          </span>
                        ) : (
                          <span className="truncate text-neutral-500">
                            {total} booking{total === 1 ? '' : 's'}
                            {s?.last ? ` · last ${fmtDateTime(s.last.start_at, timezone)}` : ''}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-neutral-300" aria-hidden />
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
