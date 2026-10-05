// Dates are 'YYYY-MM-DD' strings; instants are ISO timestamps rendered in the business timezone.

export const dayKey = (iso: string | Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

export const todayIn = (tz: string) => dayKey(new Date(), tz)

export const fmtTime = (iso: string | Date, tz: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export const fmtDateTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export const fmtDay = (date: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00Z`))

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 'Today' / 'Tomorrow' / 'Yesterday', otherwise 'Mon, Oct 12' — how people scan a list of days. */
export const relativeDay = (date: string, today: string) =>
  date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : fmtDay(date)

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((dow + 6) % 7))
}

/** UTC instant range covering local dates [from, to), padded a day each side; filter with dayKey afterwards. */
export const paddedRange = (from: string, to: string) => ({
  from: `${addDays(from, -1)}T00:00:00Z`,
  to: `${addDays(to, 1)}T00:00:00Z`,
})

export const fmtFull = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/** 'HH:MM[:SS]' -> '9:00 AM'. */
export const fmtClock = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** Minutes as a readable duration, e.g. 90 -> "1 hr 30 min". */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

/** Price in pesos, e.g. 500 -> "₱500", 499.5 -> "₱499.50". */
export const fmtPeso = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`

/** Up to 2 initials from a display name, for avatar badges. */
export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'

/** Short relative age for feeds, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function fmtRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return `${Math.round(days / 30)}mo ago`
}
