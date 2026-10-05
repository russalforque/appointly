import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarClock,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Keyboard,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { appointmentEnd, fetchBooking, fetchBookings } from '../../lib/booking'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { addDays, dayKey, fmtPeso, fmtTime, initials, paddedRange, todayIn } from '../../lib/format'
import { actionPrimary, btnPrimary, panel } from '../../lib/ui'
import type { BookingRow, BookingStatus, DayOff, Staff, WorkingHours } from '../../lib/types'
import { ErrorText } from '../../components/Status'
import Select from '../../components/Select'
import Modal from '../../components/Modal'
import Fab from '../../components/Fab'
import { BookingDetailsSheet, BookingListItem } from './BookingParts'
import { useBusiness } from './useBusiness'
import {
  LIST_DAYS,
  MIN_BLOCK_MINUTES,
  STATUS_META,
  STATUS_ORDER,
  VIEWS,
  clockLabel,
  closedIntervals,
  daysBetween,
  hourBounds,
  isCalView,
  isDateKey,
  layoutColumn,
  minutesIn,
  monthGrid,
  openIntervals,
  staffColor,
  step,
  toEvent,
  viewRange,
  type CalEvent,
  type CalView,
} from './calendarModel'

/** One minute is one pixel tall: 60px an hour keeps 15-minute bookings legible without endless scrolling. */
const PX_PER_MIN = 1
const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgb(23 23 23 / 0.045) 0 6px, transparent 6px 12px)',
}

const fmtLocal = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`))

function periodTitle(date: string, view: CalView): string {
  if (view === 'day') return fmtLocal(date, { weekday: 'long', month: 'long', day: 'numeric' })
  if (view === 'month') return fmtLocal(date, { month: 'long', year: 'numeric' })
  const { start, end } = viewRange(date, view)
  const last = addDays(end, -1)
  const sameMonth = start.slice(0, 7) === last.slice(0, 7)
  return `${fmtLocal(start, { month: 'short', day: 'numeric' })} – ${fmtLocal(last, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
}

const dayHeading = (day: string, today: string) =>
  day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : day === addDays(today, -1) ? 'Yesterday' : fmtLocal(day, { weekday: 'long' })

/** Re-renders every minute so the "now" line and today marker keep up with the clock. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function bookingLabel(b: BookingRow, tz: string) {
  return `${fmtTime(b.start_at, tz)} to ${fmtTime(appointmentEnd(b), tz)}, ${b.customers?.name ?? 'Booking'}, ${b.services?.name ?? ''}${
    b.staff?.name ? ` with ${b.staff.name}` : ''
  }, ${STATUS_META[b.status].label}`
}

// ---------------------------------------------------------------------------
// Time grid (day and week)
// ---------------------------------------------------------------------------

interface Column {
  key: string
  day: string
  title: string
  subtitle?: string
  color?: string
  avatar?: string
  isToday: boolean
  /** Why nobody can book this column at all (blocked date, day off). */
  unavailable?: string
  events: CalEvent[]
}

function TimeGrid({
  columns,
  hours,
  workingHours,
  nowMin,
  scrollKey,
  minColWidth,
  showStaff,
  timezone,
  staffColors,
  onSelect,
}: {
  columns: Column[]
  hours: { from: number; to: number }
  workingHours: WorkingHours
  nowMin: number
  scrollKey: string
  minColWidth: number
  showStaff: boolean
  timezone: string
  staffColors: Map<string, string>
  onSelect: (b: BookingRow) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const from = hours.from * 60
  const to = hours.to * 60
  const height = (to - from) * PX_PER_MIN
  const y = (min: number) => (Math.min(Math.max(min, from), to) - from) * PX_PER_MIN

  // Land on the part of the day that matters: just before now if today is shown, else the first booking.
  const firstEvent = Math.min(...columns.flatMap((c) => c.events.map((e) => e.start)), Infinity)
  const showsToday = columns.some((c) => c.isToday)
  const focusMin = showsToday ? nowMin - 60 : firstEvent === Infinity ? from : firstEvent - 30
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, y(focusMin) - 8)
    // Only on navigation; a re-render must not yank the grid away from where the user scrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey])

  const hourMarks = Array.from({ length: hours.to - hours.from }, (_, i) => hours.from + i)
  // A busy column widens (64px a lane) and the board scrolls sideways, rather than crushing names.
  const laid = columns.map((c) => layoutColumn(c.events))
  const colMin = laid.map((placed) => Math.max(minColWidth, ...placed.map((p) => p.lanes * 64)))

  return (
    <div
      ref={scrollRef}
      className="relative max-h-[calc(100dvh-15rem)] min-h-104 overflow-auto overscroll-contain md:max-h-[calc(100dvh-18.5rem)] lg:max-h-[calc(100dvh-17.5rem)]"
    >
      <div className="grid" style={{ gridTemplateColumns: `3.5rem ${colMin.map((w) => `minmax(${w}px, 1fr)`).join(" ")}` }}>
        {/* Header row */}
        <div className="sticky left-0 top-0 z-30 border-b border-neutral-200 bg-white" />
        {columns.map((c) => (
          <div
            key={c.key}
            className="sticky top-0 z-20 flex min-w-0 items-center gap-2 border-b border-l border-neutral-200 bg-white/95 px-2.5 py-2.5 backdrop-blur"
          >
            {c.avatar !== undefined ? (
              <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ backgroundColor: c.color }}
              >
                {c.avatar}
              </span>
            ) : (
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                  c.isToday ? 'bg-brand-600 text-white' : 'text-neutral-900'
                }`}
              >
                {Number(c.day.slice(8))}
              </span>
            )}
            <div className="min-w-0">
              <p
                className={`truncate text-[13px] font-semibold leading-tight ${
                  c.isToday && c.avatar === undefined ? 'text-brand-700' : 'text-neutral-900'
                }`}
              >
                {c.title}
              </p>
              <p className="truncate text-[11px] leading-tight text-neutral-500">
                {c.unavailable ?? c.subtitle ?? `${c.events.length} booking${c.events.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        ))}

        {/* Hour gutter */}
        <div className="sticky left-0 z-10 border-r border-neutral-100 bg-white" style={{ height }} aria-hidden>
          {hourMarks.map((h, i) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-neutral-400 sm:text-[11px]"
              style={{ top: i === 0 ? 8 : (h * 60 - from) * PX_PER_MIN }}
            >
              {clockLabel(h * 60)}
            </span>
          ))}
        </div>

        {/* Columns */}
        {columns.map((c, ci) => {
          const closed = c.unavailable ? [[from, to] as [number, number]] : closedIntervals(openIntervals(c.day, workingHours), from, to)
          const placed = laid[ci]
          return (
            <div
              key={c.key}
              className={`relative border-l border-neutral-100 ${c.isToday && c.avatar === undefined ? 'bg-brand-50/30' : ''}`}
              style={{
                height,
                backgroundImage:
                  'linear-gradient(to bottom, rgb(229 229 229 / 0.9) 1px, transparent 1px), linear-gradient(to bottom, rgb(229 229 229 / 0.4) 1px, transparent 1px)',
                backgroundSize: `100% ${60 * PX_PER_MIN}px, 100% ${60 * PX_PER_MIN}px`,
                backgroundPosition: `0 0, 0 ${30 * PX_PER_MIN}px`,
              }}
            >
              {closed.map(([s, e]) => (
                <div key={s} aria-hidden className="absolute inset-x-0 bg-neutral-50/70" style={{ ...HATCH, top: y(s), height: y(e) - y(s) }} />
              ))}
              {c.unavailable && (
                <p className="absolute inset-x-2 top-3 rounded-md bg-white/90 px-2 py-1 text-center text-[11px] font-medium text-neutral-500 shadow-sm">
                  {c.unavailable}
                </p>
              )}

              {placed.map((p) => {
                const b = p.booking
                const top = y(p.start)
                const h = Math.max(y(p.end) - top, MIN_BLOCK_MINUTES * PX_PER_MIN)
                const tail = y(p.blockedEnd) - (top + h)
                const left = `calc(${(p.lane / p.lanes) * 100}% + 3px)`
                const width = `calc(${100 / p.lanes}% - 6px)`
                const roomy = h >= 44
                // A lane under ~90px can't fit "9:00 AM – 10:00 AM": lead with the name, start time only.
                const narrow = p.lanes > 1 && colMin[ci] / p.lanes < 90
                return (
                  <div key={b.id}>
                    {tail > 2 && (
                      <div
                        aria-hidden
                        title="Buffer"
                        className="pointer-events-none absolute rounded-b-md border-x border-b border-dashed border-neutral-300/80 bg-neutral-100/60"
                        style={{ top: top + h, height: tail, left, width }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelect(b)}
                      aria-label={bookingLabel(b, timezone)}
                      className={`absolute overflow-hidden rounded-lg border-l-[3px] px-2 text-left shadow-sm shadow-neutral-900/5 outline-none ring-1 ring-black/5 transition-[background-color,box-shadow] hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        STATUS_META[b.status].block
                      } ${roomy ? 'py-1.5' : 'py-0.5'}`}
                      style={{ top, height: h, left, width }}
                    >
                      {narrow ? (
                        <>
                          <p className="truncate text-xs font-semibold leading-tight">{b.customers?.name?.split(' ')[0] ?? 'Booking'}</p>
                          <p className="truncate text-[10px] tabular-nums leading-tight opacity-75">{fmtTime(b.start_at, timezone)}</p>
                        </>
                      ) : roomy ? (
                        <>
                          <p className="truncate text-[11px] font-medium tabular-nums opacity-75">
                            {fmtTime(b.start_at, timezone)} – {fmtTime(appointmentEnd(b), timezone)}
                          </p>
                          <p className="truncate text-[13px] font-semibold leading-snug">{b.customers?.name ?? 'Booking'}</p>
                          {h >= 64 && <p className="truncate text-[11px] leading-snug opacity-80">{b.services?.name}</p>}
                          {showStaff && h >= 84 && b.staff && (
                            <p className="mt-1 flex items-center gap-1 truncate text-[11px] opacity-80">
                              <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: staffColors.get(b.staff_id) }} />
                              <span className="truncate">{b.staff.name}</span>
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="truncate text-[11px] leading-tight">
                          <span className="font-semibold tabular-nums">{fmtTime(b.start_at, timezone)}</span> {b.customers?.name ?? 'Booking'}
                        </p>
                      )}
                    </button>
                  </div>
                )
              })}

              {c.isToday && nowMin >= from && nowMin <= to && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-15" style={{ top: y(nowMin) }}>
                  <div className="relative h-0.5 bg-red-500">
                    <span className="absolute -left-1 -top-0.75 h-2 w-2 rounded-full bg-red-500" />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthView({
  date,
  today,
  byDay,
  blocked,
  workingHours,
  timezone,
  onPick,
  onSelect,
}: {
  date: string
  today: string
  byDay: Map<string, CalEvent[]>
  blocked: Set<string>
  workingHours: WorkingHours
  timezone: string
  onPick: (day: string) => void
  onSelect: (b: BookingRow) => void
}) {
  const { start, end } = monthGrid(date)
  const month = date.slice(0, 7)

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50/70">
        {WEEKDAYS.map((d) => (
          <p key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {daysBetween(start, end).map((d, i) => {
          const evs = byDay.get(d) ?? []
          const inMonth = d.slice(0, 7) === month
          const selected = d === date
          const closed = blocked.has(d) || openIntervals(d, workingHours).length === 0
          return (
            // The whole cell selects the day for the pointer; the date button is the keyboard way in.
            <div
              key={d}
              onClick={() => onPick(d)}
              className={`relative min-h-16 cursor-pointer border-neutral-100 p-1 transition-colors sm:min-h-28 sm:p-1.5 xl:min-h-32 ${
                i % 7 ? 'border-l' : ''
              } ${i >= 7 ? 'border-t' : ''} ${
                selected ? 'bg-brand-50/60' : closed ? 'bg-neutral-50/80 hover:bg-neutral-100/60' : 'hover:bg-neutral-50'
              }`}
              style={closed && !selected ? HATCH : undefined}
            >
              <div className="flex items-center justify-center sm:justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPick(d)
                  }}
                  aria-label={`${fmtLocal(d, { weekday: 'long', month: 'long', day: 'numeric' })}, ${evs.length} booking${evs.length === 1 ? '' : 's'}`}
                  aria-pressed={selected}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-7 sm:min-w-7 ${
                    d === today
                      ? 'bg-brand-600 text-white'
                      : selected
                        ? 'bg-neutral-900 text-white'
                        : inMonth
                          ? 'text-neutral-800 hover:bg-neutral-200/70'
                          : 'text-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
                {evs.length > 0 && <span className="hidden text-[10px] font-medium tabular-nums text-neutral-400 sm:inline">{evs.length}</span>}
              </div>

              {/* Phones: dots. Wider: the first bookings by name. */}
              {evs.length > 0 && (
                <div className="mt-1 flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                  {evs.slice(0, 4).map((e) => (
                    <span key={e.booking.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_META[e.booking.status].dot}`} />
                  ))}
                </div>
              )}
              <ul className="mt-1 hidden space-y-0.5 sm:block">
                {evs.slice(0, 3).map((e) => (
                  <li key={e.booking.id}>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSelect(e.booking)
                      }}
                      aria-label={bookingLabel(e.booking, timezone)}
                      className={`flex w-full items-center gap-1.5 truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        STATUS_META[e.booking.status].block
                      }`}
                    >
                      <span className="font-semibold tabular-nums">{fmtTime(e.booking.start_at, timezone)}</span>
                      <span className="truncate">{e.booking.customers?.name ?? 'Booking'}</span>
                    </button>
                  </li>
                ))}
                {evs.length > 3 && <li className="px-1.5 text-[11px] font-semibold text-brand-600">+{evs.length - 3} more</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lists (list view, and the selected day under the month)
// ---------------------------------------------------------------------------

function EventRow({
  e,
  timezone,
  staffColors,
  onSelect,
}: {
  e: CalEvent
  timezone: string
  staffColors: Map<string, string>
  onSelect: (b: BookingRow) => void
}) {
  return <BookingListItem booking={e.booking} timezone={timezone} onSelect={onSelect} staffColor={staffColors.get(e.booking.staff_id)} showPrice />
}

function EmptyDay({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
        <CalendarX2 size={22} strokeWidth={1.5} />
      </span>
      <p className="mt-3 text-sm font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-neutral-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function DayAgenda({
  days,
  today,
  byDay,
  timezone,
  staffColors,
  onSelect,
  emptyBody,
}: {
  days: string[]
  today: string
  byDay: Map<string, CalEvent[]>
  timezone: string
  staffColors: Map<string, string>
  onSelect: (b: BookingRow) => void
  emptyBody: string
}) {
  const withEvents = days.filter((d) => (byDay.get(d) ?? []).length > 0)
  if (withEvents.length === 0) return <EmptyDay title="Nothing scheduled" body={emptyBody} />
  return (
    <div className="divide-y divide-neutral-100">
      {withEvents.map((d) => {
        const evs = byDay.get(d)!
        return (
          <section key={d} className="py-3 first:pt-1 last:pb-1">
            <header className="flex items-baseline gap-2 px-4 pb-1 sm:px-5">
              <h3 className={`text-sm font-semibold ${d === today ? 'text-brand-700' : 'text-neutral-900'}`}>{dayHeading(d, today)}</h3>
              <span className="text-xs text-neutral-400">{fmtLocal(d, { month: 'short', day: 'numeric' })}</span>
              <span className="ml-auto text-xs text-neutral-400">
                {evs.length} booking{evs.length === 1 ? '' : 's'}
              </span>
            </header>
            <ul>
              {evs.map((e) => (
                <EventRow key={e.booking.id} e={e} timezone={timezone} staffColors={staffColors} onSelect={onSelect} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Navigation pieces
// ---------------------------------------------------------------------------

function MiniMonth({ date, today, counts, onPick }: { date: string; today: string; counts: Map<string, number>; onPick: (day: string) => void }) {
  const { start, end } = monthGrid(date)
  const month = date.slice(0, 7)
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-neutral-900">{fmtLocal(date, { month: 'long', year: 'numeric' })}</p>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-[10px] font-semibold uppercase text-neutral-400">
            {d[0]}
          </span>
        ))}
        {daysBetween(start, end).map((d) => {
          const n = counts.get(d) ?? 0
          const selected = d === date
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={`${fmtLocal(d, { weekday: 'long', month: 'long', day: 'numeric' })}${n ? `, ${n} booking${n === 1 ? '' : 's'}` : ''}`}
              aria-pressed={selected}
              className={`relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                selected
                  ? 'bg-neutral-900 font-semibold text-white'
                  : d === today
                    ? 'font-semibold text-brand-700 ring-1 ring-brand-300'
                    : d.slice(0, 7) === month
                      ? 'text-neutral-700 hover:bg-neutral-100'
                      : 'text-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {Number(d.slice(8))}
              {/* Busier days get a longer mark */}
              {n > 0 && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 h-1 rounded-full ${selected ? 'bg-white' : 'bg-brand-500'} ${n > 4 ? 'w-3' : n > 1 ? 'w-2' : 'w-1'}`}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Seven-day strip above the day view: jump within the week and see how full each day is. */
function WeekStrip({ date, today, counts, onPick }: { date: string; today: string; counts: Map<string, number>; onPick: (d: string) => void }) {
  const { start, end } = viewRange(date, 'week')
  return (
    <div className="grid grid-cols-7 gap-1 border-b border-neutral-100 p-2 sm:gap-1.5 sm:p-3">
      {daysBetween(start, end).map((d) => {
        const n = counts.get(d) ?? 0
        const selected = d === date
        return (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-pressed={selected}
            aria-label={`${fmtLocal(d, { weekday: 'long', month: 'long', day: 'numeric' })}, ${n} booking${n === 1 ? '' : 's'}`}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
              selected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
            }`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${selected ? 'text-white/70' : 'text-neutral-400'}`}>
              {fmtLocal(d, { weekday: 'short' })}
            </span>
            <span className={`text-base font-semibold tabular-nums ${selected ? '' : d === today ? 'text-brand-600' : 'text-neutral-900'}`}>
              {Number(d.slice(8))}
            </span>
            <span className={`text-[10px] tabular-nums ${selected ? 'text-white/70' : n ? 'text-neutral-500' : 'text-neutral-300'}`}>
              {n ? n : '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Cancelled bookings start hidden: they hold no time, and they clutter a busy day. */
const DEFAULT_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'completed', 'no_show']

export default function CalendarPage() {
  const { business, timezone } = useBusiness()
  const now = useNow()
  const today = todayIn(timezone)
  const nowMin = minutesIn(now, timezone)

  // View and date live in the URL, so a refresh or a shared link lands on the same place.
  const [params, setParams] = useSearchParams()
  const [defaultView] = useState<CalView>(() => (window.innerWidth < 640 ? 'day' : 'week'))
  const rawView = params.get('view')
  const rawDate = params.get('date')
  const view: CalView = isCalView(rawView) ? rawView : defaultView
  const date = isDateKey(rawDate) ? rawDate : today
  const go = useCallback(
    (next: { view?: CalView; date?: string }) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p)
          if (next.view) n.set('view', next.view)
          if (next.date) n.set('date', next.date)
          return n
        },
        { replace: true },
      ),
    [setParams],
  )

  const [staffId, setStaffId] = useState('')
  const [q, setQ] = useState('')
  const [statuses, setStatuses] = useState<Set<BookingStatus>>(() => new Set(DEFAULT_STATUSES))
  const [active, setActive] = useState<BookingRow | null>(null)
  // Phones: search, team and status filters live in a sheet so the schedule starts near the top.
  const [showFilters, setShowFilters] = useState(false)

  // ?booking=<id> (from a notification) jumps to that booking's day and opens it.
  const linkedBooking = params.get('booking')
  useEffect(() => {
    if (!linkedBooking) return
    let cancelled = false
    fetchBooking(business.id, linkedBooking)
      .catch(() => null)
      .then((b) => {
        if (cancelled) return
        if (b) setActive(b)
        // One URL update: consume the link and, if found, land on the booking's day.
        setParams(
          (p) => {
            const n = new URLSearchParams(p)
            n.delete('booking')
            if (b) {
              n.set('view', 'day')
              n.set('date', dayKey(b.start_at, timezone))
            }
            return n
          },
          { replace: true },
        )
      })
    return () => {
      cancelled = true
    }
  }, [linkedBooking, business.id, timezone, setParams])

  const range = viewRange(date, view)
  const grid = monthGrid(date)
  // Always covers the mini month as well, so its busy-day marks are real whatever the view.
  const fetchFrom = range.start < grid.start ? range.start : grid.start
  const fetchTo = range.end > grid.end ? range.end : grid.end

  const loadStatic = useCallback(async () => {
    const [staff, settings] = await Promise.all([
      unwrap<Staff[]>(supabase.from('staff').select('*').eq('business_id', business.id).order('name')),
      unwrap<{ working_hours: WorkingHours; blocked_dates: string[] }>(
        supabase.from('business_settings').select('working_hours, blocked_dates').eq('business_id', business.id).single(),
      ),
    ])
    return { staff, settings }
  }, [business.id])
  const base = useLoad(loadStatic)

  const loadRange = useCallback(async () => {
    const { from, to } = paddedRange(fetchFrom, fetchTo)
    const [bookings, daysOff] = await Promise.all([
      fetchBookings(business.id, { from, to }),
      unwrap<DayOff[]>(
        supabase
          .from('staff_days_off')
          .select('id, staff_id, date, reason, staff!inner(business_id)')
          .eq('staff.business_id', business.id)
          .gte('date', fetchFrom)
          .lt('date', fetchTo),
      ),
    ])
    return { bookings, daysOff }
  }, [business.id, fetchFrom, fetchTo])
  const { data, loading, error, reload } = useLoad(loadRange)

  const staff = useMemo(() => base.data?.staff ?? [], [base.data])
  const workingHours = useMemo(() => base.data?.settings.working_hours ?? {}, [base.data])
  const blocked = useMemo(() => new Set(base.data?.settings.blocked_dates ?? []), [base.data])
  const staffColors = useMemo(() => new Map(staff.map((s, i) => [s.id, staffColor(i)])), [staff])

  // Every booking in the fetched window as a positioned event; filters apply on top.
  const allEvents = useMemo(() => (data?.bookings ?? []).map((b) => toEvent(b, timezone)), [data, timezone])
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase()
    return allEvents.filter((e) => {
      const b = e.booking
      if (staffId && b.staff_id !== staffId) return false
      if (!term) return true
      return [b.customers?.name, b.customers?.phone, b.customers?.email, b.services?.name, b.staff?.name].some((v) =>
        v?.toLowerCase().includes(term),
      )
    })
  }, [allEvents, staffId, q])
  const events = useMemo(() => searched.filter((e) => statuses.has(e.booking.status)), [searched, statuses])

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of [...events].sort((a, b) => a.booking.start_at.localeCompare(b.booking.start_at))) {
      const arr = m.get(e.day) ?? []
      arr.push(e)
      m.set(e.day, arr)
    }
    return m
  }, [events])
  const counts = useMemo(() => new Map([...byDay].map(([d, evs]) => [d, evs.length])), [byDay])

  const inRange = (e: CalEvent) => e.day >= range.start && e.day < range.end
  const visible = events.filter(inRange)
  const statusCounts = new Map<BookingStatus, number>()
  for (const e of searched.filter(inRange)) statusCounts.set(e.booking.status, (statusCounts.get(e.booking.status) ?? 0) + 1)
  const pendingCount = statusCounts.get('pending') ?? 0
  const scheduledValue = visible
    .filter((e) => e.booking.status !== 'cancelled' && e.booking.status !== 'no_show')
    .reduce((sum, e) => sum + (e.booking.services?.price ?? 0), 0)
  const staffCounts = new Map<string, number>()
  for (const e of allEvents.filter(inRange)) {
    if (statuses.has(e.booking.status)) staffCounts.set(e.booking.staff_id, (staffCounts.get(e.booking.staff_id) ?? 0) + 1)
  }
  const filtered = Boolean(q.trim() || staffId || statuses.size < DEFAULT_STATUSES.length)

  function toggleStatus(s: BookingStatus) {
    setStatuses((cur) => {
      const next = new Set(cur)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }
  const onlyPending = statuses.size === 1 && statuses.has('pending')

  // Keyboard: ← → move, T today, D W M L switch view. Ignored while typing or with a dialog open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (active || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (e.key === 'ArrowLeft') go({ date: step(date, view, -1) })
      else if (e.key === 'ArrowRight') go({ date: step(date, view, 1) })
      else if (k === 't') go({ date: today })
      else {
        const v = VIEWS.find((x) => x.key === k)
        if (!v) return
        go({ view: v.value })
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, date, view, today, go])

  const bookingUrl = `${window.location.origin}/book/${business.slug}`

  // Day view: one column per person, so the room's day reads at a glance.
  const dayColumns = useMemo<Column[]>(() => {
    if (view !== 'day') return []
    const todays = events.filter((e) => e.day === date)
    const people = staff.filter((s) => (staffId ? s.id === staffId : s.is_active || todays.some((e) => e.booking.staff_id === s.id)))
    const off = new Map((data?.daysOff ?? []).filter((d) => d.date === date).map((d) => [d.staff_id, d.reason]))
    const closedDay = blocked.has(date) ? 'Closed · blocked date' : undefined
    if (people.length === 0) return [{ key: 'all', day: date, title: 'All bookings', isToday: date === today, unavailable: closedDay, events: todays }]
    return people.map((s) => ({
      key: s.id,
      day: date,
      title: s.name,
      subtitle: s.position ?? undefined,
      avatar: initials(s.name),
      color: staffColors.get(s.id),
      isToday: date === today,
      unavailable: closedDay ?? (off.has(s.id) ? `Day off${off.get(s.id) ? ` · ${off.get(s.id)}` : ''}` : !s.is_active ? 'Inactive' : undefined),
      events: todays.filter((e) => e.booking.staff_id === s.id),
    }))
  }, [view, events, staff, staffId, data, blocked, date, today, staffColors])

  const weekColumns = useMemo<Column[]>(() => {
    if (view !== 'week') return []
    return daysBetween(range.start, range.end).map((d) => ({
      key: d,
      day: d,
      title: fmtLocal(d, { weekday: 'short' }),
      isToday: d === today,
      unavailable: blocked.has(d) ? 'Blocked date' : undefined,
      events: byDay.get(d) ?? [],
    }))
  }, [view, range.start, range.end, today, blocked, byDay])

  const columns = view === 'day' ? dayColumns : weekColumns
  const hours = useMemo(
    () => hourBounds(daysBetween(range.start, range.end), workingHours, columns.flatMap((c) => c.events)),
    [range.start, range.end, workingHours, columns],
  )

  const firstLoad = (loading && !data) || (base.loading && !base.data)
  const navBtn =
    'flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600'
  const kbd = 'font-sans font-semibold text-neutral-500'

  const statusChips = (
    <div className="flex flex-wrap gap-1.5">
      {STATUS_ORDER.map((s) => {
        const on = statuses.has(s)
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            aria-pressed={on}
            className={`flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 lg:h-8 lg:px-2.5 ${
              on ? STATUS_META[s].chipOn : 'border-neutral-200 bg-white text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${on ? STATUS_META[s].dot : 'bg-neutral-300'}`} />
            {STATUS_META[s].label}
            <span className="tabular-nums opacity-70">{statusCounts.get(s) ?? 0}</span>
          </button>
        )
      })}
    </div>
  )

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search customer, service…"
        aria-label="Search bookings"
        className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-9 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 lg:h-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ('')}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 outline-none hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl xl:max-w-360 2xl:max-w-400">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="hidden text-[13px] font-medium text-neutral-500 sm:block">Calendar</p>
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 sm:mt-0.5 sm:text-[28px]">{periodTitle(date, view)}</h1>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <Globe2 size={16} strokeWidth={1.75} />
            Booking page
          </a>
          <a href={bookingUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
            <Plus size={16} strokeWidth={1.75} />
            Add booking
          </a>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-5 sm:mt-5 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-6">
        {/* Rail (desktop) */}
        <aside className="hidden space-y-4 lg:block">
          <div className={`${panel} !p-4`}>
            <MiniMonth date={date} today={today} counts={counts} onPick={(d) => go({ date: d })} />
            <div className="mt-3 flex items-center gap-1 border-t border-neutral-100 pt-3">
              <button type="button" className={navBtn} onClick={() => go({ date: step(date, 'month', -1) })} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => go({ date: today })}
                className="h-9 flex-1 rounded-lg text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                Jump to today
              </button>
              <button type="button" className={navBtn} onClick={() => go({ date: step(date, 'month', 1) })} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className={`${panel} space-y-4 !p-4`}>
            {searchBox}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Team</p>
              <ul className="space-y-0.5">
                {[{ id: '', name: 'Everyone', is_active: true }, ...staff].map((s) => {
                  const on = staffId === s.id
                  const n = s.id ? (staffCounts.get(s.id) ?? 0) : [...staffCounts.values()].reduce((a, b) => a + b, 0)
                  return (
                    <li key={s.id || 'all'}>
                      <button
                        type="button"
                        onClick={() => setStaffId(s.id)}
                        aria-pressed={on}
                        className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                          on ? 'bg-neutral-900 font-medium text-white' : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        {s.id ? (
                          <span
                            className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[9px] font-bold text-white"
                            style={{ backgroundColor: staffColors.get(s.id) }}
                          >
                            {initials(s.name)}
                          </span>
                        ) : (
                          <span className="grid h-5 w-5 flex-none grid-cols-2 overflow-hidden rounded-full bg-neutral-200">
                            {staff.slice(0, 4).map((x) => (
                              <span key={x.id} style={{ backgroundColor: staffColors.get(x.id) }} />
                            ))}
                          </span>
                        )}
                        <span className={`min-w-0 flex-1 truncate ${s.is_active ? '' : 'opacity-50'}`}>{s.name}</span>
                        <span className={`text-xs tabular-nums ${on ? 'text-white/70' : 'text-neutral-400'}`}>{n}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Status</p>
              {statusChips}
            </div>
          </div>

          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-neutral-400">
            <Keyboard size={14} className="mt-0.5 flex-none" aria-hidden />
            <span>
              <kbd className={kbd}>←</kbd> <kbd className={kbd}>→</kbd> move · <kbd className={kbd}>T</kbd> today ·{' '}
              <kbd className={kbd}>D W M L</kbd> views
            </span>
          </p>
        </aside>

        {/* Main */}
        <div className="min-w-0 space-y-3">
          {/* Tablets: the rail is gone, so search and filters sit above the board. Phones: in a sheet. */}
          <div className="hidden space-y-2.5 sm:block lg:hidden">
            <div className="flex gap-2">
              {searchBox}
              <div className="w-36 flex-none sm:w-48">
                <Select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  aria-label="Filter by staff"
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-3 text-sm text-neutral-800 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
                >
                  <option value="">Everyone</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="w-max">{statusChips}</div>
            </div>
          </div>

          <section className={`${panel} relative overflow-hidden !p-0`} aria-label="Schedule">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2.5 sm:gap-3 sm:px-4">
              <div className="flex items-center">
                <button
                  type="button"
                  className={navBtn}
                  onClick={() => go({ date: step(date, view, -1) })}
                  aria-label={`Previous ${view === 'list' ? `${LIST_DAYS} days` : view}`}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => go({ date: today })}
                  disabled={date === today}
                  className="h-9 rounded-lg px-3 text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:text-neutral-300 disabled:hover:bg-transparent"
                >
                  Today
                </button>
                <button
                  type="button"
                  className={navBtn}
                  onClick={() => go({ date: step(date, view, 1) })}
                  aria-label={`Next ${view === 'list' ? `${LIST_DAYS} days` : view}`}
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(true)}
                aria-haspopup="dialog"
                className={`ml-auto flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:hidden ${
                  filtered ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 active:bg-neutral-100'
                }`}
              >
                <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
                Filter
                {filtered && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-label="(active)" />}
              </button>

              <div className="flex w-full items-center gap-0.5 rounded-lg bg-neutral-100 p-1 sm:order-last sm:ml-auto sm:w-auto" role="group" aria-label="Calendar view">
                {VIEWS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={view === v.value}
                    onClick={() => go({ view: v.value })}
                    className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:min-h-8 sm:flex-none ${
                      view === v.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <p className="w-full text-xs text-neutral-500 sm:w-auto sm:flex-1" aria-live="polite">
                <span className="font-semibold text-neutral-900">{visible.length}</span> booking{visible.length === 1 ? '' : 's'}
                {scheduledValue > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium tabular-nums text-neutral-700">{fmtPeso(scheduledValue)}</span> scheduled
                  </>
                )}
                {(pendingCount > 0 || onlyPending) && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => setStatuses(onlyPending ? new Set(DEFAULT_STATUSES) : new Set(['pending']))}
                      className="rounded font-semibold text-amber-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      {onlyPending ? 'Show all statuses' : `${pendingCount} awaiting confirmation`}
                    </button>
                  </>
                )}
              </p>
            </div>

            {/* A thin bar while another range loads; the previous one stays on screen meanwhile. */}
            {loading && data && (
              <div className="absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden" aria-hidden>
                <div className="calendar-loading h-full w-1/3 bg-brand-500" />
              </div>
            )}

            {(error || base.error) && (
              <div className="border-b border-red-100 bg-red-50 px-4 py-2.5">
                <ErrorText message={error ?? base.error} />
              </div>
            )}

            {firstLoad ? (
              <div className="grid animate-pulse grid-cols-7 gap-px bg-neutral-100" aria-busy="true" aria-label="Loading calendar">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="h-20 bg-white sm:h-24" />
                ))}
              </div>
            ) : view === 'day' || view === 'week' ? (
              <>
                {view === 'day' && <WeekStrip date={date} today={today} counts={counts} onPick={(d) => go({ date: d })} />}
                <TimeGrid
                  columns={columns}
                  hours={hours}
                  workingHours={workingHours}
                  nowMin={nowMin}
                  scrollKey={`${view}:${range.start}`}
                  minColWidth={view === 'week' ? 104 : 168}
                  showStaff={view === 'week' && !staffId}
                  timezone={timezone}
                  staffColors={staffColors}
                  onSelect={setActive}
                />
                {visible.length === 0 && (
                  <p className="flex items-center justify-center gap-2 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-500">
                    <CalendarClock size={16} strokeWidth={1.75} className="text-neutral-400" />
                    {filtered ? 'No bookings match your filters here.' : `No bookings ${view === 'day' ? 'on this day' : 'this week'}.`}
                  </p>
                )}
              </>
            ) : view === 'month' ? (
              <>
                <MonthView
                  date={date}
                  today={today}
                  byDay={byDay}
                  blocked={blocked}
                  workingHours={workingHours}
                  timezone={timezone}
                  onPick={(d) => go({ date: d })}
                  onSelect={setActive}
                />
                {/* The selected day, spelled out — the only way to read a phone's dot-only month */}
                <div className="border-t border-neutral-200 py-2 sm:py-3">
                  <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-1 sm:px-5">
                    <h2 className="text-sm font-semibold text-neutral-900">
                      {dayHeading(date, today)}{' '}
                      <span className="font-normal text-neutral-400">{fmtLocal(date, { month: 'short', day: 'numeric' })}</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => go({ view: 'day' })}
                      className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-brand-600 outline-none hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      Open day <ChevronRight size={14} />
                    </button>
                  </div>
                  {(byDay.get(date) ?? []).length === 0 ? (
                    <p className="px-4 pb-2 pt-1 text-sm text-neutral-500 sm:px-5">No bookings on this day.</p>
                  ) : (
                    <ul>
                      {(byDay.get(date) ?? []).map((e) => (
                        <EventRow key={e.booking.id} e={e} timezone={timezone} staffColors={staffColors} onSelect={setActive} />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="py-1 sm:py-2">
                <DayAgenda
                  days={daysBetween(range.start, range.end)}
                  today={today}
                  byDay={byDay}
                  timezone={timezone}
                  staffColors={staffColors}
                  onSelect={setActive}
                  emptyBody={
                    filtered
                      ? `No bookings in these ${LIST_DAYS} days match your filters.`
                      : `No bookings in these ${LIST_DAYS} days. Share your booking page to fill the calendar.`
                  }
                />
              </div>
            )}
          </section>
        </div>
      </div>

      {active && (
        <BookingDetailsSheet
          booking={active}
          timezone={timezone}
          staffColor={staffColors.get(active.staff_id)}
          onClose={() => setActive(null)}
          onChanged={() => {
            reload()
            setActive(null)
          }}
        />
      )}

      {showFilters && (
        <Modal
          onClose={() => setShowFilters(false)}
          title="Filter calendar"
          titleId="calendar-filters-title"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!filtered}
                onClick={() => {
                  setQ('')
                  setStaffId('')
                  setStatuses(new Set(DEFAULT_STATUSES))
                }}
                className="inline-flex h-11 flex-none items-center rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                Reset
              </button>
              <button type="button" onClick={() => setShowFilters(false)} className={`${actionPrimary} flex-1`}>
                Show {visible.length} booking{visible.length === 1 ? '' : 's'}
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {searchBox}
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Team</p>
              <div className="flex flex-wrap gap-2">
                {[{ id: '', name: 'Everyone' }, ...staff].map((s) => {
                  const on = staffId === s.id
                  return (
                    <button
                      key={s.id || 'all'}
                      type="button"
                      onClick={() => setStaffId(s.id)}
                      aria-pressed={on}
                      className={`flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 active:bg-neutral-50'
                      } ${s.id ? '' : 'pl-3.5'}`}
                    >
                      {s.id && (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: staffColors.get(s.id) }}
                        >
                          {initials(s.name)}
                        </span>
                      )}
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700">Status</p>
              {statusChips}
            </div>
          </div>
        </Modal>
      )}

      <Fab label="Add booking" href={bookingUrl} />
      <div aria-hidden className="h-16 sm:hidden" />
    </div>
  )
}
