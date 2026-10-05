import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Info,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react'
import {
  billingState,
  changePlanNow,
  creditDays,
  daysFromNow,
  fetchPlans,
  fetchSubscription,
  fmtDate,
  fmtMoney,
  hasBillingAccess,
  planAction,
  setCancelAtPeriodEnd,
  staffLimit,
  trialProgress,
  type BillingState,
  type PlanAction,
} from '../../lib/billing'
import { fetchPaymentSettings, fetchPayments } from '../../lib/payments'
import { CAPABILITY_INFO, RECOMMENDED_PLAN_ID, planCopy } from '../../lib/plans'
import { supabase } from '../../lib/supabase'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../lib/confirm'
import { useToast } from '../../lib/toast'
import { actionPrimary, actionSecondary, panel } from '../../lib/ui'
import type { Plan, Subscription, SubscriptionPayment } from '../../lib/types'
import { Bone, ErrorState, PageHeaderSkeleton } from '../../components/Status'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { PlanCards, PlanComparison } from '../../components/PlanCards'
import PaymentHistory from './PaymentHistory'
import { useBusiness } from './useBusiness'

// A pending payment is cleared by hand, so this only needs to be quick enough to feel live.
// (The subscription row itself also arrives over realtime the moment it is approved.)
const PENDING_POLL_MS = 20000
/** From this many days out, renewing becomes the card's main action. */
const RENEW_SOON_DAYS = 7

type Pill = { label: string; className: string }

function statusPill(s: BillingState): Pill {
  const amber = 'border-amber-200 bg-amber-50 text-amber-700'
  switch (s.kind) {
    case 'none':
      return { label: 'Active', className: 'border-green-200 bg-green-50 text-green-700' }
    case 'trial':
      return { label: 'Free trial', className: 'border-brand-200 bg-brand-50 text-brand-700' }
    case 'trial_expired':
      return { label: 'Trial ended', className: amber }
    case 'active':
      return s.cancelling
        ? { label: 'Cancels at period end', className: amber }
        : { label: 'Active', className: 'border-green-200 bg-green-50 text-green-700' }
    case 'expired':
      return { label: 'Expired', className: 'border-red-200 bg-red-50 text-red-700' }
    case 'cancelled':
      return { label: 'Cancelled', className: 'border-neutral-200 bg-neutral-100 text-neutral-600' }
    case 'processing':
      return { label: 'Payment processing', className: 'border-blue-200 bg-blue-50 text-blue-700' }
  }
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-neutral-900">{children}</dd>
    </div>
  )
}

function paymentSummary(latest: SubscriptionPayment | undefined): string {
  if (!latest) return 'No payments yet'
  switch (latest.status) {
    case 'pending':
      return 'Awaiting verification'
    case 'rejected':
      return 'Last payment rejected'
    case 'approved':
      return latest.verified_at ? `Verified ${fmtDate(latest.verified_at)}` : 'Verified'
    case 'expired':
      return 'Last payment expired'
    default:
      return '—'
  }
}

/** Switching down: spell out exactly what changes before anything does. */
function DowngradeDialog({
  from,
  to,
  endsAt,
  activeStaff,
  onClose,
  onConfirm,
}: {
  from: Plan
  to: Plan
  endsAt: string | null
  activeStaff: number
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lost = (from.capabilities ?? []).filter((c) => !(to.capabilities ?? []).includes(c))
  const days = creditDays(endsAt, from, to)
  const until = daysFromNow(days)
  const overStaff = to.max_staff !== null && activeStaff > to.max_staff

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your plan.')
      setBusy(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      titleId="downgrade-title"
      title={`Switch to ${to.name}?`}
      maxWidth="max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={actionSecondary} onClick={onClose} disabled={busy}>
            Keep {from.name}
          </button>
          <button type="button" className={actionPrimary} onClick={confirm} disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            Switch to {to.name}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-neutral-700">
        <p>
          The switch happens right away and needs no payment. Your remaining {from.name} time becomes about{' '}
          <strong className="font-semibold text-neutral-900">{days} days of {to.name}</strong>, so your plan runs until around{' '}
          <strong className="font-semibold text-neutral-900">{fmtDate(until)}</strong>.
        </p>

        {lost.length > 0 && (
          <div>
            <p className="font-semibold text-neutral-900">You'll lose access to</p>
            <ul className="mt-2 space-y-2">
              {lost.map((c) => (
                <li key={c} className="flex items-start gap-2.5">
                  <XCircle size={16} strokeWidth={1.75} className="mt-0.5 flex-none text-neutral-400" aria-hidden />
                  <span>
                    <span className="font-medium text-neutral-900">{CAPABILITY_INFO[c].title}</span>
                    <span className="block text-xs text-neutral-500">{CAPABILITY_INFO[c].description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {overStaff && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800">
            <Users size={16} strokeWidth={1.75} className="mt-0.5 flex-none" aria-hidden />
            <p>
              You have {activeStaff} active staff and {to.name} includes {to.max_staff}. Everyone stays bookable, but you
              won't be able to add or reactivate staff until you're below {to.max_staff}.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-xl bg-neutral-50 px-3.5 py-3 text-neutral-600">
          <ShieldCheck size={16} strokeWidth={1.75} className="mt-0.5 flex-none text-neutral-400" aria-hidden />
          <p>
            Nothing is deleted. Bookings, customers, staff schedules, policies and settings are all kept, and rules you've already
            set keep working — you just won't be able to change them to custom values on {to.name}.
          </p>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-red-600">
            <AlertTriangle size={15} className="mt-0.5 flex-none" aria-hidden /> {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

export default function BillingPage() {
  const { business, billing, reload: reloadShell } = useBusiness()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const load = useCallback(async () => {
    const [plans, subscription, payments, settings, activeStaff] = await Promise.all([
      fetchPlans(),
      fetchSubscription(business.id),
      fetchPayments(business.id),
      fetchPaymentSettings(),
      supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id)
        .eq('is_active', true)
        .then(({ count, error }) => {
          if (error) throw new Error(error.message)
          return count ?? 0
        }),
    ])
    return { plans, subscription, payments, settings, activeStaff }
  }, [business.id])
  const { data, loading, error, reload } = useLoad(load)
  const [refreshedFrom, setRefreshedFrom] = useState<unknown>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [downgradeTo, setDowngradeTo] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [activated, setActivated] = useState<string | null>(null)
  const plansRef = useRef<HTMLDivElement>(null)

  const latest = data?.payments[0]
  const pending = latest?.status === 'pending'
  useEffect(() => {
    if (!pending) return
    const id = setInterval(reload, PENDING_POLL_MS)
    return () => clearInterval(id)
  }, [pending, reload])

  // The shell hears about subscription changes over realtime; follow it rather than wait for a poll.
  const shellSub = billing.subscription
  const firstShellSub = useRef(shellSub)
  useEffect(() => {
    if (shellSub !== firstShellSub.current) reload()
  }, [shellSub, reload])

  // A payment we watched go from pending to approved: celebrate once, and make sure the shell's
  // permissions follow (the realtime event normally gets there first).
  const watchedPending = useRef<string | null>(null)
  useEffect(() => {
    if (!data) return
    const first = data.payments[0]
    if (first?.status === 'pending') watchedPending.current = first.id
    else if (watchedPending.current && first?.id === watchedPending.current && first.status === 'approved') {
      watchedPending.current = null
      const name = data.plans.find((p) => p.id === first.plan_id)?.name ?? 'Your'
      setActivated(name)
      toast(`${name} plan is active`)
      reloadShell()
    }
  }, [data, toast, reloadShell])

  // ?plan=business (from an upgrade prompt) jumps to the plans; ?change=starter opens the switch.
  const focusPlanId = params.get('plan')
  const changeParam = params.get('change')
  useEffect(() => {
    if (!data) return
    if (focusPlanId || window.location.hash === '#plans')
      plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data, focusPlanId])

  function closeDowngrade() {
    setDowngradeTo(null)
    if (changeParam)
      setParams(
        (p) => {
          p.delete('change')
          return p
        },
        { replace: true },
      )
  }

  // reload() only bumps useLoad's tick, so "refreshing" lasts until a different result lands.
  const refreshing = refreshedFrom !== null && refreshedFrom === data

  if (loading)
    return (
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
        <PageHeaderSkeleton />
        <div className={panel}>
          <Bone className="h-5 w-24 rounded-full" />
          <Bone className="mt-3 h-7 w-40" />
          <Bone className="mt-2 h-3 w-56" />
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="h-9" />
            ))}
          </div>
        </div>
        <div className="grid animate-pulse gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${panel} space-y-3`}>
              <Bone className="h-4 w-24" />
              <Bone className="h-8 w-28" />
              <Bone className="h-11 w-full rounded-xl" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  if (error || !data) return <ErrorState message={error} onRetry={reload} />

  const { plans, subscription, payments, settings, activeStaff } = data
  const state = billingState(subscription, plans)
  const locked = !hasBillingAccess(subscription)
  const paymentsOff = !settings?.is_active
  const rejected = latest?.status === 'rejected' ? latest : null
  const progress = trialProgress(subscription)
  const pill = statusPill(state)
  const currentPlan = state.kind === 'active' || state.kind === 'expired' || state.kind === 'cancelled' || state.kind === 'processing' ? state.plan : undefined
  const limit = staffLimit(subscription, plans)
  const actionFor = (plan: Plan) => planAction(plan, state, { paymentPending: pending, paymentsOff })

  function refresh() {
    setRefreshedFrom(data)
    reload()
    reloadShell()
  }

  function scrollToPlans() {
    plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function onPlanAction(plan: Plan, action: PlanAction) {
    if (action.intent === 'downgrade') setDowngradeTo(plan)
    else navigate(`/dashboard/billing/pay/${plan.id}`)
  }

  async function toggleCancel(sub: Subscription, cancel: boolean, planName: string) {
    if (cancel) {
      const ok = await confirm({
        title: `Cancel your ${planName} plan?`,
        body: `Nothing is ever charged automatically — cancelling means your plan won't be renewed. You keep everything in ${planName} until ${fmtDate(sub.current_period_end!)}. After that the dashboard locks until you choose a plan again; your bookings, customers and settings are kept.`,
        confirmLabel: 'Cancel plan',
        cancelLabel: `Keep ${planName}`,
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await setCancelAtPeriodEnd(business.id, cancel)
      toast(cancel ? `Your plan will end on ${fmtDate(sub.current_period_end!)}` : `${planName} will continue`)
      reload()
      reloadShell()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update your plan', 'error')
    } finally {
      setBusy(false)
    }
  }

  const title =
    state.kind === 'trial' || state.kind === 'trial_expired'
      ? 'Free trial'
      : state.kind === 'none'
        ? 'Appointly'
        : (currentPlan?.name ?? 'No plan')

  const summary = (() => {
    switch (state.kind) {
      case 'none':
        return 'Your account has full access to Appointly.'
      case 'trial':
        return state.daysLeft && state.daysLeft > 0
          ? `You're trying every Business feature. ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} left — choose a plan any time to keep going.`
          : "You're trying every Business feature."
      case 'trial_expired':
        return 'Your free trial has ended. Choose a plan to unlock your dashboard — everything you set up is still here.'
      case 'active':
        if (state.cancelling) return `Your plan won't be renewed. You keep full access until ${fmtDate(state.endsAt!)}.`
        return currentPlan ? planCopy(currentPlan).audience : ''
      case 'expired':
        return `Your plan ended${state.endedAt ? ` on ${fmtDate(state.endedAt)}` : ''}. Renew to unlock your dashboard — your data is safe.`
      case 'cancelled':
        return 'Your subscription was cancelled. Reactivate any time — everything you set up is still here.'
      case 'processing':
        return "We're confirming your payment. Your plan activates automatically."
    }
  })()

  const renewSoon = state.kind === 'active' && !state.cancelling && state.daysLeft !== null && state.daysLeft <= RENEW_SOON_DAYS
  const downgradeFrom = state.kind === 'active' ? state.plan : undefined
  // ?change=<plan> (from the pricing page) asks for the switch dialog, if that switch is a downgrade.
  const requested = changeParam ? plans.find((p) => p.id === changeParam) : undefined
  const downgradeTarget =
    downgradeTo ?? (requested && downgradeFrom && requested.price_cents < downgradeFrom.price_cents ? requested : null)

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <PageHeader title="Plans & billing" subtitle="Your plan, what it includes, and your payments." />

      {activated && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3.5 text-sm text-green-800">
          <CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Payment verified — your {activated} plan is active</p>
            <p className="mt-0.5 text-green-700">Everything it includes is unlocked now. No refresh needed.</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link to="/dashboard" className="inline-flex h-9 items-center gap-1 font-semibold text-green-900 underline underline-offset-2">
                Go to dashboard
              </Link>
              {currentPlan?.capabilities?.includes('analytics') && (
                <Link to="/dashboard/reports" className="inline-flex h-9 items-center gap-1 font-semibold text-green-900 underline underline-offset-2">
                  Open reports
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {locked && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
          <LockKeyhole size={18} className="mt-0.5 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-semibold">
              {state.kind === 'expired'
                ? 'Your plan has expired'
                : state.kind === 'cancelled'
                  ? 'Your subscription was cancelled'
                  : 'Your free trial has ended'}
            </p>
            <p className="mt-0.5 text-amber-700">
              Your dashboard is locked until you choose a plan. Your booking page, bookings, customers and settings are safe.
            </p>
          </div>
        </div>
      )}

      {pending && latest && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
          <Clock3 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Payment received — waiting for verification</p>
            <p className="mt-0.5 text-blue-700">
              Reference <span className="font-mono font-semibold">{latest.payment_reference}</span>. Your{' '}
              {plans.find((p) => p.id === latest.plan_id)?.name ?? ''} plan activates as soon as our team verifies it, usually within
              one business day. This page updates by itself.
            </p>
          </div>
        </div>
      )}

      {rejected && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 sm:flex-row sm:items-start">
          <XCircle size={18} strokeWidth={1.75} className="mt-0.5 hidden shrink-0 sm:block" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">We couldn't verify your last payment</p>
            <p className="mt-0.5 text-red-700">
              {rejected.rejection_reason ?? 'The transfer could not be matched.'} No plan change was made. You can submit a new payment
              with a clearer receipt.
            </p>
          </div>
          {!paymentsOff && (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/billing/pay/${rejected.plan_id}`)}
              className={`${actionSecondary} flex-none`}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Current plan: the question this page exists to answer */}
      <section className={`${panel} sm:p-6`} aria-labelledby="current-plan-heading">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Current plan</p>
            <h2 id="current-plan-heading" className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">{title}</span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${pill.className}`}>
                {pill.label}
              </span>
            </h2>
            {currentPlan && (
              <p className="mt-1 text-sm text-neutral-500">
                <span className="font-semibold text-neutral-900">{fmtMoney(currentPlan.price_cents, currentPlan.currency)}</span> /{' '}
                {currentPlan.interval}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh billing status"
            className="-mr-1.5 flex h-11 flex-none items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-60 sm:h-9"
          >
            <RefreshCw size={14} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <p className="mt-3 text-sm text-neutral-600">{summary}</p>

        {progress !== null && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-neutral-100 pt-4 sm:grid-cols-4">
          <Detail label="Billing cycle">
            {state.kind === 'trial' || state.kind === 'trial_expired'
              ? 'Free trial'
              : currentPlan
                ? `${currentPlan.interval === 'year' ? 'Yearly' : 'Monthly'} · prepaid`
                : '—'}
          </Detail>
          <Detail
            label={
              state.kind === 'trial'
                ? 'Trial ends'
                : state.kind === 'active'
                  ? state.cancelling
                    ? 'Ends on'
                    : 'Renew by'
                  : 'Ended on'
            }
          >
            {state.kind === 'trial'
              ? state.endsAt
                ? fmtDate(state.endsAt)
                : '—'
              : state.kind === 'active'
                ? state.endsAt
                  ? fmtDate(state.endsAt)
                  : '—'
                : state.kind === 'trial_expired' || state.kind === 'expired' || state.kind === 'cancelled'
                  ? state.endedAt
                    ? fmtDate(state.endedAt)
                    : '—'
                  : '—'}
          </Detail>
          <Detail label="Payment">{paymentSummary(latest)}</Detail>
          <Detail label="Staff">
            {limit === null ? `${activeStaff} active · unlimited` : `${activeStaff} of ${limit} active`}
          </Detail>
        </dl>

        {limit !== null && (
          <div className="mt-3" aria-hidden="true">
            <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${activeStaff >= limit ? 'bg-amber-500' : 'bg-brand-600'}`}
                style={{ width: `${Math.min(100, (activeStaff / limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* What the owner can do from here. Every action is one the payment setup actually supports. */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {state.kind === 'active' && currentPlan && subscription && (
            <>
              {state.cancelling ? (
                <button
                  type="button"
                  className={actionPrimary}
                  disabled={busy}
                  onClick={() => toggleCancel(subscription, false, currentPlan.name)}
                >
                  {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
                  Resume {currentPlan.name}
                </button>
              ) : (
                <button
                  type="button"
                  className={renewSoon ? actionPrimary : actionSecondary}
                  disabled={pending || paymentsOff}
                  onClick={() => navigate(`/dashboard/billing/pay/${currentPlan.id}`)}
                >
                  {renewSoon ? `Renew ${currentPlan.name}` : 'Pay next month early'}
                </button>
              )}
              <button type="button" className={actionSecondary} onClick={scrollToPlans}>
                Change plan
              </button>
              {!state.cancelling && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleCancel(subscription, true, currentPlan.name)}
                  className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-brand-600 sm:ml-auto sm:h-9 sm:rounded-lg"
                >
                  Cancel plan
                </button>
              )}
            </>
          )}
          {(state.kind === 'trial' || state.kind === 'trial_expired') && (
            <button type="button" className={actionPrimary} onClick={scrollToPlans}>
              Choose a plan <ArrowRight size={15} aria-hidden />
            </button>
          )}
          {(state.kind === 'expired' || state.kind === 'cancelled') && (
            <>
              {state.plan && (
                <button
                  type="button"
                  className={actionPrimary}
                  disabled={pending || paymentsOff}
                  onClick={() => navigate(`/dashboard/billing/pay/${state.plan!.id}`)}
                >
                  {state.kind === 'cancelled' ? 'Reactivate' : 'Renew'} {state.plan.name}
                </button>
              )}
              <button type="button" className={actionSecondary} onClick={scrollToPlans}>
                {state.plan ? 'See all plans' : 'Choose a plan'}
              </button>
            </>
          )}
        </div>

        {state.kind === 'active' && !state.cancelling && (
          <p className="mt-3 flex items-start gap-2 text-xs text-neutral-500">
            <Info size={13} className="mt-px flex-none" aria-hidden />
            Nothing is charged automatically. Paying early adds a full {currentPlan?.interval ?? 'month'} after your current end date.
          </p>
        )}
      </section>

      {/* Plans */}
      <section ref={plansRef} id="plans" className="scroll-mt-20" aria-labelledby="plans-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="plans-heading" className="text-[17px] font-semibold text-neutral-900">
              {locked ? 'Choose a plan to continue' : 'Plans'}
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">Business is everything in Starter, plus automation, control and reporting.</p>
          </div>
        </div>

        {paymentsOff && (
          <p className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} strokeWidth={1.75} className="mt-px shrink-0" />
            New payments are temporarily unavailable. Please try again shortly.
          </p>
        )}

        {plans.length === 0 ? (
          <div className={`${panel} mt-3 flex items-start gap-3 text-sm text-neutral-500`}>
            <AlertTriangle size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-neutral-400" />
            No plans are available right now. Please try again later.
          </div>
        ) : (
          <div className="mt-4">
            <PlanCards
              plans={plans}
              currentPlanId={state.kind === 'active' ? state.plan?.id : null}
              focusPlanId={focusPlanId}
              action={(plan) => {
                const a = actionFor(plan)
                // One filled button: the upgrade/renewal, or the plan they came for (Business by default).
                const primary =
                  a.intent === 'upgrade' ||
                  a.intent === 'renew' ||
                  (a.intent === 'choose' && plan.id === (focusPlanId ?? RECOMMENDED_PLAN_ID))
                return (
                  <button
                    type="button"
                    disabled={a.disabled}
                    onClick={() => onPlanAction(plan, a)}
                    className={`${primary ? actionPrimary : actionSecondary} h-12! w-full sm:h-11!`}
                  >
                    {a.intent === 'current' && <CheckCircle2 size={16} aria-hidden />}
                    {a.label}
                  </button>
                )
              }}
              note={(plan) => {
                const a = actionFor(plan)
                if (a.intent === 'upgrade' && state.kind === 'active') {
                  const days = creditDays(state.endsAt, state.plan, plan)
                  return days > 0
                    ? `Your unused ${state.plan?.name} time adds about ${days} extra day${days === 1 ? '' : 's'} of ${plan.name}.`
                    : null
                }
                if (a.intent === 'downgrade') return 'Takes effect immediately — no payment needed.'
                if (a.intent === 'current' && state.kind === 'active' && state.endsAt)
                  return state.cancelling ? `Ends on ${fmtDate(state.endsAt)}.` : `Paid through ${fmtDate(state.endsAt)}.`
                return null
              }}
            />

            <button
              type="button"
              onClick={() => setShowCompare((v) => !v)}
              aria-expanded={showCompare}
              aria-controls="plan-comparison"
              className="mx-auto mt-4 flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-neutral-600 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {showCompare ? 'Hide' : 'Compare all'} features
              <ChevronDown size={16} className={`transition-transform ${showCompare ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {showCompare && (
              <div id="plan-comparison" className="mt-2">
                <PlanComparison plans={plans} />
              </div>
            )}
          </div>
        )}
      </section>

      <PaymentHistory payments={payments} plans={plans} />

      <div className="flex items-start gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-100/60 px-4 py-3.5 text-xs text-neutral-500">
        <ShieldCheck size={16} strokeWidth={1.75} className="mt-px shrink-0 text-neutral-400" />
        <p>
          Plans are prepaid by GoTyme Bank transfer or QR Ph — Appointly never charges you automatically. Our team verifies every
          payment by hand before activating it, and we never see your banking credentials.
        </p>
      </div>

      {downgradeTarget && downgradeFrom && (
        <DowngradeDialog
          from={downgradeFrom}
          to={downgradeTarget}
          endsAt={state.kind === 'active' ? state.endsAt : null}
          activeStaff={activeStaff}
          onClose={closeDowngrade}
          onConfirm={async () => {
            await changePlanNow(business.id, downgradeTarget.id)
            closeDowngrade()
            toast(`You're now on ${downgradeTarget.name}`)
            reload()
            reloadShell()
          }}
        />
      )}
    </div>
  )
}

