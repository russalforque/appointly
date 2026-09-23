import { useCallback, useMemo, useState } from 'react'
import { addDays as dfAddDays, addMonths, endOfMonth, isSameDay, startOfDay, startOfMonth, startOfWeek as dfStartOfWeek } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Calendar, dateFnsLocalizer, Views, type View } from 'react-big-calendar'
import { format, getDay, parse } from 'date-fns'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import './calendar.css'
import { CalendarX2, ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react'
import { fetchBookings } from '../../lib/booking'
import { fmtTime, localDateKey, paddedRange, toBusinessLocalDate } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { btnPrimary, panel } from '../../lib/ui'
import type { BookingRow, BookingStatus, Staff } from '../../lib/types'
import { CalendarSkeleton, ErrorText } from '../../components/Status'
import Select from '../../components/Select'
import Modal from '../../components/Modal'
import { BookingActions, StatusBadge } from './BookingParts'
import { useBusiness } from './useBusiness'

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => dfStartOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales,
})

interface CalEvent {
  id: string
  title: string
  start: Date
  end: Date
  resource: BookingRow
}

const STATUS_STYLES: Record<BookingStatus, { bg: string; text: string; dot: string }> = {
  pending: { bg: '#fef3e2', text: '#92400e', dot: '#d97706' },
  confirmed: { bg: '#eef2ff', text: '#3730a3', dot: '#4f46e5' },
  completed: { bg: '#ecfdf3', text: '#166534', dot: '#16a34a' },
  cancelled: { bg: '#f5f5f5', text: '#737373', dot: '#a3a3a3' },
  no_show: { bg: '#fef2f2', text: '#991b1b', dot: '#dc2626' },
}

const STATUS_LEGEND: { status: BookingStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'completed', label: 'Completed' },
  { status: 'no_show', label: 'No-show' },
]

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: Views.MONTH, label: 'Month' },
  { value: Views.WEEK, label: 'Week' },
  { value: Views.DAY, label: 'Day' },
  { value: Views.AGENDA, label: 'Agenda' },
]

const AGENDA_LENGTH = 30

const dayLabelLong = (iso: string, tz: string) => format(toBusinessLocalDate(iso, tz), 'EEEE, MMM d, yyyy')

function periodLabel(date: Date, view: View): string {
  if (view === Views.MONTH) return `${format(startOfMonth(date), 'MMM d')} – ${format(endOfMonth(date), 'MMM d, yyyy')}`
  if (view === Views.DAY) return format(date, 'EEEE, MMM d, yyyy')
  const start = view === Views.WEEK ? dfStartOfWeek(date, { weekStartsOn: 1 }) : startOfDay(date)
  const end = dfAddDays(start, view === Views.WEEK ? 6 : AGENDA_LENGTH - 1)
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

function visibleRange(date: Date, view: View): { start: Date; end: Date } {
  if (view === Views.MONTH) {
    const start = dfStartOfWeek(startOfMonth(date), { weekStartsOn: 1 })
    const end = dfAddDays(dfStartOfWeek(endOfMonth(date), { weekStartsOn: 1 }), 7)
    return { start, end }
  }
  if (view === Views.WEEK) {
    const start = dfStartOfWeek(date, { weekStartsOn: 1 })
    return { start, end: dfAddDays(start, 7) }
  }
  if (view === Views.DAY) return { start: startOfDay(date), end: dfAddDays(startOfDay(date), 1) }
  return { start: startOfDay(date), end: dfAddDays(startOfDay(date), AGENDA_LENGTH) }
}

function dayHeaderLabel(date: Date, today: Date): string {
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, dfAddDays(today, 1))) return 'Tomorrow'
  return format(date, 'EEEE, MMM d')
}

function AgendaList({
  groups,
  today,
  timezone,
  onSelect,
}: {
  groups: { key: string; date: Date; events: CalEvent[] }[]
  today: Date
  timezone: string
  onSelect: (booking: BookingRow) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center py-14 text-center">
        <CalendarX2 size={28} strokeWidth={1.5} className="text-neutral-300" />
        <p className="mt-3 text-sm font-medium text-neutral-900">No bookings in this range</p>
        <p className="mt-1 text-sm text-neutral-500">Try a different date range or clear your filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="sticky top-0 z-10 -mx-2 mb-2 flex items-baseline gap-1.5 bg-white/95 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 backdrop-blur lg:static lg:mb-2.5 lg:border-b lg:border-neutral-100 lg:pb-2 lg:backdrop-blur-none">
            {dayHeaderLabel(group.date, today)}
            <span className="font-normal normal-case text-neutral-400">{format(group.date, 'MMM d')}</span>
            <span className="ml-auto hidden font-normal normal-case text-neutral-400 lg:inline">
              {group.events.length} booking{group.events.length === 1 ? '' : 's'}
            </span>
          </div>
          {/* A day's bookings tile across the width instead of stretching into one very wide row */}
          <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0 2xl:grid-cols-3">
            {group.events.map((ev) => {
              const b = ev.resource
              const s = STATUS_STYLES[b.status]
              return (
                <li key={ev.id}>
                  <button
                    onClick={() => onSelect(b)}
                    className={`${panel} flex w-full items-stretch gap-3 !p-3 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-neutral-900 lg:h-full lg:!p-3.5 lg:hover:shadow-md lg:hover:shadow-neutral-900/6`}
                  >
                    <div className="flex w-16 flex-none flex-col items-start pt-0.5">
                      <span className="text-sm font-semibold leading-tight text-neutral-900">{fmtTime(b.start_at, timezone)}</span>
                      <span className="text-[11px] leading-tight text-neutral-400">{fmtTime(b.end_at, timezone)}</span>
                    </div>
                    <span className="w-1 flex-none self-stretch rounded-full" style={{ backgroundColor: s.dot }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-neutral-900">{b.customers?.name ?? 'Booking'}</p>
                        <StatusBadge status={b.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {b.services?.name}
                        {b.staff?.name ? ` · ${b.staff.name}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function EventCard({ event, timezone }: { event: CalEvent; timezone: string }) {
  const b = event.resource
  return (
    <div className="flex items-center gap-1.5 overflow-hidden text-[11px] leading-tight xl:gap-2 xl:text-xs">
      <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: STATUS_STYLES[b.status].dot }} />
      <span className="truncate">
        <span className="font-semibold">{fmtTime(b.start_at, timezone)}</span>
        <span className="ml-1">{b.customers?.name ?? 'Booking'}</span>
      </span>
    </div>
  )
}

function BookingDetails({ booking, timezone, onClose, onChanged }: { booking: BookingRow; timezone: string; onClose: () => void; onChanged: () => void }) {
  const rows: [string, string][] = [
    ['Customer', booking.customers?.name ?? '—'],
    ['Service', booking.services?.name ?? '—'],
    ['Staff', booking.staff?.name ?? 'Any available'],
    ['Date', dayLabelLong(booking.start_at, timezone)],
    ['Start time', fmtTime(booking.start_at, timezone)],
    ['End time', fmtTime(booking.end_at, timezone)],
  ]

  return (
    <Modal onClose={onClose} title="Booking details" titleId="booking-details-title">
      <div className="mb-3">
        <StatusBadge status={booking.status} />
      </div>

      <dl className="space-y-2.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="truncate font-medium text-neutral-900">{value}</dd>
          </div>
        ))}
        {booking.notes && (
          <div>
            <dt className="text-neutral-500">Notes</dt>
            <dd className="mt-1 rounded-lg bg-neutral-50 p-2.5 text-neutral-700">{booking.notes}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <BookingActions booking={booking} onChanged={onChanged} />
      </div>
    </Modal>
  )
}

export default function CalendarPage() {
  const { business, timezone } = useBusiness()
  const [date, setDate] = useState(() => toBusinessLocalDate(new Date(), timezone))
  const [view, setView] = useState<View>(() => (window.innerWidth < 1024 ? Views.AGENDA : Views.WEEK))
  const [staffId, setStaffId] = useState('')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<BookingRow | null>(null)

  const range = useMemo(() => visibleRange(date, view), [date, view])
  const rangeStartMs = range.start.getTime()
  const rangeEndMs = range.end.getTime()
  const today = useMemo(() => toBusinessLocalDate(new Date(), timezone), [timezone])
  const isCurrentPeriod = today >= range.start && today < range.end

  const load = useCallback(async () => {
    const { from, to } = paddedRange(localDateKey(new Date(rangeStartMs)), localDateKey(new Date(rangeEndMs)))
    const [bookings, staff] = await Promise.all([
      fetchBookings(business.id, { from, to }),
      unwrap<Staff[]>(supabase.from('staff').select('*').eq('business_id', business.id).order('name')),
    ])
    return { bookings, staff }
  }, [business.id, rangeStartMs, rangeEndMs])
  const { data, loading, error, reload } = useLoad(load)

  const bookingUrl = `${window.location.origin}/book/${business.slug}`

  const events = useMemo<CalEvent[]>(() => {
    const q = search.trim().toLowerCase()
    return (data?.bookings ?? [])
      .filter((b) => b.status !== 'cancelled' && (!staffId || b.staff_id === staffId))
      .filter(
        (b) =>
          !q ||
          [b.customers?.name, b.services?.name, b.staff?.name].some((v) => v?.toLowerCase().includes(q)),
      )
      .map((b) => ({
        id: b.id,
        title: b.customers?.name ?? 'Booking',
        start: toBusinessLocalDate(b.start_at, timezone),
        end: toBusinessLocalDate(b.end_at, timezone),
        resource: b,
      }))
  }, [data, staffId, search, timezone])

  const agendaGroups = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of [...events].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const key = format(ev.start, 'yyyy-MM-dd')
      const arr = map.get(key) ?? []
      arr.push(ev)
      map.set(key, arr)
    }
    return Array.from(map.entries()).map(([key, evs]) => ({ key, date: evs[0].start, events: evs }))
  }, [events])

  function navigate(action: 'PREV' | 'TODAY' | 'NEXT') {
    if (action === 'TODAY') {
      setDate(toBusinessLocalDate(new Date(), timezone))
      return
    }
    const dir = action === 'PREV' ? -1 : 1
    setDate((d) => {
      if (view === Views.MONTH) return addMonths(d, dir)
      if (view === Views.WEEK) return dfAddDays(d, 7 * dir)
      if (view === Views.DAY) return dfAddDays(d, dir)
      return dfAddDays(d, AGENDA_LENGTH * dir)
    })
  }

  function handleChanged() {
    reload()
    setActive(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16 sm:pb-0 xl:max-w-360 2xl:max-w-400">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 lg:items-center lg:border-b lg:border-neutral-200/80 lg:pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl lg:text-[28px]">Calendar</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage your appointments and availability.</p>
        </div>
        <div className="hidden shrink-0 sm:block">
          <a href={bookingUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
            <Plus size={16} strokeWidth={1.75} />
            Add booking
          </a>
        </div>
      </div>

      {/* Controls */}
      <div className={`${panel} !p-3 lg:!p-4`}>
        {/* Mobile layout */}
        <div className="space-y-3 sm:hidden">
          <div className="flex items-center gap-2">
            <button
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-neutral-600 outline-none active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900"
              onClick={() => navigate('PREV')}
              aria-label="Previous"
            >
              <ChevronLeft size={18} strokeWidth={1.75} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-neutral-900">
                {format(date, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => navigate('TODAY')}
                disabled={isCurrentPeriod}
                className="truncate text-xs font-medium text-brand-600 outline-none disabled:text-neutral-400"
              >
                {isCurrentPeriod ? periodLabel(date, view) : 'Jump to today'}
              </button>
            </div>
            <button
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-neutral-600 outline-none active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900"
              onClick={() => navigate('NEXT')}
              aria-label="Next"
            >
              <ChevronRight size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="relative">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bookings"
              aria-label="Search bookings"
              className="h-11 w-full rounded-full border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-700 outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto rounded-full bg-neutral-100 p-1">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setView(opt.value)}
                className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                  view === opt.value ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center">
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-300 bg-white py-1 pl-3 pr-2 shadow-sm">
              <Users size={14} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
              <Select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="h-8 min-w-0 border-none bg-transparent pl-1 text-sm font-medium text-neutral-700 outline-none"
                aria-label="Filter by staff"
              >
                <option value="">All staff</option>
                {data?.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="-mx-1 flex items-center gap-3 overflow-x-auto border-t border-neutral-100 px-1 pt-2.5">
            {STATUS_LEGEND.map(({ status, label }) => (
              <span key={status} className="flex flex-none items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_STYLES[status].dot }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Desktop layout — stacked on tablets, one toolbar row once there is width for it */}
        <div className="hidden sm:block sm:space-y-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-3 lg:space-y-0">
          <div className="flex items-center gap-3 lg:flex-none">
            <div className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-xl bg-neutral-900 text-white">
              <span className="text-[9px] font-bold uppercase tracking-wide text-brand-300">{format(date, 'MMM')}</span>
              <span className="text-base font-bold leading-none">{format(date, 'd')}</span>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight tracking-tight text-neutral-900">{format(date, 'MMMM yyyy')}</h2>
              <p className="truncate text-xs text-neutral-500">{periodLabel(date, view)}</p>
            </div>
          </div>

          <div className="relative lg:w-56 xl:w-64">
            <Search
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bookings"
              aria-label="Search bookings"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-8 pr-3 text-sm text-neutral-700 outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 sm:w-52 lg:w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:flex-none lg:flex-nowrap">
            <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300">
              <button
                className="flex h-9 w-9 items-center justify-center text-neutral-600 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900"
                onClick={() => navigate('PREV')}
                aria-label="Previous"
              >
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>
              <button
                className="h-9 border-x border-neutral-300 px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-100 disabled:cursor-default disabled:text-neutral-400 disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-neutral-900"
                onClick={() => navigate('TODAY')}
                disabled={isCurrentPeriod}
              >
                Today
              </button>
              <button
                className="flex h-9 w-9 items-center justify-center text-neutral-600 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900"
                onClick={() => navigate('NEXT')}
                aria-label="Next"
              >
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-neutral-300 pl-2.5">
              <Users size={15} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
              <Select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="h-9 min-w-0 border-none bg-transparent pl-1 text-sm text-neutral-700 outline-none"
                aria-label="Filter by staff"
              >
                <option value="">All staff</option>
                {data?.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Laptops keep the compact select so the toolbar stays one row; only the widest screens have room for tabs */}
            <div className="min-w-0 rounded-lg border border-neutral-300 pl-2.5 2xl:hidden">
              <Select
                value={view}
                onChange={(e) => setView(e.target.value as View)}
                className="h-9 min-w-0 border-none bg-transparent pl-1 text-sm font-medium text-neutral-700 outline-none"
                aria-label="Calendar view"
              >
                {VIEW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} view
                  </option>
                ))}
              </Select>
            </div>

            <div className="hidden items-center gap-1 rounded-lg bg-neutral-100 p-1 2xl:flex" role="group" aria-label="Calendar view">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setView(opt.value)}
                  aria-pressed={view === opt.value}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                    view === opt.value ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-2.5 lg:w-full lg:pt-2">
            {STATUS_LEGEND.map(({ status, label }) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_STYLES[status].dot }} />
                {label}
              </span>
            ))}
            {/* The wide legend row has spare space — it carries the filtered count instead of sitting empty */}
            <span className="hidden text-xs text-neutral-400 lg:ml-auto lg:block">
              {events.length} booking{events.length === 1 ? '' : 's'} in view
            </span>
          </div>
        </div>
      </div>

      <ErrorText message={error} />

      {loading && !data ? (
        <CalendarSkeleton />
      ) : view === Views.AGENDA ? (
        <div className={`${panel} max-h-[calc(100vh-260px)] overflow-y-auto !p-3 sm:max-h-none sm:!p-3.5 lg:!p-5`}>
          <AgendaList groups={agendaGroups} today={today} timezone={timezone} onSelect={setActive} />
        </div>
      ) : (
        <div className={`${panel} max-h-[calc(100vh-260px)] overflow-auto !p-2 sm:max-h-none sm:!p-3 lg:!p-4`}>
          {/* Above lg the grid follows the window height instead of a fixed 760px, so tall screens
              show more of the day and short laptops still get a workable minimum. */}
          <div
            className={`app-calendar h-[480px] sm:h-[680px] sm:min-w-0 lg:h-[calc(100vh-25rem)] lg:min-h-150 2xl:h-[calc(100vh-24rem)] 2xl:min-h-180 ${
              view === Views.WEEK ? 'min-w-[640px]' : 'min-w-0'
            }`}
          >
            <Calendar
              localizer={localizer}
              events={events}
              date={date}
              view={view}
              views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
              onNavigate={setDate}
              onView={setView}
              length={AGENDA_LENGTH}
              step={30}
              popup
              onSelectEvent={(e) => setActive((e as CalEvent).resource)}
              eventPropGetter={(event) => {
                const s = STATUS_STYLES[(event as CalEvent).resource.status]
                return { style: { backgroundColor: s.bg, color: s.text, borderLeft: `3px solid ${s.dot}` } }
              }}
              components={{
                event: (props) => <EventCard event={props.event as CalEvent} timezone={timezone} />,
              }}
            />
          </div>
        </div>
      )}

      {active && (
        <BookingDetails booking={active} timezone={timezone} onClose={() => setActive(null)} onChanged={handleChanged} />
      )}

      <p className="flex items-center gap-1.5 px-1 text-xs text-neutral-400">
        New bookings are made through your{' '}
        <a href={bookingUrl} target="_blank" rel="noreferrer" className="font-medium text-neutral-500 hover:text-neutral-700 hover:underline">
          public booking page
        </a>
        .
      </p>

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
