import { CheckCircle2, Clock3, TimerOff, XCircle } from 'lucide-react'
import type { PaymentStatus } from '../lib/types'

const TONE: Record<PaymentStatus, { label: string; className: string; Icon: typeof Clock3 }> = {
  draft: { label: 'Not submitted', className: 'border-neutral-200 bg-neutral-100 text-neutral-600', Icon: Clock3 },
  pending: { label: 'Pending', className: 'border-amber-200 bg-amber-50 text-amber-700', Icon: Clock3 },
  approved: { label: 'Approved', className: 'border-green-200 bg-green-50 text-green-700', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'border-red-200 bg-red-50 text-red-700', Icon: XCircle },
  expired: { label: 'Expired', className: 'border-neutral-200 bg-neutral-100 text-neutral-600', Icon: TimerOff },
}

/** One visual language for a payment's state, shared by the customer and admin screens. */
export default function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const { label, className, Icon } = TONE[status] ?? TONE.pending
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon size={12} strokeWidth={2} />
      {label}
    </span>
  )
}
