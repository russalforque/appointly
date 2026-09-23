import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { unwrap } from './db'
import type { Plan, PlanCapability, Subscription } from './types'

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

export const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)

/** Billing dates as 'Mar 4, 2026'. */
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

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

/** Whether the business should be let into the app, or shown the billing paywall. */
export function hasBillingAccess(sub: Subscription | null): boolean {
  if (!sub) return true
  if (sub.status === 'active') return !isSubscriptionExpired(sub)
  if (sub.status === 'pending') return true
  if (sub.status === 'trialing') return !isTrialExpired(sub)
  return false // past_due, cancelled
}

/** Human-readable billing status, e.g. "Free trial — 10 days remaining". Source of truth is the DB row. */
export function billingStatusLabel(sub: Subscription | null, plans: Plan[]): string {
  if (!sub) return 'No subscription'
  const plan = plans.find((p) => p.id === sub.plan_id)
  switch (sub.status) {
    case 'active':
      if (isSubscriptionExpired(sub)) return `${plan?.name ?? 'Plan'} — expired`
      return sub.current_period_end ? `${plan?.name ?? 'Plan'} — active until ${fmtDate(sub.current_period_end)}` : `${plan?.name ?? 'Plan'} — active`
    case 'pending':
      return 'Payment being verified'
    case 'past_due':
      return 'Payment past due'
    case 'cancelled':
      return 'Subscription cancelled'
    case 'trialing': {
      if (!sub.trial_end) return 'Free trial'
      const days = Math.ceil((new Date(sub.trial_end).getTime() - Date.now()) / 86400000)
      return days > 0 ? `Free trial — ${days} day${days === 1 ? '' : 's'} remaining` : 'Trial expired'
    }
    default:
      return 'No subscription'
  }
}

/** Whole days from now until an ISO instant, rounded up. */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)

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
  if (!sub) return true // grandfathered, same as hasBillingAccess
  if (sub.status === 'trialing') return !isTrialExpired(sub) // the trial shows the full product
  if (sub.status !== 'active' || isSubscriptionExpired(sub)) return false
  return Boolean(plans.find((p) => p.id === sub.plan_id)?.capabilities?.includes(capability))
}

/** The cheapest active plan that unlocks a capability, for "upgrade to X" copy. */
export function planFor(plans: Plan[], capability: PlanCapability): Plan | undefined {
  return plans.filter((p) => p.capabilities?.includes(capability)).sort((a, b) => a.price_cents - b.price_cents)[0]
}
