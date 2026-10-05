import { Link } from 'react-router-dom'
import { CircleSlash } from 'lucide-react'
import { actionPrimary, actionSecondary } from '../../lib/ui'

export default function PaymentCancelled() {
  return (
    <main className="font-dashboard grid min-h-dvh place-items-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-neutral-200/70 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <CircleSlash size={26} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">Checkout cancelled</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">No charge was made. You can try again anytime from Billing.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/dashboard/billing" className={`${actionPrimary} w-full`}>
            Back to Billing
          </Link>
          <Link to="/dashboard" className={`${actionSecondary} w-full`}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
