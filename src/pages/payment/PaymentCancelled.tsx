import { Link } from 'react-router-dom'
import { btn, btnGhost, card } from '../../lib/ui'

export default function PaymentCancelled() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className={`${card} w-full max-w-sm space-y-3 text-center`}>
        <h1 className="text-xl font-semibold">Checkout cancelled</h1>
        <p className="text-sm text-slate-600">No charge was made. You can try again anytime from Billing.</p>
        <div className="flex justify-center gap-2">
          <Link to="/dashboard/billing" className={btn}>Back to Billing</Link>
          <Link to="/dashboard" className={btnGhost}>Dashboard</Link>
        </div>
      </div>
    </main>
  )
}
