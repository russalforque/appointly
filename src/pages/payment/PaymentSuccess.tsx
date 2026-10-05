import { Link } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { actionPrimary } from '../../lib/ui'

export default function PaymentSuccess() {
  return (
    <main className="font-dashboard grid min-h-dvh place-items-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheck size={28} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">Payment received</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          We're confirming your payment. Your plan activates automatically once it's verified, and Billing updates by
          itself — no need to refresh.
        </p>
        <Link to="/dashboard/billing" className={`${actionPrimary} mt-6 w-full`}>
          Go to Billing
        </Link>
      </div>
    </main>
  )
}
