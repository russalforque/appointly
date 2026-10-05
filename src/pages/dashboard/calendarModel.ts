// Pure calendar logic for CalendarPage: ranges, positioning and colours. Everything here works on
// business-local 'YYYY-MM-DD' strings and minutes-since-midnight, never on the viewer's own clock.
import { appointmentEnd } from '../../lib/booking'
import { addDays, dayKey, weekStartOf } from '../../lib/format'
import type { BookingRow, BookingStatus, WorkingHours } from '../../lib/types'

export type CalView = 'day' | 'week' | 'month' | 'list'

export const VIEWS: { value: CalView; label: string; key: string }[] = [
  { value: 'day', label: 'Day', key: 'd' },
  { value: 'week', label: 'Week', key: 'w' },
  { value: 'month', label: 'Month', key: 'm' },
  { value: 'list', label: 'List', key: 'l' },
]

export const LIST_DAYS = 30

export const isCalView = (v: string | null): v is CalView => VIEWS.some((x) => x.value === v)

/** A real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-31, which Date would roll over). */
export function isDateKey(v: string | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d)
  return out
}

const lastOfMonth = (date: string) => {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** The Monday-to-Sunday weeks that cover the month containing `date`. */
export function monthGrid(date: string): { start: string; end: string } {
  return { start: weekStartOf(`${date.slice(0, 7)}-01`), end: addDays(weekStartOf(lastOfMonth(date)), 7) }
}

/** The local dates a view shows, as [start, end). */
export function viewRange(date: string, view: CalView): { start: string; end: string } {
  if (view === 'day') return { start: date, end: addDays(date, 1) }
  if (view === 'week') {
    const start = weekStartOf(date)
    return { start, end: addDays(start, 7) }
  }
  if (view === 'month') return monthGrid(date)
  return { start: date, end: addDays(date, LIST_DAYS) }
}

/** Same day-of-month n months away, clamped (Jan 31 + 1 month = Feb 28). */
export function shiftMonth(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, days))
  return first.toISOString().slice(0, 10)
}

export function step(date: string, view: CalView, dir: 1 | -1): string {
  if (view === 'day') return addDays(date, dir)
  if (view === 'week') return addDays(date, 7 * dir)
  if (view === 'month') return shiftMonth(date, dir)
  return addDays(date, LIST_DAYS * dir)
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const dowKey = (date: string) => WEEKDAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

/** 'HH:MM[:SS]' -> minutes since midnight. */
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Minutes since local midnight of an instant, in `tz`. */
export function minutesIn(iso: string | Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(
    new Date(iso),
  )
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return (get('hour') % 24) * 60 + get('minute')
}

/** Open intervals of a date, in minutes. Empty when closed that weekday. */
export function openIntervals(date: string, hours: WorkingHours): [number, number][] {
  return (hours[dowKey(date)] ?? []).map((r) => [toMin(r.start), toMin(r.end)])
}

/** The parts of [from, to) that fall outside `open` — what the grid shades as closed. */
export function closedIntervals(open: [number, number][], from: number, to: number): [number, number][] {
  const out: [number, number][] = []
  let cursor = from
  for (const [s, e] of [...open].sort((a, b) => a[0] - b[0])) {
    if (s > cursor) out.push([cursor, Math.min(s, to)])
    cursor = Math.max(cursor, e)
  }
  if (cursor < to) out.push([cursor, to])
  return out.filter(([s, e]) => e > s)
}

export interface CalEvent {
  booking: BookingRow
  day: string
  /** Minutes since local midnight. */
  start: number
  /** End of the appointment itself. */
  end: number
  /** End of the time the booking blocks, buffers included (bookings.end_at). */
  blockedEnd: number
}

export function toEvent(b: BookingRow, tz: string): CalEvent {
  const start = minutesIn(b.start_at, tz)
  const t0 = new Date(b.start_at).getTime()
  const minutesTo = (iso: string) => Math.round((new Date(iso).getTime() - t0) / 60_000)
  return {
    booking: b,
    day: dayKey(b.start_at, tz),
    start,
    // Measured as durations rather than clock readings, so nothing wraps past midnight.
    end: Math.min(1440, start + minutesTo(appointmentEnd(b))),
    blockedEnd: Math.min(1440, start + minutesTo(b.end_at)),
  }
}

export interface Placed extends CalEvent {
  lane: number
  lanes: number
}

/** Shortest block the grid draws, so a 10-minute booking stays tappable. */
export const MIN_BLOCK_MINUTES = 22

/**
 * Side-by-side lanes for bookings that overlap within one column. Bookings for one staff member
 * cannot overlap while active (the exclusion constraint), but a week column holds every staff
 * member, and a finished booking can sit under a new one.
 */
export function layoutColumn(events: CalEvent[]): Placed[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.blockedEnd - a.blockedEnd)
  const visEnd = (e: CalEvent) => Math.max(e.blockedEnd, e.start + MIN_BLOCK_MINUTES)
  const out: Placed[] = []
  let cluster: Placed[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1

  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length
    out.push(...cluster)
    cluster = []
    laneEnds = []
  }

  for (const e of sorted) {
    if (e.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= e.start)
    if (lane === -1) lane = laneEnds.push(0) - 1
    laneEnds[lane] = visEnd(e)
    clusterEnd = Math.max(clusterEnd, visEnd(e))
    cluster.push({ ...e, lane, lanes: 1 })
  }
  flush()
  return out
}

/** Whole hours the time grid spans: opening hours and bookings of the shown days, 8–18 by default. */
export function hourBounds(days: string[], hours: WorkingHours, events: CalEvent[]): { from: number; to: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const d of days) {
    for (const [s, e] of openIntervals(d, hours)) {
      lo = Math.min(lo, s)
      hi = Math.max(hi, e)
    }
  }
  for (const e of events) {
    lo = Math.min(lo, e.start)
    hi = Math.max(hi, e.blockedEnd)
  }
  if (lo === Infinity) return { from: 8, to: 18 }
  // At least four hours tall, so a short day still reads as a schedule.
  const to = Math.min(24, Math.max(Math.ceil(hi / 60), Math.floor(lo / 60) + 4))
  const from = Math.max(0, Math.min(Math.floor(lo / 60), to - 4))
  return { from, to }
}

/** Status styling. Literal class strings so Tailwind can see them. */
export const STATUS_META: Record<
  BookingStatus,
  { label: string; block: string; dot: string; chip: string; chipOn: string }
> = {
  pending: {
    label: 'Pending',
    block: 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100/80 [background-image:repeating-linear-gradient(135deg,rgb(251_191_36/0.12)_0_6px,transparent_6px_12px)]',
    dot: 'bg-amber-500',
    chip: 'text-amber-700',
    chipOn: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  confirmed: {
    label: 'Confirmed',
    block: 'border-brand-500 bg-brand-50 text-brand-900 hover:bg-brand-100/80',
    dot: 'bg-brand-500',
    chip: 'text-brand-700',
    chipOn: 'border-brand-300 bg-brand-50 text-brand-800',
  },
  completed: {
    label: 'Completed',
    block: 'border-emerald-500 bg-emerald-50 text-emerald-950 hover:bg-emerald-100/80',
    dot: 'bg-emerald-500',
    chip: 'text-emerald-700',
    chipOn: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  no_show: {
    label: 'No-show',
    block: 'border-red-400 bg-red-50 text-red-950 hover:bg-red-100/80',
    dot: 'bg-red-500',
    chip: 'text-red-700',
    chipOn: 'border-red-300 bg-red-50 text-red-800',
  },
  cancelled: {
    label: 'Cancelled',
    block: 'border-neutral-300 bg-neutral-100 text-neutral-500 line-through decoration-neutral-400 hover:bg-neutral-200/70',
    dot: 'bg-neutral-400',
    chip: 'text-neutral-500',
    chipOn: 'border-neutral-300 bg-neutral-100 text-neutral-700',
  },
}

export const STATUS_ORDER: BookingStatus[] = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled']

/** Per-person colours, assigned by position in the name-sorted staff list so they stay put. */
const STAFF_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#84cc16']
export const staffColor = (index: number) => STAFF_COLORS[((index % STAFF_COLORS.length) + STAFF_COLORS.length) % STAFF_COLORS.length]

/** Minutes since midnight -> '9:30 AM'. */
export function clockLabel(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`
}
