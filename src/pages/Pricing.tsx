import { useCallback, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { billingState, fetchPlans, fetchSubscription, fmtDate, planAction, type BillingState } from '../lib/billing'
import { fetchPayments } from '../lib/payments'
import { RECOMMENDED_PLAN_ID } from '../lib/plans'
import { supabase } from '../lib/supabase'
import { unwrap } from '../lib/db'
import { useLoad } from '../lib/useLoad'
import { usePageMeta } from '../lib/usePageMeta'
import type { Plan } from '../lib/types'
import { ErrorState } from '../components/Status'
import { PlanCards, PlanComparison } from '../components/PlanCards'
import Logo from '../components/Logo'

const FOCUS = 'outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15'
const BTN = `inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors sm:min-h-11 ${FOCUS}`
const primary = `${BTN} bg-slate-900 text-white hover:bg-slate-700`
const secondary = `${BTN} border border-slate-300 text-slate-800 hover:border-slate-400 hover:bg-slate-50`
const disabled = `${BTN} cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-500`
const navPrimary = `inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 ${FOCUS}`
const ghost = `inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 ${FOCUS}`

const FAQS = [
  {
    q: 'How does the free trial work?',
    a: 'Every new business gets 14 days with every Business feature switched on. No card or payment is needed to start. Pick a plan before the trial ends to keep your dashboard unlocked.',
  },
  {
    q: 'How do I pay?',
    a: 'Plans are prepaid by GoTyme Bank transfer or QR Ph. You upload your receipt, our team verifies it — usually within one business day — and your plan activates automatically. Nothing is ever charged automatically.',
  },
  {
    q: 'Can I upgrade from Starter to Business?',
    a: 'Yes, at any time. Your unused Starter time is converted into extra Business days, so you never pay twice for the same period.',
  },
  {
    q: 'What happens if I switch down to Starter?',
    a: 'The switch is instant and needs no payment — your remaining Business time becomes about twice as many Starter days. Nothing is deleted: bookings, customers, staff and settings stay. Business-only features simply stop being editable.',
  },
  {
    q: 'What if my plan runs out?',
    a: 'Your dashboard is locked until you renew, but your booking page, bookings, customers and settings are kept safe. Renew any time to pick up where you left off.',
  },
]

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-slate-900 ${FOCUS}`}
      >
        {q}
        <ChevronDown size={18} className={`flex-none text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <p id={id} className="pb-4 text-sm leading-relaxed text-slate-600">
          {a}
        </p>
      )}
    </div>
  )
}

/** The signed-in owner's own billing, so the cards can say "Current plan" instead of "Choose". */
async function fetchOwnBilling(userId: string) {
  const m = await unwrap<{ business_id: string }[]>(
    supabase.from('business_members').select('business_id').eq('user_id', userId).limit(1),
  )
  if (!m.length) return null
  const [subscription, payments] = await Promise.all([fetchSubscription(m[0].business_id), fetchPayments(m[0].business_id)])
  return { subscription, paymentPending: payments[0]?.status === 'pending' }
}

function statusLine(s: BillingState): string | null {
  switch (s.kind) {
    case 'trial':
      return s.daysLeft && s.daysLeft > 0 ? `You're on a free trial — ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left.` : "You're on a free trial."
    case 'trial_expired':
      return 'Your free trial has ended. Choose a plan to continue.'
    case 'active':
      return s.endsAt
        ? `You're on ${s.plan?.name ?? 'a paid plan'}${s.cancelling ? ', ending' : ', paid through'} ${fmtDate(s.endsAt)}.`
        : `You're on ${s.plan?.name ?? 'a paid plan'}.`
    case 'expired':
      return `Your ${s.plan?.name ?? ''} plan has expired. Renew to unlock your dashboard.`
    case 'cancelled':
      return 'Your subscription was cancelled. Reactivate any time.'
    case 'processing':
      return 'Your payment is being verified.'
    default:
      return null
  }
}

export default function Pricing() {
  const { session } = useAuth()
  const userId = session?.user.id
  usePageMeta({
    title: 'Pricing — Appointly',
    description: 'Starter for solo professionals and small businesses, Business for growing teams. Start with a 14-day free trial.',
  })

  const load = useCallback(async () => {
    const [plans, own] = await Promise.all([fetchPlans(), userId ? fetchOwnBilling(userId) : Promise.resolve(null)])
    return { plans, own }
  }, [userId])
  const { data, loading, error, reload } = useLoad(load)

  const state = data?.own ? billingState(data.own.subscription, data.plans) : null

  function action(plan: Plan) {
    if (!session) {
      return (
        <Link to="/register" className={plan.id === RECOMMENDED_PLAN_ID ? primary : secondary}>
          Start free trial
        </Link>
      )
    }
    // Signed in without a business (e.g. Appointly staff): the dashboard sorts out where they belong.
    if (!state || !data?.own)
      return (
        <Link to="/dashboard" className={secondary}>
          Go to dashboard
        </Link>
      )
    // Payment availability is checked on the payment page itself; here the button only routes.
    const a = planAction(plan, state, { paymentPending: data.own.paymentPending, paymentsOff: false })
    if (a.disabled)
      return (
        <span className={disabled} aria-disabled="true">
          {a.label}
        </span>
      )
    const to = a.intent === 'downgrade' ? `/dashboard/billing?change=${plan.id}` : `/dashboard/billing/pay/${plan.id}`
    const isPrimary = a.intent === 'upgrade' || a.intent === 'renew' || (a.intent === 'choose' && plan.id === RECOMMENDED_PLAN_ID)
    return (
      <Link to={to} className={isPrimary ? primary : secondary}>
        {a.label}
      </Link>
    )
  }

  const status = state ? statusLine(state) : null

  return (
    <div className="font-site min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link to="/" className={`flex min-h-11 items-center gap-2 rounded-lg text-base font-semibold tracking-tight ${FOCUS}`}>
            <Logo className="h-7 w-7" />
            Appointly
          </Link>
          {session ? (
            <Link to="/dashboard" className={navPrimary}>
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-1">
              <Link to="/login" className={ghost}>
                Log in
              </Link>
              <Link to="/register" className={navPrimary}>
                Start free trial
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-12 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Pricing</p>
          <h1 className="font-display mt-3 text-[32px] font-medium leading-tight tracking-tight sm:text-5xl">
            Simple pricing that grows with you
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            Try every feature free for 14 days — no card required. Business is everything in Starter, plus advanced automation,
            control and reporting.
          </p>
          {status && (
            <p className="mx-auto mt-5 inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm text-slate-700">
              {status}
            </p>
          )}
        </div>

        {loading && (
          <div className="mx-auto mt-10 grid max-w-3xl animate-pulse gap-4 sm:grid-cols-2 sm:gap-5" aria-busy="true" aria-label="Loading plans">
            {[0, 1].map((i) => (
              <div key={i} className="h-120 rounded-2xl bg-slate-100" />
            ))}
          </div>
        )}
        {error && (
          <div className="mt-10">
            <ErrorState message={error} onRetry={reload} />
          </div>
        )}

        {data && (
          <>
            <div className="mx-auto mt-10 max-w-3xl sm:mt-12">
              <PlanCards
                plans={data.plans}
                action={action}
                currentPlanId={state?.kind === 'active' ? state.plan?.id : null}
              />
            </div>

            <section className="mx-auto mt-16 max-w-3xl sm:mt-20" aria-labelledby="compare-heading">
              <h2 id="compare-heading" className="font-display text-center text-2xl font-medium tracking-tight sm:text-3xl">
                Compare plans
              </h2>
              <p className="mt-2 text-center text-sm text-slate-600">Every plan includes your own booking page and unlimited bookings.</p>
              <div className="mt-6">
                <PlanComparison plans={data.plans} />
              </div>
            </section>
          </>
        )}

        <section className="mx-auto mt-16 max-w-2xl sm:mt-20" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-center text-2xl font-medium tracking-tight sm:text-3xl">
            Billing questions
          </h2>
          <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
            {FAQS.map((f) => (
              <Faq key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </section>

        <p className="mx-auto mt-10 flex max-w-lg items-start justify-center gap-2 text-center text-xs leading-relaxed text-slate-500">
          <ShieldCheck size={15} className="mt-px flex-none text-slate-400" aria-hidden />
          Prices in Philippine pesos. Paid by GoTyme Bank transfer or QR Ph and verified by our team — never charged automatically.
        </p>
      </main>
    </div>
  )
}
