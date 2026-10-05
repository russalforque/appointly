import { useState } from 'react'
import { ChevronRight, Loader2, Mail, Phone, StickyNote } from 'lucide-react'
import { appointmentEnd, bookingRef, setBookingStatus } from '../../lib/booking'
import { useConfirm } from '../../lib/confirm'
import { fmtPeso, fmtTime, initials } from '../../lib/format'
import { useToast } from '../../lib/toast'
import { actionDanger, actionPrimary, actionSecondary } from '../../lib/ui'
import type { BookingRow, BookingStatus } from '../../lib/types'
import Modal from '../../components/Modal'
import { STATUS_META } from './calendarModel'

const BADGE: Record<BookingStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-brand-100 text-brand-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-neutral-100 text-neutral-500',
  no_show: 'bg-red-100 text-red-800',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-block flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>
      {STATUS_META[status].label}
    </span>
  )
}

type Ask = { title: string; body: string; confirmLabel: string }
type Next = { to: BookingStatus; label: string; done: string; kind: 'primary' | 'secondary' | 'danger'; ask?: Ask }

/** Final states with no way back, so a stray tap must not reach them. */
const ASK_CANCEL: Ask = {
  title: 'Cancel this booking?',
  body: 'The time slot opens up again for other customers. This cannot be undone.',
  confirmLabel: 'Cancel booking',
}

/** What can happen next from each status. The first entry is the expected, primary step. */
const NEXT: Record<BookingStatus, Next[]> = {
  pending: [
    { to: 'confirmed', label: 'Confirm booking', done: 'Booking confirmed', kind: 'primary' },
    {
      to: 'cancelled',
      label: 'Decline',
      done: 'Booking declined',
      kind: 'danger',
      ask: { ...ASK_CANCEL, title: 'Decline this booking?', confirmLabel: 'Decline booking' },
    },
  ],
  confirmed: [
    { to: 'completed', label: 'Mark completed', done: 'Marked as completed', kind: 'primary' },
    {
      to: 'no_show',
      label: 'No-show',
      done: 'Marked as a no-show',
      kind: 'secondary',
      ask: { title: 'Mark as a no-show?', body: 'Use this when the customer did not turn up. This cannot be undone.', confirmLabel: 'Mark no-show' },
    },
    { to: 'cancelled', label: 'Cancel', done: 'Booking cancelled', kind: 'danger', ask: ASK_CANCEL },
  ],
  completed: [],
  cancelled: [],
  no_show: [],
}

const hasNextStep = (status: BookingStatus) => NEXT[status].length > 0

/**
 * Status changes for one booking: the expected next step as the primary button, the rest beside
 * it. Phones get the primary on its own full-width row, nearest the thumb.
 */
export function BookingActions({ booking, onChanged }: { booking: BookingRow; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BookingStatus | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  async function change(next: Next) {
    if (busy) return
    if (next.ask && !(await confirm({ ...next.ask, tone: 'danger', cancelLabel: 'Keep booking' }))) return
    setBusy(next.to)
    setError(null)
    try {
      await setBookingStatus(booking.id, next.to)
      toast(next.done)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  const steps = NEXT[booking.status]
  if (steps.length === 0) return null
  const [primary, ...rest] = steps
  const cls = { primary: actionPrimary, secondary: actionSecondary, danger: actionDanger }

  const button = (n: Next, extra: string) => (
    <button key={n.to} type="button" className={`${cls[n.kind]} ${extra}`} disabled={busy !== null} onClick={() => change(n)}>
      {busy === n.to && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {n.label}
    </button>
  )

  return (
    <div className="w-full">
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-start">
        {button(primary, 'w-full sm:w-auto')}
        {rest.length > 0 && <div className="grid grid-cols-2 gap-2 sm:flex">{rest.map((n) => button(n, 'w-full sm:w-auto'))}</div>}
      </div>
    </div>
  )
}

/**
 * One booking in a list: time first (what owners scan for), a status-coloured rail, who and what,
 * then the status. The whole row opens the booking. Shared by Home, Bookings, Calendar and Staff.
 */
export function BookingListItem({
  booking: b,
  timezone,
  onSelect,
  staffColor,
  showPrice = false,
}: {
  booking: BookingRow
  timezone: string
  onSelect: (b: BookingRow) => void
  staffColor?: string
  showPrice?: boolean
}) {
  const price = b.services?.price
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(b)}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-neutral-50 active:bg-neutral-100 focus-visible:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:gap-4"
      >
        <span className="w-15 flex-none sm:w-20">
          <span className="block whitespace-nowrap text-[13px] font-semibold tabular-nums text-neutral-900 sm:text-sm">{fmtTime(b.start_at, timezone)}</span>
          <span className="block whitespace-nowrap text-xs tabular-nums text-neutral-400">{fmtTime(appointmentEnd(b), timezone)}</span>
        </span>
        {/* The badge already names the status; on phones the colour rail would only cost width */}
        <span className={`hidden h-9 w-1 flex-none rounded-full sm:block ${STATUS_META[b.status].dot}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[15px] font-medium text-neutral-900 sm:text-sm ${
              b.status === 'cancelled' ? 'text-neutral-400 line-through decoration-neutral-300' : ''
            }`}
          >
            {b.customers?.name ?? 'Booking'}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-500 sm:text-xs">
            <span className="truncate">{b.services?.name}</span>
            {b.staff && (
              <>
                <span aria-hidden className="text-neutral-300">
                  ·
                </span>
                {staffColor && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: staffColor }} aria-hidden />}
                <span className="truncate">{b.staff.name}</span>
              </>
            )}
          </span>
        </span>
        {showPrice && price != null && (
          <span className="hidden flex-none text-sm font-medium tabular-nums text-neutral-600 sm:block">{fmtPeso(price)}</span>
        )}
        <StatusBadge status={b.status} />
        <ChevronRight size={16} className="-ml-1 hidden flex-none text-neutral-300 group-hover:text-neutral-500 sm:block" aria-hidden />
      </button>
    </li>
  )
}

/**
 * Everything about one booking, as a bottom sheet on phones: the appointment as a ticket, the
 * customer with one-tap call/email, the details, and the status actions pinned to the bottom.
 */
export function BookingDetailsSheet({
  booking: b,
  timezone,
  staffColor,
  onClose,
  onChanged,
}: {
  booking: BookingRow
  timezone: string
  staffColor?: string
  onClose: () => void
  onChanged: () => void
}) {
  const startDay = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(b.start_at))
  const price = b.services?.price
  const contactBtn = `${actionSecondary} flex-1`

  return (
    <Modal
      onClose={onClose}
      title="Booking details"
      titleId="booking-details-title"
      maxWidth="max-w-md"
      footer={hasNextStep(b.status) ? <BookingActions booking={b} onChanged={onChanged} /> : undefined}
    >
      {/* The appointment itself, as a ticket in its status colours */}
      <div className={`rounded-2xl border-l-4 p-4 ${STATUS_META[b.status].block.replace(/hover:\S+/g, '')}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {fmtTime(b.start_at, timezone)} – {fmtTime(appointmentEnd(b), timezone)}
            </p>
            <p className="mt-0.5 text-sm opacity-80">{startDay}</p>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium wrap-anywhere">{b.services?.name}</span>
          {b.services && <span className="opacity-70">{b.services.duration_minutes} min</span>}
          {price != null && <span className="font-medium tabular-nums">{fmtPeso(price)}</span>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
          {initials(b.customers?.name ?? '?')}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-neutral-900 wrap-anywhere">{b.customers?.name ?? 'Customer'}</p>
          <p className="text-xs text-neutral-500 wrap-anywhere">
            {[b.customers?.phone, b.customers?.email].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
        </div>
      </div>
      {(b.customers?.phone || b.customers?.email) && (
        <div className="mt-3 flex gap-2">
          {b.customers?.phone && (
            <a href={`tel:${b.customers.phone}`} className={contactBtn}>
              <Phone size={15} strokeWidth={2} aria-hidden /> Call
            </a>
          )}
          {b.customers?.email && (
            <a href={`mailto:${b.customers.email}`} className={contactBtn}>
              <Mail size={15} strokeWidth={2} aria-hidden /> Email
            </a>
          )}
        </div>
      )}

      <dl className="mt-4 space-y-2.5 border-t border-neutral-100 pt-4 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="flex-none text-neutral-500">Staff</dt>
          <dd className="flex min-w-0 items-center justify-end gap-1.5 text-right font-medium text-neutral-900">
            {staffColor && <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: staffColor }} aria-hidden />}
            <span className="wrap-anywhere">{b.staff ? [b.staff.name, b.staff.position].filter(Boolean).join(' · ') : 'Any available'}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-neutral-500">Reference</dt>
          <dd className="font-mono text-xs font-medium text-neutral-900">{bookingRef(b.public_token)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-neutral-500">Booked</dt>
          <dd className="text-right text-neutral-900">
            {new Intl.DateTimeFormat(undefined, { timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
              new Date(b.created_at),
            )}
          </dd>
        </div>
        {b.notes && (
          <div>
            <dt className="flex items-center gap-1.5 text-neutral-500">
              <StickyNote size={14} strokeWidth={1.75} aria-hidden /> Customer note
            </dt>
            <dd className="mt-1.5 whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-neutral-700 wrap-anywhere">{b.notes}</dd>
          </div>
        )}
      </dl>
    </Modal>
  )
}
