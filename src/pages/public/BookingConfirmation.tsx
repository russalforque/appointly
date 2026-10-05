import { useCallback, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowUpRight, CalendarPlus, CheckCircle2, Clock, Info, MapPin, Phone, XCircle, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { cancelBooking } from '../../lib/booking'
import { fmtDuration, fmtTime } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../lib/confirm'
import { useToast } from '../../lib/toast'
import { directionsUrl } from '../../lib/publicBusiness'
import type { BookingStatus } from '../../lib/types'
import Reveal from '../../components/Reveal'
import { ErrorText, NotFoundPage } from '../../components/Status'

interface PublicBooking {
  status: BookingStatus
  start_at: string
  end_at: string
  service_name: string
  staff_name: string
  customer_name: string
  business_name: string
  business_slug: string
  business_phone: string | null
  business_address: string | null
  timezone: string
  can_cancel: boolean
  business_logo_url: string | null
  business_accent_color: string | null
  business_maps_url: string | null
  booking_instructions: string | null
  confirmation_message: string | null
  cancellation_policy: string | null
}

const HEADLINE: Record<BookingStatus, string> = {
  pending: 'Booking received',
  confirmed: 'Appointment confirmed',
  completed: 'Appointment completed',
  cancelled: 'Booking cancelled',
  no_show: 'Marked as a no-show',
}

const SUBTEXT: Record<BookingStatus, string> = {
  pending: 'Your request is in. The business will confirm it shortly.',
  confirmed: 'Your appointment is booked. See you soon!',
  completed: 'This appointment has already taken place.',
  cancelled: 'This booking is no longer active.',
  no_show: 'This appointment was marked as missed.',
}

const STATUS_ICON: Record<BookingStatus, LucideIcon> = {
  pending: Clock,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
  no_show: AlertCircle,
}

const calDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const calendarUrl = (b: PublicBooking) =>
  'https://calendar.google.com/calendar/render?' +
  new URLSearchParams({
    action: 'TEMPLATE',
    text: `${b.service_name} at ${b.business_name}`,
    dates: `${calDate(b.start_at)}/${calDate(b.end_at)}`,
    location: b.business_address ?? '',
  })

/** 'Friday, September 25' in the business timezone — the line customers scan for first. */
const fmtLongDate = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso))
const fmtYear = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: tz, year: 'numeric' }).format(new Date(iso))

function Initials({ name }: { name: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/** One labelled detail line; the label stays quiet so the value carries the weight. */
function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-[13px] text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-900 wrap-break-word">
        {value}
        {sub && <span className="block text-[13px] font-normal text-slate-500">{sub}</span>}
      </dd>
    </div>
  )
}

export default function BookingConfirmation() {
  const { token = '' } = useParams()
  const load = useCallback(
    async () => (await unwrap<PublicBooking[]>(supabase.rpc('get_booking', { p_token: token })))[0] ?? null,
    [token],
  )
  const { data: b, loading, error, reload } = useLoad(load)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()

  if (loading)
    return (
      <main className="font-site min-h-screen animate-pulse bg-slate-50 px-4 py-12 sm:py-16" aria-busy="true" aria-label="Loading booking">
        <div className="mx-auto max-w-xl">
          <div className="mx-auto h-14 w-14 rounded-full bg-slate-200" />
          <div className="mx-auto mt-4 h-7 w-56 rounded bg-slate-200" />
          <div className="mx-auto mt-2 h-4 w-72 max-w-full rounded bg-slate-200" />
          <div className="mt-7 h-80 rounded-3xl bg-white" />
        </div>
      </main>
    )
  if (error || !b)
    return (
      <NotFoundPage
        title="Booking not found"
        body="This booking link is incomplete or no longer valid. Open the link from your confirmation again, or contact the business."
      />
    )

  async function cancel() {
    if (cancelling || !b) return
    const ok = await confirm({
      title: 'Cancel your appointment?',
      body: `Your ${b.service_name} booking with ${b.business_name} will be cancelled and the time given to someone else. This cannot be undone.`,
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'Keep my booking',
      tone: 'danger',
    })
    if (!ok) return
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelBooking(token)
      toast('Your booking was cancelled')
      reload()
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Could not cancel booking')
    } finally {
      setCancelling(false)
    }
  }

  const accent = b.business_accent_color || '#0f172a'
  const accentSolid = { backgroundColor: accent } as CSSProperties
  const accentText = { color: accent } as CSSProperties
  const accentTint = { backgroundColor: `color-mix(in srgb, ${accent} 12%, white)` } as CSSProperties
  const accentTintSoft = { backgroundColor: `color-mix(in srgb, ${accent} 6%, white)` } as CSSProperties
  const directions = directionsUrl(b.business_maps_url, b.business_address ?? '')
  const isActive = b.status === 'pending' || b.status === 'confirmed'
  const statusTint =
    b.status === 'confirmed' ? accentTint
    : b.status === 'pending' ? { backgroundColor: '#fffbeb' }
    : b.status === 'cancelled' || b.status === 'no_show' ? { backgroundColor: '#fef2f2' }
    : { backgroundColor: '#f1f5f9' }
  const statusColor =
    b.status === 'confirmed' ? accentText
    : b.status === 'pending' ? { color: '#b45309' }
    : b.status === 'cancelled' || b.status === 'no_show' ? { color: '#dc2626' }
    : { color: '#475569' }
  const StatusIcon = STATUS_ICON[b.status]
  const reference = token.slice(0, 8).toUpperCase()
  const minutes = Math.round((new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000)
  const secondaryBtn =
    'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 sm:w-auto'
  const primaryBtn =
    'inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 active:scale-[0.99] sm:w-auto'

  return (
    <main className="font-site min-h-screen bg-slate-50 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-xl">
        <Reveal className="text-center">
          <span style={statusTint} className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full">
            <StatusIcon size={26} style={statusColor} strokeWidth={2} aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-medium tracking-tight text-slate-900 sm:text-3xl">{HEADLINE[b.status]}</h1>
          <p className="mt-2 text-sm text-slate-500">{SUBTEXT[b.status]}</p>
          {isActive && b.confirmation_message && (
            <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{b.confirmation_message}</p>
          )}
        </Reveal>

        <Reveal delay={80} className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* The two things people come back to this page for */}
          <div className="border-b border-slate-100 px-6 py-7 text-center">
            <p className="font-display text-2xl font-medium leading-tight tracking-tight text-slate-900 sm:text-[28px]">
              {fmtLongDate(b.start_at, b.timezone)}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {fmtTime(b.start_at, b.timezone)}
            </p>
            <p className="mt-2 text-[13px] text-slate-500">
              {fmtYear(b.start_at, b.timezone)} · until {fmtTime(b.end_at, b.timezone)} · {b.timezone}
            </p>
          </div>

          <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
            {b.business_logo_url ? (
              <img src={b.business_logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <Initials name={b.business_name} />
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-base font-medium text-slate-900">{b.business_name}</p>
              <p className="truncate text-[13px] text-slate-500">{b.service_name}</p>
            </div>
          </div>

          <dl className="divide-y divide-slate-100 px-6 py-2">
            <Detail label="Service" value={b.service_name} />
            <Detail label="Staff" value={b.staff_name} />
            <Detail label="Duration" value={fmtDuration(minutes)} />
            <Detail label="Booked for" value={b.customer_name} />
          </dl>

          <div className="flex items-center justify-between border-t border-dashed border-slate-200 bg-slate-50/60 px-6 py-4">
            <span className="text-[13px] text-slate-500">Booking reference</span>
            <span className="font-mono text-sm font-semibold tracking-wider text-slate-900">{reference}</span>
          </div>
        </Reveal>

        {isActive && b.booking_instructions && (
          <Reveal delay={100}>
            <div className="mt-4 flex gap-3 rounded-2xl p-4 text-sm leading-relaxed text-slate-700" style={accentTintSoft}>
              <Info size={17} className="mt-0.5 shrink-0" style={accentText} aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">Before your visit</p>
                <p className="mt-0.5 whitespace-pre-line">{b.booking_instructions}</p>
              </div>
            </div>
          </Reveal>
        )}

        {isActive && (
          <Reveal delay={120}>
            <p className="mt-4 text-center text-[13px] text-slate-500">
              A confirmation will be sent using the contact information you provided.
              <span className="block">Didn't get the email? Check your spam or junk folder.</span>
            </p>
          </Reveal>
        )}

        <Reveal delay={160}>
          <div className="mt-6 space-y-3">
            <ErrorText message={cancelError} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {isActive && (
                <a href={calendarUrl(b)} target="_blank" rel="noreferrer" className={secondaryBtn}>
                  <CalendarPlus size={16} aria-hidden="true" /> Add to calendar
                </a>
              )}
              <Link to={b.business_slug ? `/book/${b.business_slug}` : '/'} style={accentSolid} className={primaryBtn}>
                {!b.business_slug ? 'Done' : isActive ? `Back to ${b.business_name}` : 'Book another appointment'}
              </Link>
            </div>
            {isActive && b.cancellation_policy && (
              <details className="group rounded-2xl border border-slate-200 bg-white text-left">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  Cancellation policy
                  <span className="text-slate-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="whitespace-pre-line px-5 pb-4 text-[13px] leading-relaxed text-slate-600">{b.cancellation_policy}</p>
              </details>
            )}
            {b.can_cancel && (
              <div className="text-center">
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={cancel}
                  className="min-h-11 rounded-full px-3 text-sm font-medium text-red-600 transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling…' : 'Cancel booking'}
                </button>
              </div>
            )}
          </div>
        </Reveal>

        {(b.business_address || b.business_phone) && (
          <Reveal delay={200}>
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <h2 className="text-[13px] font-semibold text-slate-900 wrap-break-word">Need to reach {b.business_name}?</h2>
              <ul className="mt-2 space-y-2 text-[13px] text-slate-600">
                {b.business_address && (
                  <li className="flex items-start gap-2">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block wrap-break-word">{b.business_address}</span>
                      {directions && (
                        <a
                          href={directions}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                          style={accentText}
                        >
                          Get directions <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      )}
                    </span>
                  </li>
                )}
                {b.business_phone && (
                  <li className="flex items-start gap-2">
                    <Phone size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <a href={`tel:${b.business_phone}`} className="underline-offset-2 hover:underline">{b.business_phone}</a>
                  </li>
                )}
              </ul>
            </div>
          </Reveal>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">Save this page's link to view your booking later.</p>
      </div>
    </main>
  )
}
