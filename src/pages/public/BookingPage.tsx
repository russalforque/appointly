import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, ArrowUpRight, Calendar, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock,
  EyeOff, Globe, Info, Mail, MapPin, Phone, Search, Sparkles, UserRound, Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { createBooking, getAvailableSlots, type Slot } from '../../lib/booking'
import { addDays, fmtClock, fmtDuration, fmtPeso, fmtTime, todayIn } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { usePageMeta } from '../../lib/usePageMeta'
import type { Service, Staff, WorkingHours } from '../../lib/types'
import { POLICY_FIELDS, directionsUrl, displayUrl, fullAddress, type PublicBusiness } from '../../lib/publicBusiness'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '../../components/SocialIcons'

// The staff columns get_public_staff() exposes (see 0026_security_audit.sql)
type PublicStaff = Pick<Staff, 'id' | 'business_id' | 'name' | 'avatar_url' | 'position' | 'is_active'>
import Reveal from '../../components/Reveal'
import { ErrorState, ErrorText, NotFoundPage } from '../../components/Status'

interface Catalog {
  business: PublicBusiness
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
const STEP_HINTS: Record<StepKey, string> = {
  service: 'Pick what you would like to book.',
  staff: 'Book with someone specific, or take the first available.',
  datetime: 'Choose a day, then an open time.',
  details: 'Tell us how to reach you and you’re done.',
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
    <div>
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="font-display text-lg font-medium text-slate-900">{monthLabel(cursor)}</p>
        <div className="flex items-center gap-1">
          <button type="button" className={navBtn} onClick={() => setCursor(shiftMonth(cursor, -1))} disabled={!canGoBack} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className={navBtn} onClick={() => setCursor(shiftMonth(cursor, 1))} disabled={!canGoForward} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400" aria-hidden="true">
        {WEEKDAY_INITIALS.map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-0.5 xs:gap-1">
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
              className={`relative grid aspect-square w-full place-items-center rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 ${
                selected
                  ? 'border font-semibold text-white shadow-md'
                  : off
                    ? 'cursor-not-allowed border-transparent text-slate-300 line-through decoration-slate-300'
                    : 'border-transparent bg-slate-100 font-semibold text-slate-800 hover:border-slate-400 hover:bg-white'
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
      <p className="mt-3 text-xs text-slate-500">Shaded days are open. Crossed-out days are unavailable.</p>
    </div>
  )
}

/** One line of the appointment ticket: icon, label, and the value carrying the weight. */
function SummaryRow({ icon: Icon, label, value, sub, empty }: {
  icon: typeof Clock
  label: string
  value: string
  sub?: string
  empty?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className={`truncate text-sm ${empty ? 'text-slate-400' : 'font-medium text-slate-900'}`}>
          {value}
          {sub && <span className="block truncate text-[12px] font-normal text-slate-500">{sub}</span>}
        </dd>
      </div>
    </div>
  )
}

function Booker({ catalog }: { catalog: Catalog }) {
  const { business, services, staff, links } = catalog
  const { timezone, max_advance_days: maxAdvanceDays, working_hours: workingHours } = business
  const address = fullAddress(business)
  const directions = directionsUrl(business.maps_url, address)
  const socials = (
    [
      [business.facebook_url, 'Facebook', FacebookIcon],
      [business.instagram_url, 'Instagram', InstagramIcon],
      [business.tiktok_url, 'TikTok', TikTokIcon],
    ] as const
  ).filter(([url]) => !!url) as [string, string, typeof FacebookIcon][]
  const policies = POLICY_FIELDS.filter(([k]) => business[k]?.trim())
  const hasContact = !!(address || business.phone || business.email || business.website_url || socials.length)
  const accent = business.accent_color || '#0f172a'
  const accentSolid = { backgroundColor: accent }
  const accentText = { color: accent }
  const accentTint = { backgroundColor: `color-mix(in srgb, ${accent} 10%, white)` }
  const accentTintSoft = { backgroundColor: `color-mix(in srgb, ${accent} 6%, white)` }
  const todayKey = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date()).toLowerCase().slice(0, 3)
  const navigate = useNavigate()

  // The only page of Appointly a customer ever finds through search or a shared link, so it
  // carries the business's own name. Nothing private goes in here: name, category and the
  // public description are already on the page itself.
  usePageMeta({
    title: `Book an appointment with ${business.name} | Appointly`,
    description:
      business.description?.trim() ||
      business.tagline?.trim() ||
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

  // Phones: a booking bar pinned to the bottom while neither the hero's button nor the flow is on
  // screen — the flow sits below the whole storefront, and nobody should have to hunt for it.
  const heroRef = useRef<HTMLElement>(null)
  const flowRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState({ hero: true, flow: false })
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      setInView((v) => {
        const next = { ...v }
        for (const e of entries) {
          if (e.target === heroRef.current) next.hero = e.isIntersecting
          if (e.target === flowRef.current) next.flow = e.isIntersecting
        }
        return next
      })
    })
    if (heroRef.current) io.observe(heroRef.current)
    if (flowRef.current) io.observe(flowRef.current)
    return () => io.disconnect()
  }, [])
  const showBar = !inView.hero && !inView.flow

  // Steps open inline, so after each pick bring the newly opened one into view if it's off screen.
  const activeRef = useRef<HTMLLIElement>(null)
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    const el = activeRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 80 || top > window.innerHeight * 0.55) {
      window.scrollTo({ top: window.scrollY + top - 88, behavior: 'smooth' })
    }
  }, [step])

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
  const currentIndex = stepKeys.indexOf(step)
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

  // The step effect scrolls to the newly opened step; this covers re-picking without a step change.
  function pickService(id: string) {
    const sameStep = step === (staffFor(id).length > 1 ? 'staff' : 'datetime')
    selectService(id)
    if (sameStep) document.getElementById('book-flow')?.scrollIntoView({ behavior: 'smooth' })
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

  /** What a finished step collapses to, so the choices stay visible above the open step. */
  function doneSummary(k: StepKey): string {
    if (k === 'service' && service)
      return [service.name, fmtDuration(service.duration_minutes), service.price !== null ? fmtPeso(service.price) : null].filter(Boolean).join(' · ')
    if (k === 'staff') return chosenStaff ? chosenStaff.name : 'Any available'
    if (k === 'datetime' && date && slot) return `${shortDate(date)} · ${fmtTime(slot, timezone)}`
    return ''
  }

  // A ticket that fills in as the customer goes — sits beside the steps on large screens.
  const summaryCard = (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div style={accentSolid} className="px-5 py-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Your appointment</p>
        <p className="font-display mt-1 truncate text-lg font-medium">{business.name}</p>
      </div>
      <dl className="space-y-3.5 px-5 py-5">
        <SummaryRow icon={Sparkles} label="Service" value={service?.name ?? 'Not chosen yet'} sub={service ? fmtDuration(service.duration_minutes) : undefined} empty={!service} />
        {askStaff && <SummaryRow icon={UserRound} label="With" value={chosenStaff?.name ?? 'Any available'} sub={chosenStaff?.position ?? undefined} />}
        <SummaryRow icon={Calendar} label="Date" value={date ? shortDate(date) : 'Not chosen yet'} empty={!date} />
        <SummaryRow icon={Clock} label="Time" value={slot ? fmtTime(slot, timezone) : 'Not chosen yet'} empty={!slot} />
      </dl>
      {service && service.price !== null && (
        <div className="relative border-t border-dashed border-slate-200 px-5 py-4">
          {/* Ticket notches */}
          <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border border-slate-200 bg-white" />
          <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full border border-slate-200 bg-white" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-xl font-semibold text-slate-900">{fmtPeso(service.price)}</span>
          </div>
        </div>
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
      {!business.is_active && (
        <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2.5 text-center text-sm font-medium text-amber-900">
          <EyeOff size={15} aria-hidden="true" className="shrink-0" />
          This page is hidden. Only you can see it — customers can't open it or book.
        </div>
      )}
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
            className="hidden min-h-11 shrink-0 items-center rounded-full px-5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.97] lg:inline-flex"
          >
            Book Appointment
          </a>
        </div>
      </header>

      {/* Hero */}
      <section ref={heroRef} className="relative isolate flex min-h-[22rem] items-center justify-center overflow-hidden bg-slate-900 px-4 py-14 text-center sm:min-h-[34rem] sm:py-24">
        {business.cover_image_url && (
          <img src={business.cover_image_url} alt="" className="absolute inset-0 -z-10 h-full w-full scale-105 object-cover" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />
        <div className="mx-auto max-w-2xl animate-[reveal-up_0.7s_cubic-bezier(0.16,1,0.3,1)_forwards] space-y-6 opacity-0">
          {business.category && (
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/75">{business.category}</p>
          )}
          <h1 className="font-display text-4xl font-medium leading-[1.08] tracking-tight text-white wrap-break-word sm:text-6xl">{business.name}</h1>
          {business.tagline && (
            <p className="mx-auto max-w-xl text-lg font-medium text-white/95 sm:text-xl">{business.tagline}</p>
          )}
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
          <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-28">
            <Reveal className="mx-auto mb-8 max-w-xl text-center sm:mb-14">
              <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Our Services</h2>
              <p className="mt-3 text-slate-500">Choose from what we offer and book in a few clicks.</p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
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
                          <h3 className="min-w-0 text-lg font-semibold wrap-break-word">{s.name}</h3>
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
          <section className="bg-slate-50 px-4 py-14 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-6xl">
              <Reveal className="mx-auto mb-8 max-w-xl text-center sm:mb-14">
                <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Meet Our Team</h2>
                <p className="mt-3 text-slate-500">The people behind every appointment.</p>
              </Reveal>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
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
                        <p className="font-semibold text-slate-900 wrap-break-word">{m.name}</p>
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
          <Reveal as="div" className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-28">
            <h2 className="font-display text-3xl font-medium tracking-tight wrap-break-word sm:text-4xl">About {business.name}</h2>
            <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-slate-600 sm:mt-6 sm:text-lg">{business.about}</p>
          </Reveal>
        )}

        {/* Contact + Hours */}
        {(hasContact || Object.keys(workingHours).length > 0) && (
          <section className="border-t border-slate-200 bg-slate-50 px-4 py-14 sm:px-6 sm:py-28">
            <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-2 sm:gap-16">
              <Reveal>
                <h2 className="font-display text-2xl font-medium tracking-tight">Contact</h2>
                <ul className="mt-6 space-y-4 text-sm text-slate-600">
                  {address && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <MapPin size={16} style={accentText} />
                      </span>
                      <span className="min-w-0 pt-1.5">
                        <span className="block wrap-break-word">{address}</span>
                        {directions && (
                          <a
                            href={directions}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                            style={accentText}
                          >
                            Get directions <ArrowUpRight size={14} aria-hidden="true" />
                          </a>
                        )}
                      </span>
                    </li>
                  )}
                  {business.phone && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <Phone size={16} style={accentText} />
                      </span>
                      <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`} className="min-w-0 pt-1.5 wrap-anywhere underline-offset-2 hover:underline">
                        {business.phone}
                      </a>
                    </li>
                  )}
                  {business.email && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <Mail size={16} style={accentText} />
                      </span>
                      <a href={`mailto:${business.email}`} className="min-w-0 pt-1.5 wrap-anywhere underline-offset-2 hover:underline">
                        {business.email}
                      </a>
                    </li>
                  )}
                  {business.website_url && (
                    <li className="flex items-start gap-3">
                      <span style={accentTint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <Globe size={16} style={accentText} />
                      </span>
                      <a
                        href={business.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 pt-1.5 wrap-anywhere underline-offset-2 hover:underline"
                      >
                        {displayUrl(business.website_url)}
                      </a>
                    </li>
                  )}
                </ul>
                {socials.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {socials.map(([url, label, Icon]) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${business.name} on ${label}`}
                        style={accentTint}
                        className="grid h-11 w-11 place-items-center rounded-full transition-transform hover:scale-105"
                      >
                        <Icon size={18} style={accentText} />
                      </a>
                    ))}
                  </div>
                )}
                {!hasContact && <p className="mt-6 text-sm text-slate-500">Book online below and we'll confirm your appointment.</p>}
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

        {/* Instructions and policies, read before booking rather than discovered after */}
        {(business.booking_instructions || policies.length > 0) && (
          <section id="good-to-know" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-14 sm:px-6 sm:pt-24">
            <Reveal>
              <h2 className="font-display text-center text-3xl font-medium tracking-tight sm:text-4xl">Good to know</h2>
              <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                {business.booking_instructions && (
                  <p className="flex gap-3 p-5 text-[15px] leading-relaxed text-slate-700 sm:p-6" style={accentTintSoft}>
                    <Info size={18} className="mt-0.5 shrink-0" style={accentText} aria-hidden="true" />
                    <span className="whitespace-pre-line">{business.booking_instructions}</span>
                  </p>
                )}
                {policies.map(([k, label]) => (
                  <details key={k} className="group border-t border-slate-200 first:border-t-0">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-semibold text-slate-900 hover:bg-slate-50 sm:px-6 [&::-webkit-details-marker]:hidden">
                      {label}
                      <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="whitespace-pre-line px-5 pb-5 text-sm leading-relaxed text-slate-600 sm:px-6">{business[k]}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </section>
        )}

        {/* Booking flow — one step at a time on the left, a running summary alongside it */}
        <section ref={flowRef} id="book-flow" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14 sm:px-6 sm:py-28">
          <Reveal className="mb-8 text-center sm:mb-10">
            <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Book an Appointment</h2>
            <p className="mt-3 text-slate-500">Pick a service, choose a time, and you're all set.</p>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm xs:p-4 sm:p-8">
              <p className="mb-6 text-[13px] font-medium text-slate-500">
                Step {currentIndex + 1} of {stepKeys.length}
              </p>

              {/* Every step stays on the page: finished ones fold into a one-line summary with "Change" */}
              <ol>
                {stepKeys.map((k, i) => {
                  const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'upcoming'
                  const last = i === stepKeys.length - 1
                  return (
                    <li
                      key={k}
                      ref={state === 'active' ? activeRef : undefined}
                      aria-current={state === 'active' ? 'step' : undefined}
                      className={`relative pl-11 sm:pl-14 ${last ? '' : 'pb-7'}`}
                    >
                      {!last && (
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-0 left-4 top-10 w-0.5 -translate-x-1/2 rounded-full bg-slate-200 transition-colors duration-500 sm:left-4.5 ${state === 'active' ? 'hidden sm:block' : ''}`}
                          style={state === 'done' ? accentSolid : undefined}
                        />
                      )}
                      <span
                        aria-hidden="true"
                        style={state === 'upcoming' ? undefined : state === 'done' ? accentSolid : { borderColor: accent, color: accent }}
                        className={`absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition-colors sm:h-9 sm:w-9 ${
                          state === 'done' ? 'text-white' : state === 'active' ? 'border-2 bg-white' : 'border border-slate-200 bg-white text-slate-400'
                        }`}
                      >
                        {state === 'done' ? <Check size={15} strokeWidth={3} /> : i + 1}
                      </span>

                      <div className="flex min-h-8 items-center justify-between gap-3 sm:min-h-9">
                        <div className="min-w-0">
                          <h3 className={`font-semibold tracking-tight ${state === 'upcoming' ? 'text-slate-400' : 'text-slate-900'} ${state === 'active' ? 'text-lg' : 'text-[15px]'}`}>
                            {STEP_TITLES[k]}
                          </h3>
                          {state === 'active' && <p className="mt-0.5 text-sm text-slate-500">{STEP_HINTS[k]}</p>}
                          {state === 'done' && <p className="mt-0.5 truncate text-sm text-slate-600">{doneSummary(k)}</p>}
                        </div>
                        {state === 'done' && (
                          <button
                            type="button"
                            onClick={() => setStep(k)}
                            aria-label={`Change: ${STEP_TITLES[k].toLowerCase()}`}
                            className="min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10"
                            style={accentText}
                          >
                            Change
                          </button>
                        )}
                      </div>

                      {state === 'active' && (
              <div key={k} className="@container -ml-11 mt-4 animate-[reveal-up_0.3s_ease-out_forwards] space-y-4 sm:ml-0">
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
                      <div className={`grid gap-2.5 ${showServiceSearch ? 'max-h-112 overflow-y-auto p-0.5 pr-1' : ''}`}>
                        {filteredBookable.map((s) => {
                          const on = serviceId === s.id
                          return (
                            <button
                              key={s.id}
                              type="button"
                              aria-pressed={on}
                              className={`${choice(on)} group flex items-center gap-3 p-3! pr-3! @md:gap-4 @md:p-3.5!`}
                              style={on ? { borderColor: accent } : undefined}
                              onClick={() => selectService(s.id)}
                            >
                              {s.image_url ? (
                                <img src={s.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover @md:h-16 @md:w-16" />
                              ) : (
                                <span style={accentTint} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl @md:h-16 @md:w-16">
                                  <Sparkles size={20} style={accentText} />
                                </span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-slate-900 wrap-break-word">{s.name}</span>
                                {s.description && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-relaxed text-slate-500">{s.description}</span>}
                                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-slate-500">
                                  <span className="inline-flex items-center gap-1">
                                    <Clock size={13} className="text-slate-400" /> {fmtDuration(s.duration_minutes)}
                                  </span>
                                  {/* Narrow rows: price joins the meta line instead of taking a column */}
                                  {s.price !== null && <span className="font-semibold text-slate-900 @md:hidden">{fmtPeso(s.price)}</span>}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {s.price !== null && <span className="hidden text-[15px] font-semibold text-slate-900 @md:inline">{fmtPeso(s.price)}</span>}
                                {on ? (
                                  <span style={accentSolid} className="grid h-6 w-6 place-items-center rounded-full text-white">
                                    <Check size={14} strokeWidth={3} />
                                  </span>
                                ) : (
                                  <ChevronRight size={18} className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {step === 'staff' && (
                  <div className="grid gap-2.5 @lg:grid-cols-2">
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

                    <div className="grid overflow-hidden rounded-2xl border border-slate-200 @xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                      <div className="p-2.5 xs:p-3 @md:p-5">
                        <DatePicker
                          value={date}
                          onSelect={(d) => { setDate(d); setSlot(''); setSlotTaken(false) }}
                          today={today}
                          maxDate={addDays(today, maxAdvanceDays)}
                          workingHours={workingHours}
                          accent={accent}
                        />
                      </div>

                      <div className="border-t border-slate-200 bg-slate-50/70 p-3 @md:p-5 @xl:border-l @xl:border-t-0">
                        <h4 className="text-sm font-semibold text-slate-900">{date ? shortDate(date) : 'Available times'}</h4>
                        {!date ? (
                          <div className="flex flex-col items-center px-4 py-6 text-center @xl:py-14">
                            <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-slate-400 shadow-sm">
                              <CalendarDays size={18} />
                            </span>
                            <p className="mt-3 text-sm text-slate-500">Pick a day to see open times.</p>
                          </div>
                        ) : slotsLoading ? (
                          <div className="mt-3 grid grid-cols-3 gap-2 @md:grid-cols-4 @xl:grid-cols-2" aria-busy="true" aria-label="Loading times">
                            {Array.from({ length: 6 }).map((_, i) => <span key={i} className="h-11 animate-pulse rounded-xl bg-slate-200/70" />)}
                          </div>
                        ) : (
                          <>
                            <ErrorText message={slotsError} />
                            {!slotsError && times.length === 0 && (
                              <p className="mt-3 rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm">
                                Fully booked on this day. Try another date.
                              </p>
                            )}
                            <div className="mt-3 space-y-4 @xl:max-h-88 @xl:overflow-y-auto @xl:p-0.5 @xl:pr-1.5">
                              {timeGroups.map((g) => (
                                <div key={g.label}>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    {g.label} <span className="font-normal normal-case tracking-normal">· {g.items.length} open</span>
                                  </p>
                                  <div className="mt-2 grid grid-cols-3 gap-2 @md:grid-cols-4 @xl:grid-cols-2">
                                    {g.items.map((t) => {
                                      const on = slot === t
                                      return (
                                        <button
                                          key={t}
                                          type="button"
                                          aria-pressed={on}
                                          style={on ? { backgroundColor: accent, borderColor: accent } : undefined}
                                          className={`min-h-11 rounded-xl border px-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 ${
                                            on ? 'font-semibold text-white shadow-md' : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-400'
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

                    {/* The ticket sits beside the steps on large screens; on small ones, just the total */}
                    {service && service.price !== null && (
                      <div className="flex items-baseline justify-between rounded-2xl bg-slate-50 px-4 py-3 lg:hidden">
                        <span className="text-sm text-slate-600">Total · {fmtDuration(service.duration_minutes)}</span>
                        <span className="text-lg font-semibold text-slate-900">{fmtPeso(service.price)}</span>
                      </div>
                    )}

                    {business.booking_instructions && (
                      <p className="flex gap-2.5 rounded-2xl p-4 text-[13px] leading-relaxed text-slate-700" style={accentTintSoft}>
                        <Info size={16} className="mt-px shrink-0" style={accentText} aria-hidden="true" />
                        <span className="whitespace-pre-line">{business.booking_instructions}</span>
                      </p>
                    )}

                    <ErrorText message={formError} />

                    <button
                      style={accentSolid}
                      className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-lg shadow-slate-900/10 transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={busy}
                      aria-busy={busy}
                    >
                      {busy ? 'Confirming…' : <><Check size={18} strokeWidth={2.5} /> Confirm Appointment</>}
                    </button>
                    <p className="text-center text-xs text-slate-500">
                      You'll get a confirmation with all the details.
                      {policies.length > 0 && (
                        <>
                          {' '}By booking you agree to our{' '}
                          <a href="#good-to-know" className="font-medium underline underline-offset-2" style={accentText}>
                            booking policies
                          </a>
                          .
                        </>
                      )}
                    </p>
                  </form>
                )}
              </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>

            <aside className="hidden lg:sticky lg:top-24 lg:block">{summaryCard}</aside>
          </div>
        </section>

        {/* Final CTA */}
        <Reveal as="div" className="px-4 py-14 sm:px-6 sm:py-24" style={{ backgroundColor: accent } as React.CSSProperties}>
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
      <footer className="border-t border-slate-200 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-10 sm:px-6 lg:pb-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="font-display text-lg font-medium wrap-break-word">{business.name}</p>
            <p className="mt-1 text-sm text-slate-500 wrap-anywhere">
              {[address, business.phone, business.email].filter(Boolean).join(' · ')}
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

      <div
        aria-hidden={!showBar}
        inert={!showBar}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 ease-out lg:hidden ${
          showBar ? 'translate-y-0 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]' : 'pointer-events-none translate-y-full'
        }`}
      >
        {service ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{service.name}</p>
              <p className="truncate text-[13px] text-slate-500">
                {date && slot ? `${shortDate(date)} · ${fmtTime(slot, timezone)}` : `Step ${currentIndex + 1} of ${stepKeys.length} · ${STEP_TITLES[step]}`}
              </p>
            </div>
            <a
              href="#book-flow"
              style={accentSolid}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full px-6 text-[15px] font-semibold text-white shadow-sm active:scale-[0.98]"
            >
              Continue
            </a>
          </div>
        ) : (
          <a
            href="#book-flow"
            style={accentSolid}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-sm active:scale-[0.99]"
          >
            <Calendar size={17} aria-hidden /> Book an appointment
          </a>
        )}
      </div>
    </div>
  )
}

/** Mirrors the storefront's top — bar, hero, first services — so the page does not jump on arrival. */
function BookingPageSkeleton() {
  return (
    <div className="font-site animate-pulse bg-white" aria-busy="true" aria-label="Loading booking page">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>
        <div className="h-10 w-28 rounded-full bg-slate-200" />
      </div>
      <div className="h-[22rem] bg-slate-200 sm:h-[34rem]" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  )
}

export default function BookingPage() {
  const { slug = '' } = useParams()
  const load = useCallback(async (): Promise<Catalog | null> => {
    // The visitor's view of the business: hidden contact details arrive blank, and a hidden page
    // comes back only for its own members (0028).
    const rows = await unwrap<PublicBusiness[]>(supabase.rpc('get_public_business', { p_slug: slug }))
    const business = rows[0]
    if (!business) return null
    const [services, staff, links] = await Promise.all([
      unwrap<Service[]>(supabase.from('services').select('*').eq('business_id', business.id).eq('is_active', true).order('name')),
      // Visitors cannot read the staff table (0026); this RPC returns only the public columns.
      unwrap<PublicStaff[]>(supabase.rpc('get_public_staff', { p_business_id: business.id })),
      unwrap<{ staff_id: string; service_id: string }[]>(
        supabase.from('staff_services').select('staff_id, service_id').eq('business_id', business.id),
      ),
    ])
    return { business: { ...business, working_hours: business.working_hours ?? {} }, services, staff, links }
  }, [slug])
  const { data, loading, error, reload } = useLoad(load)

  if (loading) return <BookingPageSkeleton />
  if (error)
    return (
      <main className="font-site grid min-h-dvh place-items-center bg-slate-50 px-4">
        <ErrorState message={error} onRetry={reload} />
      </main>
    )
  if (!data)
    return (
      <NotFoundPage
        title="Booking page not found"
        body="This link doesn't match any business on Appointly. Check the address, or ask the business for their booking link."
      />
    )
  return <Booker catalog={data} />
}
