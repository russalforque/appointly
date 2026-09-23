import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock,
  Mail, MapPin, Phone, Search, Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { createBooking, getAvailableSlots, type Slot } from '../../lib/booking'
import { addDays, fmtClock, fmtDuration, fmtPeso, fmtTime, todayIn } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { usePageMeta } from '../../lib/usePageMeta'
import type { Business, Service, Staff, WorkingHours } from '../../lib/types'

// Anonymous users may only read these staff columns (see 0005_security_hardening.sql)
type PublicStaff = Pick<Staff, 'id' | 'business_id' | 'name' | 'avatar_url' | 'position' | 'is_active'>
import Reveal from '../../components/Reveal'
import { ErrorText, Loading } from '../../components/Status'

interface Catalog {
  business: Business
  timezone: string
  maxAdvanceDays: number
  workingHours: WorkingHours
  services: Service[]
  staff: PublicStaff[]
  links: { staff_id: string; service_id: string }[]
}

const DAY_LABELS: [string, string][] = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
]

const field =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10'
const fieldError =
  'w-full rounded-xl border border-red-400 bg-white px-4 py-3 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'

/** Selectable card: selection is shown by border, tint, weight and a check mark — never colour alone. */
const choice = (selected: boolean) =>
  `relative w-full rounded-2xl border p-4 pr-12 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 ${
    selected ? 'border-2 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
  }`

const SUN_FIRST = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const dowKey = (date: string) => SUN_FIRST[new Date(`${date}T00:00:00Z`).getUTCDay()]
const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`
const daysInMonth = (date: string) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate()
function shiftMonth(date: string, n: number): string {
  const d = new Date(`${firstOfMonth(date)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
const monthLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`))
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T00:00:00Z`))
/** Weekday + date, without the year — the confirmation line people actually read. */
const shortDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00Z`))
/** Hour of an instant in the business timezone, for grouping slots into parts of the day. */
const hourIn = (iso: string, tz: string) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(iso))) % 24

type StepKey = 'service' | 'staff' | 'datetime' | 'details'
const STEP_TITLES: Record<StepKey, string> = {
  service: 'Choose a service',
  staff: 'Choose staff',
  datetime: 'Pick a date and time',
  details: 'Your details',
}
const STEP_LABELS: Record<StepKey, string> = {
  service: 'Service',
  staff: 'Staff',
  datetime: 'Date & Time',
  details: 'Your details',
}
const STEP_HINTS: Record<StepKey, string> = {
  service: 'Pick what you would like to book.',
  staff: 'Book with someone specific, or take the first available.',
  datetime: 'Choose a day, then an open time.',
  details: 'Check your appointment and tell us how to reach you.',
}

/** Quiet "where am I" indicator: a labelled track on every size, never the loudest thing on screen. */
function StepProgress({ current, labels, accentStyle }: { current: number; labels: string[]; accentStyle: React.CSSProperties }) {
  const total = labels.length
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">
          Step {current} of {total}
          <span className="text-slate-300"> · </span>
          <span className="text-slate-900">{labels[current - 1]}</span>
        </p>
        <ol className="hidden items-center gap-1.5 text-[11px] font-medium sm:flex">
          {labels.map((label, i) => (
            <li key={label} className={i + 1 === current ? 'text-slate-900' : 'text-slate-400'}>
              {label}
              {i < total - 1 && <span className="px-1.5 text-slate-300">›</span>}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {labels.map((label, i) => (
          <span
            key={label}
            style={i < current ? accentStyle : undefined}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < current ? '' : 'bg-slate-200'}`}
          />
        ))}
      </div>
    </div>
  )
}

function Initials({ name, className }: { name: string; className: string }) {
  return (
    <span className={`grid place-items-center rounded-full bg-slate-100 font-semibold text-slate-500 ${className}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * Month calendar limited to the bookable window. Days outside it, and days the business is
 * closed, are rendered as disabled so the customer never picks a date with nothing on it.
 */
function DatePicker({
  value, onSelect, today, maxDate, workingHours, accent,
}: {
  value: string
  onSelect: (date: string) => void
  today: string
  maxDate: string
  workingHours: WorkingHours
  accent: string
}) {
  const [cursor, setCursor] = useState(() => firstOfMonth(value || today))
  const month = cursor.slice(0, 7)
  const lead = new Date(`${cursor}T00:00:00Z`).getUTCDay()
  const total = daysInMonth(cursor)
  const canGoBack = month > today.slice(0, 7)
  const canGoForward = month < maxDate.slice(0, 7)
  // Only grey out weekdays when the business actually published hours — otherwise trust the slot lookup.
  const hasHours = Object.values(workingHours).some((h) => h?.length)
  const unavailable = (date: string) =>
    date < today || date > maxDate || (hasHours && !workingHours[dowKey(date)]?.length)

  const navBtn =
    'grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300'

  return (
    <div className="rounded-2xl border border-slate-200 p-2 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={navBtn} onClick={() => setCursor(shiftMonth(cursor, -1))} disabled={!canGoBack} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <p aria-live="polite" className="text-sm font-semibold text-slate-900">{monthLabel(cursor)}</p>
        <button type="button" className={navBtn} onClick={() => setCursor(shiftMonth(cursor, 1))} disabled={!canGoForward} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
        {WEEKDAY_INITIALS.map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <span key={`pad-${i}`} />)}
        {Array.from({ length: total }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`
          const off = unavailable(date)
          const selected = date === value
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              disabled={off}
              aria-pressed={selected}
              aria-label={`${dayLabel(date)}${off ? ' — unavailable' : ''}`}
              onClick={() => onSelect(date)}
              style={selected ? { backgroundColor: accent, borderColor: accent } : undefined}
              className={`relative grid aspect-square min-h-11 place-items-center rounded-xl border text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 ${
                selected
                  ? 'border font-semibold text-white'
                  : off
                    ? 'cursor-not-allowed border-transparent text-slate-300 line-through decoration-slate-300'
                    : 'border-slate-200 font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              {i + 1}
              {isToday && !selected && (
                <span style={{ backgroundColor: accent }} className="absolute bottom-1.5 h-1 w-1 rounded-full" />
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Crossed-out days are unavailable.</p>
    </div>
  )
}

/** One labelled line of the booking summary — label above value, value carrying the weight. */
function SummaryRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[13px] text-slate-500">{label}</dt>
      <dd className="text-right text-[13px] font-medium text-slate-900">
        {value}
        {sub && <span className="block text-[12px] font-normal text-slate-500">{sub}</span>}
      </dd>
    </div>
  )
}

function Booker({ catalog }: { catalog: Catalog }) {
  const { business, timezone, maxAdvanceDays, workingHours, services, staff, links } = catalog
  const accent = business.accent_color || '#0f172a'
  const accentSolid = { backgroundColor: accent }
  const accentText = { color: accent }
  const accentTint = { backgroundColor: `color-mix(in srgb, ${accent} 10%, white)` }
  const todayKey = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date()).toLowerCase().slice(0, 3)
  const navigate = useNavigate()

  // The only page of Appointly a customer ever finds through search or a shared link, so it
  // carries the business's own name. Nothing private goes in here: name, category and the
  // public description are already on the page itself.
  usePageMeta({
    title: `Book an appointment with ${business.name} | Appointly`,
    description:
      business.description?.trim() ||
      `Book an appointment with ${business.name} online. Choose a service, pick a time that suits you, and confirm in a few taps.`,
    image: business.logo_url ?? undefined,
  })

  const [serviceId, setServiceId] = useState('')
  const [staffId, setStaffId] = useState('') // '' = any available
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; contact?: string }>({})
  const [slotTaken, setSlotTaken] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [step, setStep] = useState<StepKey>('service')
  const [serviceQuery, setServiceQuery] = useState('')
  const [details, setDetails] = useState({ name: '', email: '', phone: '', notes: '' })
  const setDetail = (k: keyof typeof details) => (e: { target: { value: string } }) =>
    setDetails((d) => ({ ...d, [k]: e.target.value }))

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const today = todayIn(timezone)
  const staffFor = (sid: string) => staff.filter((s) => links.some((l) => l.staff_id === s.id && l.service_id === sid))
  const offering = staffFor(serviceId)
  const bookable = services.filter((s) => staffFor(s.id).length > 0) // hide services nobody can perform
  const service = services.find((s) => s.id === serviceId)
  const chosenStaff = staff.find((s) => s.id === staffId)
  const askStaff = offering.length > 1 // a single provider is auto-selected

  const loadSlots = useCallback(
    async (): Promise<Slot[]> => (serviceId && date ? getAvailableSlots(serviceId, date, staffId || undefined) : []),
    [serviceId, date, staffId],
  )
  const { data: slots, loading: slotsLoading, error: slotsError, reload } = useLoad(loadSlots)
  const times = [...new Set((slots ?? []).map((s) => s.start_at))]
  const timeGroups = [
    { label: 'Morning', items: times.filter((t) => hourIn(t, timezone) < 12) },
    { label: 'Afternoon', items: times.filter((t) => hourIn(t, timezone) >= 12 && hourIn(t, timezone) < 17) },
    { label: 'Evening', items: times.filter((t) => hourIn(t, timezone) >= 17) },
  ].filter((g) => g.items.length > 0)

  const stepKeys: StepKey[] = askStaff ? ['service', 'staff', 'datetime', 'details'] : ['service', 'datetime', 'details']
  const progressLabels = stepKeys.map((k) => STEP_LABELS[k])
  const currentIndex = stepKeys.indexOf(step) + 1
  const showServiceSearch = bookable.length > 6
  const filteredBookable = serviceQuery.trim()
    ? bookable.filter((s) => {
        const q = serviceQuery.trim().toLowerCase()
        return s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
      })
    : bookable

  function selectService(id: string) {
    const o = staffFor(id)
    setServiceId(id)
    setStaffId(o.length === 1 ? o[0].id : '')
    setSlot('')
    setStep(o.length > 1 ? 'staff' : 'datetime')
  }

  function selectStaff(id: string) {
    setStaffId(id)
    setSlot('')
    setStep('datetime')
  }

  function selectSlot(t: string) {
    setSlot(t)
    setSlotTaken(false)
    setStep('details')
  }

  function goBack() {
    const idx = stepKeys.indexOf(step)
    if (idx > 0) setStep(stepKeys[idx - 1])
  }

  function pickService(id: string) {
    selectService(id)
    document.getElementById('book-flow')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const name = details.name.trim()
    const email = details.email.trim()
    const phone = details.phone.trim()
    const notes = details.notes.trim()
    const errs: { name?: string; contact?: string } = {}
    if (!name) errs.name = 'Please enter your name.'
    if (!email && !phone) errs.contact = 'Add an email or a phone number so we can reach you.'
    setFieldErrors(errs)
    if (errs.name || errs.contact) return
    setBusy(true)
    setFormError(null)
    try {
      const r = await createBooking({
        serviceId,
        start: slot,
        staffId: staffId || undefined,
        name,
        email: email || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
      })
      navigate(`/booking/${r.public_token}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Booking failed'
      if (msg.includes('no longer available')) {
        setSlotTaken(true)
        setFormError(null)
        setSlot('')
        setStep('datetime')
        reload()
        document.getElementById('book-flow')?.scrollIntoView({ behavior: 'smooth' })
      } else {
        setFormError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  // The same summary serves the desktop sidebar and the mobile review step above the CTA.
  const summaryCard = (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
      <h3 className="text-sm font-semibold text-slate-900">Booking summary</h3>
      {!service ? (
        <p className="mt-3 text-[13px] text-slate-500">Your selections will appear here as you go.</p>
      ) : (
        <>
          <dl className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <SummaryRow label="Service" value={service.name} />
            {askStaff && <SummaryRow label="Staff" value={chosenStaff?.name ?? 'Any available'} sub={chosenStaff?.position ?? undefined} />}
            <SummaryRow label="Date" value={date ? shortDate(date) : 'Not selected'} />
            <SummaryRow label="Time" value={slot ? fmtTime(slot, timezone) : 'Not selected'} />
            <SummaryRow label="Duration" value={fmtDuration(service.duration_minutes)} />
          </dl>
          {service.price !== null && (
            <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
              <span className="text-[13px] font-medium text-slate-600">Price</span>
              <span className="text-lg font-semibold text-slate-900">{fmtPeso(service.price)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )

  const bookNowBtn = (extra = '') => (
    <a
      href="#book-flow"
      style={accentSolid}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-200 hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] ${extra}`}
    >
      <Calendar size={16} /> Book Appointment
    </a>
  )

  return (
    <div className="font-site bg-white text-slate-900">
      {/* Header */}
      <header
        className={`sticky top-0 z-20 border-b bg-white/80 backdrop-blur-md transition-shadow duration-300 ${
          scrolled ? 'border-slate-200 shadow-sm' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {business.logo_url ? (
              <img src={business.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <Initials name={business.name} className="h-10 w-10 shrink-0 text-sm" />
            )}
            <span className="font-display truncate text-base font-semibold sm:text-lg">{business.name}</span>
          </div>
          <a
            href="#book-flow"
            style={accentSolid}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:px-5 sm:py-2.5 sm:text-sm"
          >
            Book Appointment
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate flex min-h-[24rem] items-center justify-center overflow-hidden bg-slate-900 px-4 py-16 text-center sm:min-h-[34rem] sm:py-24">
        {business.cover_image_url && (
          <img src={business.cover_image_url} alt="" className="absolute inset-0 -z-10 h-full w-full scale-105 object-cover" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />
        <div className="mx-auto max-w-2xl animate-[reveal-up_0.7s_cubic-bezier(0.16,1,0.3,1)_forwards] space-y-6 opacity-0">
          {business.category && (
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/75">{business.category}</p>
          )}
          <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-6xl">{business.name}</h1>
          {business.description && (
            <p className="mx-auto max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">{business.description}</p>
          )}
          <div className="pt-3">{bookNowBtn()}</div>
        </div>
        <a
          href="#services-anchor"
          aria-label="Scroll to services"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce text-white/60 transition-colors hover:text-white/90"
        >
          <ChevronDown size={22} />
        </a>
      </section>

      <main>
        <span id="services-anchor" className="block scroll-mt-16" />
        {/* Services */}
        {bookable.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <Reveal className="mx-auto mb-14 max-w-xl text-center">
              <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Our Services</h2>
              <p className="mt-3 text-slate-500">Choose from what we offer and book in a few clicks.</p>
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {bookable.map((s, i) => (
                <Reveal key={s.id} delay={i * 60} className="h-full">
                  <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5">
                    {s.image_url && (
                      <div className="relative h-44 w-full overflow-hidden">
                        <img
                          src={s.image_url}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                        />
                        {s.price !== null && (
                          <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm">
                            {fmtPeso(s.price)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-1 flex-col justify-between p-6">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg font-semibold">{s.name}</h3>
                          {!s.image_url && s.price !== null && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-900">
                              {fmtPeso(s.price)}
                            </span>
                          )}
                        </div>
                        {s.description && <p className="text-sm leading-relaxed text-slate-500">{s.description}</p>}
                        <span className="inline-flex items-center gap-1 pt-1 text-sm text-slate-500">
                          <Clock size={14} /> {s.duration_minutes} min
                        </span>
                      </div>
                      <button
                        onClick={() => pickService(s.id)}
                        style={accentSolid}
                        className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                      >
                        Book now
                      </button>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Team */}
        {staff.length > 0 && (
          <section className="bg-slate-50 px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-6xl">
              <Reveal className="mx-auto mb-14 max-w-xl text-center">
                <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Meet Our Team</h2>
                <p className="mt-3 text-slate-500">The people behind every appointment.</p>
              </Reveal>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                {staff.map((m, i) => (
                  <Reveal key={m.id} delay={i * 50}>
                    <div className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:gap-4 sm:p-6">
                      <div className="relative">
                        <div
                          className="absolute -inset-1 rounded-full opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-100"
                          style={accentSolid}
                        />
                        {m.avatar_url ? (
                          <img
                            src={m.avatar_url}
                            alt=""
                            className="relative h-16 w-16 rounded-full object-cover ring-4 ring-white sm:h-20 sm:w-20 lg:h-24 lg:w-24"
                          />
                        ) : (
                          <Initials name={m.name} className="relative h-16 w-16 text-lg ring-4 ring-white sm:h-20 sm:w-20 sm:text-xl lg:h-24 lg:w-24 lg:text-2xl" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{m.name}</p>
                        {m.position && (
                          <span
                            className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium"
                            style={{ ...accentTint, ...accentText }}
                          >
                            {m.position}
                          </span>
                        )}
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* About */}
        {business.about && (
          <Reveal as="div" className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">About {business.name}</h2>
            <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-slate-600">{business.about}</p>
          </Reveal>
        )}

        {/* Contact + Hours */}
        {(business.address || business.phone || business.email || Object.keys(workingHours).length > 0) && (
          <section className="border-t border-slate-200 bg-slate-50 px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-2 sm:gap-16">
              <Reveal>
                <h2 className="font-display text-2xl font-medium tracking-tight">Contact</h2>
                <ul className="mt-6 space-y-4 text-sm text-slate-600">
                  {business.address && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <MapPin size={16} style={accentText} />
                      </span>
                      <span className="pt-1.5">{business.address}</span>
                    </li>
                  )}
                  {business.phone && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <Phone size={16} style={accentText} />
                      </span>
                      <span className="pt-1.5">{business.phone}</span>
                    </li>
                  )}
                  {business.email && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <Mail size={16} style={accentText} />
                      </span>
                      <span className="pt-1.5">{business.email}</span>
                    </li>
                  )}
                </ul>
              </Reveal>
              <Reveal delay={80}>
                <h2 className="font-display text-2xl font-medium tracking-tight">Business Hours</h2>
                <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
                  {DAY_LABELS.map(([k, label]) => {
                    const hours = workingHours[k]
                    const isOpen = !!hours?.length
                    const isToday = k === todayKey
                    return (
                      <li
                        key={k}
                        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 ${isToday ? 'bg-slate-50' : ''}`}
                        style={isToday ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                      >
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className={`font-medium ${isToday ? 'text-slate-900' : 'text-slate-700'}`}>{label}</span>
                          {isToday && (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ ...accentTint, ...accentText }}>
                              Today
                            </span>
                          )}
                        </span>
                        <span className={`text-right ${isOpen ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isOpen ? hours.map((h) => `${fmtClock(h.start)} – ${fmtClock(h.end)}`).join(', ') : 'Closed'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Reveal>
            </div>
          </section>
        )}

        {/* Booking flow — one step at a time on the left, a running summary alongside it */}
        <section id="book-flow" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
          <Reveal className="mb-8 text-center sm:mb-10">
            <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Book an Appointment</h2>
            <p className="mt-3 text-slate-500">Pick a service, choose a time, and you're all set.</p>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
              <StepProgress current={currentIndex} labels={progressLabels} accentStyle={accentSolid} />

              <div key={step} className="animate-[reveal-up_0.3s_ease-out_forwards] space-y-4">
                {step !== 'service' && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10"
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                )}

                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">{STEP_TITLES[step]}</h3>
                  <p className="mt-1 text-sm text-slate-500">{STEP_HINTS[step]}</p>
                </div>

                {step === 'service' && (
                  <div className="space-y-3">
                    {bookable.length === 0 && <p className="text-sm text-slate-500">No services available right now.</p>}
                    {showServiceSearch && (
                      <div className="relative">
                        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={serviceQuery}
                          onChange={(e) => setServiceQuery(e.target.value)}
                          placeholder="Search services…"
                          aria-label="Search services"
                          className={`${field} pl-10!`}
                        />
                      </div>
                    )}
                    {bookable.length > 0 && filteredBookable.length === 0 ? (
                      <p className="text-sm text-slate-500">No services match "{serviceQuery}".</p>
                    ) : (
                      <div className={`grid gap-2.5 sm:grid-cols-2 ${showServiceSearch ? 'max-h-112 overflow-y-auto pr-1' : ''}`}>
                        {filteredBookable.map((s) => {
                          const on = serviceId === s.id
                          return (
                            <button
                              key={s.id}
                              type="button"
                              aria-pressed={on}
                              className={choice(on)}
                              style={on ? { borderColor: accent } : undefined}
                              onClick={() => selectService(s.id)}
                            >
                              {on && (
                                <span style={accentSolid} className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full text-white">
                                  <Check size={14} strokeWidth={3} />
                                </span>
                              )}
                              <span className="block font-semibold text-slate-900">{s.name}</span>
                              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={13} className="text-slate-400" /> {fmtDuration(s.duration_minutes)}
                                </span>
                                {s.price !== null && <span className="font-semibold text-slate-900">{fmtPeso(s.price)}</span>}
                              </span>
                              {s.description && <span className="mt-1.5 line-clamp-2 block text-[13px] leading-relaxed text-slate-500">{s.description}</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {step === 'staff' && (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[{ id: '', name: 'Any available', position: 'First open time', avatar_url: null }, ...offering].map((s) => {
                      const on = staffId === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          className={`${choice(on)} flex items-center gap-3`}
                          style={on ? { borderColor: accent } : undefined}
                          onClick={() => selectStaff(s.id)}
                        >
                          {on && (
                            <span style={accentSolid} className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-white">
                              <Check size={14} strokeWidth={3} />
                            </span>
                          )}
                          {s.id === '' ? (
                            <span style={accentTint} className="grid h-11 w-11 shrink-0 place-items-center rounded-full">
                              <Users size={18} style={accentText} />
                            </span>
                          ) : s.avatar_url ? (
                            <img src={s.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                          ) : (
                            <Initials name={s.name} className="h-11 w-11 shrink-0 text-sm" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900">{s.name}</span>
                            {s.position && <span className="block truncate text-[13px] text-slate-500">{s.position}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {step === 'datetime' && (
                  <div className="space-y-5">
                    {slotTaken && (
                      <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                        <AlertCircle size={16} className="mt-px shrink-0" />
                        That time was just taken by someone else. Please pick another time below.
                      </p>
                    )}

                    <DatePicker
                      value={date}
                      onSelect={(d) => { setDate(d); setSlot(''); setSlotTaken(false) }}
                      today={today}
                      maxDate={addDays(today, maxAdvanceDays)}
                      workingHours={workingHours}
                      accent={accent}
                    />

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        Available times{date && <span className="font-normal text-slate-500"> · {shortDate(date)}</span>}
                      </h4>
                      {!date ? (
                        <p className="mt-2 text-sm text-slate-500">Select a date to see available times.</p>
                      ) : slotsLoading ? (
                        <p className="mt-2 text-sm text-slate-500">Loading times…</p>
                      ) : (
                        <>
                          <ErrorText message={slotsError} />
                          {!slotsError && times.length === 0 && (
                            <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                              No times left on this date. Try another day on the calendar above.
                            </p>
                          )}
                          <div className="mt-3 space-y-4">
                            {timeGroups.map((g) => (
                              <div key={g.label}>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                                  {g.items.map((t) => {
                                    const on = slot === t
                                    return (
                                      <button
                                        key={t}
                                        type="button"
                                        aria-pressed={on}
                                        style={on ? { backgroundColor: accent, borderColor: accent } : undefined}
                                        className={`min-h-11 rounded-xl border px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 ${
                                          on ? 'font-semibold text-white' : 'border-slate-200 font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                        }`}
                                        onClick={() => selectSlot(t)}
                                      >
                                        {fmtTime(t, timezone)}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                          {times.length > 0 && <p className="mt-3 text-xs text-slate-500">Times shown in {timezone}.</p>}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {step === 'details' && slot && (
                  <form onSubmit={submit} noValidate className="space-y-4">
                    <div>
                      <label htmlFor="bk-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                        Full name <span className="font-normal text-slate-400">(required)</span>
                      </label>
                      <input
                        id="bk-name"
                        name="name"
                        maxLength={100}
                        autoComplete="name"
                        value={details.name}
                        onChange={setDetail('name')}
                        aria-invalid={!!fieldErrors.name}
                        aria-describedby={fieldErrors.name ? 'bk-name-err' : undefined}
                        className={fieldErrors.name ? fieldError : field}
                      />
                      {fieldErrors.name && (
                        <p id="bk-name-err" className="mt-1.5 flex items-center gap-1.5 text-[13px] text-red-600">
                          <AlertCircle size={14} className="shrink-0" /> {fieldErrors.name}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="bk-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                        <input
                          id="bk-email"
                          name="email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={details.email}
                          onChange={setDetail('email')}
                          aria-invalid={!!fieldErrors.contact}
                          aria-describedby="bk-contact-hint"
                          className={fieldErrors.contact ? fieldError : field}
                        />
                      </div>
                      <div>
                        <label htmlFor="bk-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
                        <input
                          id="bk-phone"
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          maxLength={30}
                          autoComplete="tel"
                          value={details.phone}
                          onChange={setDetail('phone')}
                          aria-invalid={!!fieldErrors.contact}
                          aria-describedby="bk-contact-hint"
                          className={fieldErrors.contact ? fieldError : field}
                        />
                      </div>
                    </div>
                    <p
                      id="bk-contact-hint"
                      className={`flex items-center gap-1.5 text-[13px] ${fieldErrors.contact ? 'text-red-600' : 'text-slate-500'}`}
                    >
                      {fieldErrors.contact && <AlertCircle size={14} className="shrink-0" />}
                      {fieldErrors.contact ?? 'Add at least one of the two so we can confirm your appointment.'}
                    </p>

                    <div>
                      <label htmlFor="bk-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
                        Notes <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <textarea
                        id="bk-notes"
                        name="notes"
                        rows={3}
                        maxLength={500}
                        value={details.notes}
                        onChange={setDetail('notes')}
                        placeholder="Anything we should know before your visit?"
                        className={field}
                      />
                    </div>

                    <div className="lg:hidden">{summaryCard}</div>

                    <ErrorText message={formError} />

                    <button
                      style={accentSolid}
                      className="min-h-13 w-full rounded-full px-6 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busy}
                      aria-busy={busy}
                    >
                      {busy ? 'Confirming…' : 'Confirm Appointment'}
                    </button>
                    <p className="text-center text-xs text-slate-500">You'll get a confirmation with all the details.</p>
                  </form>
                )}
              </div>
            </div>

            <aside className="hidden lg:sticky lg:top-24 lg:block">{summaryCard}</aside>
          </div>
        </section>

        {/* Final CTA */}
        <Reveal as="div" className="px-4 py-20 sm:px-6 sm:py-24" style={{ backgroundColor: accent } as React.CSSProperties}>
          <div className="mx-auto max-w-2xl text-center text-white">
            <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Ready to book?</h2>
            <p className="mt-3 text-white/85">Choose a service and schedule your appointment.</p>
            <a
              href="#book-flow"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold shadow-sm transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={accentText}
            >
              <Calendar size={16} /> Book Appointment
            </a>
          </div>
        </Reveal>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="font-display text-lg font-medium">{business.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {[business.address, business.phone, business.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          <a
            href="#book-flow"
            style={accentSolid}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
          >
            Book Appointment
          </a>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {business.name}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}

export default function BookingPage() {
  const { slug = '' } = useParams()
  const load = useCallback(async (): Promise<Catalog | null> => {
    const business = await unwrap<Business | null>(supabase.from('businesses').select('*').eq('slug', slug).maybeSingle())
    if (!business) return null
    const [settings, services, staff, links] = await Promise.all([
      unwrap<{ timezone: string; max_advance_days: number; working_hours: WorkingHours }>(
        supabase.from('business_settings').select('timezone, max_advance_days, working_hours').eq('business_id', business.id).single(),
      ),
      unwrap<Service[]>(supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('name')),
      unwrap<PublicStaff[]>(supabase.from('staff').select('id, business_id, name, avatar_url, position, is_active').eq('business_id', business.id).eq('is_active', true).order('name')),
      unwrap<{ staff_id: string; service_id: string }[]>(
        supabase.from('staff_services').select('staff_id, service_id').eq('business_id', business.id),
      ),
    ])
    return {
      business,
      timezone: settings.timezone,
      maxAdvanceDays: settings.max_advance_days,
      workingHours: settings.working_hours,
      services,
      staff,
      links,
    }
  }, [slug])
  const { data, loading, error } = useLoad(load)

  if (loading) return <Loading />
  if (error) return <ErrorText message={error} />
  if (!data) return <p className="p-6 text-center text-slate-600">This booking page doesn't exist.</p>
  return <Booker catalog={data} />
}
