import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { friendlyError, unwrap } from './db'
import type { Plan, PlanCapability, Subscription, SubscriptionPayment } from './types'

export const fetchPlans = () =>
  unwrap<Plan[]>(supabase.from('plans').select('*').eq('is_active', true).order('sort_order'))

export const fetchSubscription = (businessId: string) =>
  unwrap<Subscription | null>(supabase.from('subscriptions').select('*').eq('business_id', businessId).maybeSingle())

/** Creates a Xendit invoice server-side and returns the URL to redirect to. */
export async function startCheckout(planId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ checkoutUrl?: string; error?: string }>('xendit-checkout', {
    body: { planId },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? error.message)
    }
    throw new Error(error.message)
  }
  if (!data?.checkoutUrl) throw new Error(data?.error ?? 'Could not start checkout')
  return data.checkoutUrl
}

/**
 * Switches a running plan to a cheaper one, right away and without a payment. The database
 * converts the unused time at the price ratio; upgrades always go through a payment instead.
 */
export async function changePlanNow(businessId: string, planId: string): Promise<Subscription> {
  const { data, error } = await supabase.rpc('change_plan_now', { p_business_id: businessId, p_plan_id: planId })
  if (error) throw new Error(friendlyError(error.message))
  return data as Subscription
}

/** Cancel (don't renew) or resume a running plan. Nothing is ever charged automatically either way. */
export async function setCancelAtPeriodEnd(businessId: string, cancel: boolean): Promise<Subscription> {
  const { data, error } = await supabase.rpc('set_subscription_cancellation', { p_business_id: businessId, p_cancel: cancel })
  if (error) throw new Error(friendlyError(error.message))
  return data as Subscription
}

export const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(
    cents / 100,
  )

/** Billing dates as 'Mar 4, 2026'. */
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Whole days from now until an ISO instant, rounded up. */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** True once a trialing subscription's trial_end has passed. */
export function isTrialExpired(sub: Subscription | null): boolean {
  return Boolean(sub && sub.status === 'trialing' && sub.trial_end && new Date(sub.trial_end).getTime() < Date.now())
}

/** True once a paid period has run out. The database expires these lazily, so the UI checks too. */
export function isSubscriptionExpired(sub: Subscription | null): boolean {
  return Boolean(
    sub && sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end).getTime() < Date.now(),
  )
}

/**
 * Every state a business's billing can be in, derived from the subscription row alone (the row
 * is read through RLS, so it is the database's word, not anything the browser kept).
 */
export type BillingState =
  /** No subscription row: a business from before billing existed, treated as fully unlocked. */
  | { kind: 'none' }
  | { kind: 'trial'; endsAt: string | null; daysLeft: number | null }
  | { kind: 'trial_expired'; endedAt: string | null }
  /** A paid plan inside its period. `cancelling` = it will end rather than wait for a renewal. */
  | { kind: 'active'; plan: Plan | undefined; endsAt: string | null; daysLeft: number | null; cancelling: boolean }
  | { kind: 'expired'; plan: Plan | undefined; endedAt: string | null }
  | { kind: 'cancelled'; plan: Plan | undefined; endedAt: string | null }
  /** Paid through a gateway and waiting for its webhook. */
  | { kind: 'processing'; plan: Plan | undefined }

export function billingState(sub: Subscription | null, plans: Plan[]): BillingState {
  if (!sub) return { kind: 'none' }
  const plan = plans.find((p) => p.id === sub.plan_id)
  switch (sub.status) {
    case 'trialing':
      return isTrialExpired(sub)
        ? { kind: 'trial_expired', endedAt: sub.trial_end }
        : { kind: 'trial', endsAt: sub.trial_end, daysLeft: sub.trial_end ? daysUntil(sub.trial_end) : null }
    case 'active':
      if (isSubscriptionExpired(sub)) {
        // The database flips these hourly; until then the end date already decides.
        return sub.cancel_at_period_end
          ? { kind: 'cancelled', plan, endedAt: sub.current_period_end }
          : { kind: 'expired', plan, endedAt: sub.current_period_end }
      }
      return {
        kind: 'active',
        plan,
        endsAt: sub.current_period_end,
        daysLeft: sub.current_period_end ? daysUntil(sub.current_period_end) : null,
        cancelling: sub.cancel_at_period_end,
      }
    case 'past_due':
      return { kind: 'expired', plan, endedAt: sub.current_period_end }
    case 'cancelled':
      return { kind: 'cancelled', plan, endedAt: sub.current_period_end }
    case 'pending':
      return { kind: 'processing', plan }
  }
}

/** Whether the business should be let into the app, or shown the billing paywall. */
export function hasBillingAccess(sub: Subscription | null): boolean {
  const kind = billingState(sub, []).kind
  return kind === 'none' || kind === 'trial' || kind === 'active' || kind === 'processing'
}

/** Short status for the sidebar, e.g. "Business plan" or "Free trial — 10 days left". */
export function billingStatusLabel(sub: Subscription | null, plans: Plan[]): string {
  const s = billingState(sub, plans)
  switch (s.kind) {
    case 'none':
      return 'Booking dashboard'
    case 'trial':
      return s.daysLeft && s.daysLeft > 0 ? `Free trial — ${plural(s.daysLeft, 'day')} left` : 'Free trial'
    case 'trial_expired':
      return 'Trial ended'
    case 'active':
      return s.cancelling && s.endsAt ? `${s.plan?.name ?? 'Plan'} — ends ${fmtDate(s.endsAt)}` : `${s.plan?.name ?? 'Paid'} plan`
    case 'expired':
      return `${s.plan?.name ?? 'Plan'} — expired`
    case 'cancelled':
      return 'Subscription cancelled'
    case 'processing':
      return 'Payment being verified'
  }
}

/** How far through the trial period we are, 0–1, or null when there is no dated trial. */
export function trialProgress(sub: Subscription | null): number | null {
  if (!sub || sub.status !== 'trialing' || !sub.trial_start || !sub.trial_end) return null
  const start = new Date(sub.trial_start).getTime()
  const end = new Date(sub.trial_end).getTime()
  if (end <= start) return null
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
}

/**
 * Whether a business's live subscription includes a capability. Mirrors the database's
 * business_has_capability(), which is where the rule is actually enforced — this copy only
 * decides what the dashboard shows.
 */
export function hasCapability(sub: Subscription | null, plans: Plan[], capability: PlanCapability): boolean {
  const s = billingState(sub, plans)
  if (s.kind === 'none' || s.kind === 'trial') return true // grandfathered / the trial shows the full product
  if (s.kind !== 'active') return false
  return Boolean(s.plan?.capabilities?.includes(capability))
}

/** Mirrors business_staff_limit(): how many staff may be active at once, or null for unlimited. */
export function staffLimit(sub: Subscription | null, plans: Plan[]): number | null {
  const s = billingState(sub, plans)
  if (s.kind === 'none' || s.kind === 'trial') return null
  if (s.kind === 'active') return s.plan?.max_staff ?? null
  const limits = plans.map((p) => p.max_staff).filter((n): n is number => n !== null)
  return limits.length ? Math.min(...limits) : null
}

/** The cheapest active plan that unlocks a capability, for "upgrade to X" copy. */
export function planFor(plans: Plan[], capability: PlanCapability): Plan | undefined {
  return plans.filter((p) => p.capabilities?.includes(capability)).sort((a, b) => a.price_cents - b.price_cents)[0]
}

/**
 * Days of `to` that the unused part of a running `from` plan converts into. Same formula as the
 * database's convert_plan_credit() — shown as an estimate, since the clock keeps running until
 * the switch actually happens.
 */
export function creditDays(endsAt: string | null, from: Plan | undefined, to: Plan): number {
  if (!endsAt || !from) return 0
  const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now())
  const converted = remaining * (from.price_cents / Math.max(1, to.price_cents))
  return Math.min(366, Math.floor(converted / 86400000))
}

/** The date `days` from now, for "your plan runs until around …". */
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString()

/** What a plan card's button does, given where the business is now. */
export type PlanIntent = 'current' | 'choose' | 'renew' | 'upgrade' | 'downgrade' | 'pending' | 'unavailable'

export interface PlanAction {
  intent: PlanIntent
  label: string
  disabled: boolean
}

export function planAction(
  plan: Plan,
  state: BillingState,
  opts: { paymentPending: boolean; paymentsOff: boolean },
): PlanAction {
  const current = state.kind === 'active' ? state.plan : undefined

  if (current?.id === plan.id) return { intent: 'current', label: 'Current plan', disabled: true }
  if (opts.paymentPending || state.kind === 'processing')
    return { intent: 'pending', label: 'Payment being verified', disabled: true }

  if (current) {
    // Switching down needs no payment, so it stays available even while payments are switched off.
    if (plan.price_cents < current.price_cents) return { intent: 'downgrade', label: `Switch to ${plan.name}`, disabled: false }
    return { intent: 'upgrade', label: `Upgrade to ${plan.name}`, disabled: opts.paymentsOff }
  }

  const lapsed = (state.kind === 'expired' || state.kind === 'cancelled') && state.plan?.id === plan.id
  return lapsed
    ? { intent: 'renew', label: state.kind === 'cancelled' ? `Reactivate ${plan.name}` : `Renew ${plan.name}`, disabled: opts.paymentsOff }
    : { intent: 'choose', label: `Choose ${plan.name}`, disabled: opts.paymentsOff }
}

/** The latest submitted payment, as far as the plan cards and banners care. */
export function paymentStatusOf(payments: SubscriptionPayment[]): 'pending' | 'rejected' | 'approved' | null {
  const latest = payments[0]
  if (!latest) return null
  if (latest.status === 'pending' || latest.status === 'rejected' || latest.status === 'approved') return latest.status
  return null
}
