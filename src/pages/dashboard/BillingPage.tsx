import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Clock3, CreditCard, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import {
  daysUntil,
  fetchPlans,
  fetchSubscription,
  fmtDate,
  fmtMoney,
  hasBillingAccess,
  isSubscriptionExpired,
  isTrialExpired,
  trialProgress,
} from '../../lib/billing'
import { fetchPaymentSettings, fetchPayments } from '../../lib/payments'
import { useLoad } from '../../lib/useLoad'
import { btn, btnGhost, panel } from '../../lib/ui'
import type { Plan, Subscription, SubscriptionStatus } from '../../lib/types'
import { Bone, ErrorText, PageHeaderSkeleton } from '../../components/Status'
import PaymentHistory from './PaymentHistory'
import { useBusiness } from './useBusiness'

// A pending payment is cleared by hand, so this only needs to be quick enough to feel live.
const PENDING_POLL_MS = 20000

type StatusTone = { label: string; pill: string; card: string; dot: string }

/** One place to decide how each subscription state looks and reads. */
const STATUS_TONE: Record<SubscriptionStatus | 'none' | 'trial_expired' | 'expired', StatusTone> = {
  active: { label: 'Active', pill: 'border-green-200 bg-green-50 text-green-700', card: 'border-neutral-200/70 bg-white', dot: 'bg-green-600' },
  trialing: { label: 'Free trial', pill: 'border-brand-200 bg-brand-50 text-brand-700', card: 'border-brand-200/70 bg-brand-50/40', dot: 'bg-brand-600' },
  trial_expired: { label: 'Trial ended', pill: 'border-amber-200 bg-amber-50 text-amber-700', card: 'border-amber-200/70 bg-amber-50/40', dot: 'bg-amber-500' },
  expired: { label: 'Expired', pill: 'border-amber-200 bg-amber-50 text-amber-700', card: 'border-amber-200/70 bg-amber-50/40', dot: 'bg-amber-500' },
  pending: { label: 'Payment being verified', pill: 'border-blue-200 bg-blue-50 text-blue-700', card: 'border-blue-200/70 bg-blue-50/40', dot: 'bg-blue-500' },
  past_due: { label: 'Past due', pill: 'border-red-200 bg-red-50 text-red-700', card: 'border-red-200/70 bg-red-50/40', dot: 'bg-red-500' },
  cancelled: { label: 'Cancelled', pill: 'border-neutral-200 bg-neutral-100 text-neutral-600', card: 'border-neutral-200/70 bg-neutral-50', dot: 'bg-neutral-400' },
  none: { label: 'No subscription', pill: 'border-neutral-200 bg-neutral-100 text-neutral-600', card: 'border-neutral-200/70 bg-white', dot: 'bg-neutral-400' },
}

const toneKey = (sub: Subscription | null) =>
  !sub
    ? 'none'
    : sub.status === 'trialing' && isTrialExpired(sub)
      ? 'trial_expired'
      : isSubscriptionExpired(sub)
        ? 'expired'
        : sub.status

export default function BillingPage() {
  const { business } = useBusiness()
  const navigate = useNavigate()
  const load = useCallback(async () => {
    const [plans, subscription, payments, settings] = await Promise.all([
      fetchPlans(),
      fetchSubscription(business.id),
      fetchPayments(business.id),
      fetchPaymentSettings(),
    ])
    return { plans, subscription, payments, settings }
  }, [business.id])
  const { data, loading, error, reload } = useLoad(load)
  const [refreshedFrom, setRefreshedFrom] = useState<unknown>(null)

  const latest = data?.payments[0] ?? null
  const pending = latest?.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const id = setInterval(reload, PENDING_POLL_MS)
    return () => clearInterval(id)
  }, [pending, reload])

  // reload() only bumps useLoad's tick, so "refreshing" lasts until a different result lands.
  const refreshing = refreshedFrom !== null && refreshedFrom === data

  function refresh() {
    setRefreshedFrom(data)
    reload()
  }

  if (loading)
    return (
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <PageHeaderSkeleton />
        <div className={panel}>
          <Bone className="h-5 w-24 rounded-full" />
          <Bone className="mt-3 h-7 w-40" />
          <Bone className="mt-2 h-3 w-56" />
        </div>
        <div className="grid animate-pulse gap-3 sm:grid-cols-2 sm:gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${panel} space-y-3`}>
              <Bone className="h-4 w-24" />
              <Bone className="h-7 w-20" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-3/4" />
              <Bone className="mt-2 h-11 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  if (error || !data) return <ErrorText message={error} />

  const { plans, subscription, payments, settings } = data
  const locked = !hasBillingAccess(subscription)
  const tone = STATUS_TONE[toneKey(subscription)]
  const currentPlan: Plan | undefined = plans.find((p) => p.id === subscription?.plan_id)
  const trialDaysLeft = subscription?.trial_end ? daysUntil(subscription.trial_end) : null
  const paymentsOff = !settings?.is_active
  const rejected = latest?.status === 'rejected' ? latest : null

  // How far through the trial we are, so "6 days left" has something to sit against.
  const progress = trialProgress(subscription)

  const detail = (() => {
    if (!subscription) return 'You are not on a plan yet. Choose one below to get started.'
    if (isSubscriptionExpired(subscription))
      return `Your plan ended on ${fmtDate(subscription.current_period_end!)}. Choose a plan below to continue.`
    switch (subscription.status) {
      case 'active':
        return subscription.current_period_end ? `Renews on ${fmtDate(subscription.current_period_end)}.` : 'Your plan is active.'
      case 'pending':
        return 'Your payment is being verified by our team.'
      case 'past_due':
        return 'Your last payment could not be completed. Choose a plan below to restore access.'
      case 'cancelled':
        return 'Your subscription was cancelled. Choose a plan below to start again.'
      case 'trialing':
        if (!subscription.trial_end) return 'You are on a free trial.'
        return trialDaysLeft && trialDaysLeft > 0
          ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left — your trial ends on ${fmtDate(subscription.trial_end)}.`
          : `Your trial ended on ${fmtDate(subscription.trial_end)}.`
      default:
        return ''
    }
  })()

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-[env(safe-area-inset-bottom)] sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Billing</h1>
        <p className="mt-1 text-sm text-neutral-500">Manage your subscription and payments.</p>
      </div>

      {locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
          <LockKeyhole size={18} className="mt-0.5 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-semibold">
              {subscription?.status === 'past_due'
                ? 'Your subscription has expired'
                : subscription?.status === 'cancelled'
                  ? 'Your subscription was cancelled'
                  : 'Your free trial has ended'}
            </p>
            <p className="mt-0.5 text-amber-700">
              Your dashboard is locked until you pick a plan. Bookings already made are safe.
            </p>
            <a href="#plans" className="mt-2 inline-flex h-9 items-center gap-1.5 text-sm font-semibold text-amber-900 underline underline-offset-2">
              See plans
            </a>
          </div>
        </div>
      )}

      {/* Status is the question this page exists to answer, so it gets the hero slot */}
      <section className={`rounded-2xl border p-4 shadow-sm shadow-neutral-900/[0.04] sm:p-5 ${tone.card}`}>
        <div className="flex items-start justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="-mr-1.5 flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-neutral-500 outline-none transition-colors hover:bg-white/60 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-60 sm:h-9"
          >
            <RefreshCw size={14} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden xs:inline">Refresh</span>
          </button>
        </div>

        <p className="mt-3 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
          {currentPlan?.name ?? (subscription?.status === 'trialing' ? 'Free trial' : 'No plan')}
          {currentPlan && (
            <span className="ml-1.5 text-sm font-medium text-neutral-500">
              {fmtMoney(currentPlan.price_cents, currentPlan.currency)} / {currentPlan.interval}
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-neutral-600">{detail}</p>

        {subscription?.current_period_start && !isSubscriptionExpired(subscription) && subscription.status === 'active' && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-200/70 pt-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-500">Started</dt>
              <dd className="font-medium text-neutral-900">{fmtDate(subscription.current_period_start)}</dd>
            </div>
            {subscription.current_period_end && (
              <div>
                <dt className="text-xs text-neutral-500">Expires</dt>
                <dd className="font-medium text-neutral-900">{fmtDate(subscription.current_period_end)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-neutral-500">Payment method</dt>
              <dd className="font-medium text-neutral-900">
                {subscription.provider === 'gotyme' ? 'GoTyme Bank / QR Ph' : 'Card / e-wallet'}
              </dd>
            </div>
          </dl>
        )}

        {progress !== null && (
          <div className="mt-3" aria-hidden="true">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
              <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
      </section>

      {pending && latest && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
          <Clock3 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Payment received — waiting for verification</p>
            <p className="mt-0.5 text-blue-700">
              Reference <span className="font-mono font-semibold">{latest.payment_reference}</span>. We&apos;ll notify you
              once your subscription is active, usually within one business day.
            </p>
          </div>
        </div>
      )}

      {rejected && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800">
          <XCircle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Payment rejected</p>
            <p className="mt-0.5 text-red-700">
              {rejected.rejection_reason ?? 'We could not verify this payment.'} You can submit a new payment below.
            </p>
          </div>
        </div>
      )}

      <div id="plans" className="scroll-mt-20">
        <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <CreditCard size={14} strokeWidth={2} />
          </span>
          {locked ? 'Choose a plan to continue' : 'Plans'}
        </h2>

        {paymentsOff && (
          <p className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} strokeWidth={1.75} className="mt-px shrink-0" />
            Payments are temporarily unavailable. Please try again shortly.
          </p>
        )}

        {plans.length === 0 ? (
          <div className={`${panel} mt-3 flex items-start gap-3 text-sm text-neutral-500`}>
            <AlertTriangle size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-neutral-400" />
            No plans are available right now. Please try again later.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {plans.map((plan) => {
              const isCurrent =
                subscription?.status === 'active' && subscription.plan_id === plan.id && !isSubscriptionExpired(subscription)
              const disabled = paymentsOff || pending
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm shadow-neutral-900/[0.04] sm:p-5 ${
                    isCurrent ? 'border-brand-600 ring-1 ring-brand-600' : 'border-neutral-200/70'
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      <Sparkles size={10} strokeWidth={2.5} />
                      Your plan
                    </span>
                  )}

                  <h3 className="text-base font-semibold text-neutral-900">{plan.name}</h3>
                  <p className="mt-1 flex items-baseline gap-1">
                    <span className="text-[26px] font-bold leading-none tracking-tight text-neutral-900">
                      {fmtMoney(plan.price_cents, plan.currency)}
                    </span>
                    <span className="text-sm text-neutral-500">/ {plan.interval}</span>
                  </p>

                  <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-600">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-green-50 text-green-600">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`${isCurrent ? btnGhost : btn} mt-5 flex h-12 w-full items-center justify-center gap-1.5 sm:h-11`}
                    disabled={disabled}
                    onClick={() => navigate(`/dashboard/billing/pay/${plan.id}`)}
                  >
                    {pending ? 'Payment being verified' : isCurrent ? 'Renew' : `Choose ${plan.name}`}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <PaymentHistory payments={payments} plans={plans} />

      <div className="flex items-start gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-100/60 px-4 py-3.5 text-xs text-neutral-500">
        <ShieldCheck size={16} strokeWidth={1.75} className="mt-px shrink-0 text-neutral-400" />
        <p>
          Payments are made by bank transfer or QR Ph through GoTyme Bank. Our team verifies every payment by hand before a
          subscription is activated — we never see your banking credentials.
        </p>
      </div>
    </div>
  )
}
