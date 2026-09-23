import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { fetchPlans, fmtMoney, startCheckout } from '../lib/billing'
import { useLoad } from '../lib/useLoad'
import { btn, btnGhost, card } from '../lib/ui'
import { ErrorText, Loading } from '../components/Status'
import Logo from '../components/Logo'

export default function Pricing() {
  const { session } = useAuth()
  const { data: plans, loading, error } = useLoad(useCallback(fetchPlans, []))
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  async function choose(planId: string) {
    setBusyPlan(planId)
    setCheckoutError(null)
    try {
      window.location.href = await startCheckout(planId)
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Could not start checkout')
      setBusyPlan(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Logo className="h-8 w-8" />
            Appointly
          </Link>
          {session ? (
            <Link to="/dashboard" className={btnGhost}>Dashboard</Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className={btnGhost}>Log In</Link>
              <Link to="/register" className={btn}>Get Started</Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Simple plans for growing businesses</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Start with a 14-day free trial. No card required to get started.
        </p>

        {loading && <Loading />}
        <ErrorText message={error} />
        <ErrorText message={checkoutError} />

        {plans && (
          <div className="mx-auto mt-10 grid max-w-3xl gap-6 text-left sm:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className={`${card} flex flex-col`}>
                <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                <p className="mt-1">
                  <span className="text-3xl font-bold text-slate-900">{fmtMoney(plan.price_cents, plan.currency)}</span>
                  <span className="text-sm text-slate-500"> / {plan.interval}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                {session ? (
                  <button className={`${btn} mt-6`} disabled={busyPlan === plan.id} onClick={() => choose(plan.id)}>
                    {busyPlan === plan.id ? 'Redirecting…' : 'Choose plan'}
                  </button>
                ) : (
                  <Link to="/register" className={`${btn} mt-6 text-center`}>Get Started</Link>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
