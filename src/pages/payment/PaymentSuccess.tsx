import { Link } from 'react-router-dom'
import { btn, card } from '../../lib/ui'

export default function PaymentSuccess() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className={`${card} w-full max-w-sm space-y-3 text-center`}>
        <h1 className="text-xl font-semibold">Payment received</h1>
        <p className="text-sm text-slate-600">
          We're verifying your payment with Xendit. This usually takes a few seconds — your plan will activate
          automatically once it's confirmed.
        </p>
        <Link to="/dashboard/billing" className={`${btn} inline-block`}>Go to Billing</Link>
      </div>
    </main>
  )
}
