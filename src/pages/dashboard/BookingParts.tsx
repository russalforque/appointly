import { useState } from 'react'
import { setBookingStatus } from '../../lib/booking'
import { btnGhost } from '../../lib/ui'
import type { BookingRow, BookingStatus } from '../../lib/types'

const BADGE: Record<BookingStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-slate-100 text-slate-500',
  no_show: 'bg-red-100 text-red-800',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-block flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

const NEXT: Record<BookingStatus, [BookingStatus, string][]> = {
  pending: [['confirmed', 'Confirm'], ['cancelled', 'Cancel']],
  confirmed: [['completed', 'Complete'], ['no_show', 'No-show'], ['cancelled', 'Cancel']],
  completed: [],
  cancelled: [],
  no_show: [],
}

export function BookingActions({ booking, onChanged }: { booking: BookingRow; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)

  async function change(status: BookingStatus) {
    try {
      await setBookingStatus(booking.id, status)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-1">
      {NEXT[booking.status].map(([status, label]) => (
        <button
          key={status}
          className={`${btnGhost} !flex-1 !px-3 !py-2.5 !text-xs sm:!flex-none sm:!py-2`}
          onClick={() => change(status)}
        >
          {label}
        </button>
      ))}
      {error && <span className="w-full text-xs text-red-600 sm:w-auto">{error}</span>}
    </div>
  )
}
