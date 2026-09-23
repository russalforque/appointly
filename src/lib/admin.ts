// Platform-admin (Appointly staff) reads. Every function here is backed by a security-definer
// RPC that re-checks is_platform_admin() in the database, so the UI gate is convenience only.
import { supabase } from './supabase'
import { friendlyError } from './db'
import type { AdminBusiness, AdminPlanStatus, AdminUser, Plan, Subscription } from './types'

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return data === true
}

/**
 * Whether the signed-in account has a business of its own. A staff-only admin does not, which
 * is what the admin shell uses to decide whether a dashboard link would lead anywhere.
 */
export async function hasAnyBusiness(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_any_business')
  if (error) return false
  return data === true
}

export async function adminListBusinesses(limit = 500): Promise<AdminBusiness[]> {
  const { data, error } = await supabase.rpc('admin_list_businesses', { p_limit: limit })
  if (error) throw new Error(friendlyError(error.message))
  return (data ?? []) as AdminBusiness[]
}

/** Every plan, including retired ones a business may still be sitting on. */
export async function adminListPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.rpc('admin_list_plans')
  if (error) throw new Error(friendlyError(error.message))
  return (data ?? []) as Plan[]
}

/**
 * Sets a business's plan by hand. `periodEnd` is an ISO timestamp; leaving it out lets the
 * database date the period from the plan's own interval.
 */
export async function adminSetBusinessPlan(args: {
  businessId: string
  planId: string
  status: AdminPlanStatus
  periodEnd?: string | null
  note?: string | null
}): Promise<Subscription> {
  const { data, error } = await supabase.rpc('admin_set_business_plan', {
    p_business_id: args.businessId,
    p_plan_id: args.planId,
    p_status: args.status,
    p_period_end: args.periodEnd ?? null,
    p_note: args.note ?? null,
  })
  if (error) throw new Error(friendlyError(error.message))
  return data as Subscription
}

/** The signed-in account's own sign-in name, or null for an account that signs in by email. */
export async function myUsername(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_username')
  if (error) return null
  return (data as string | null) ?? null
}

/** Sets (or clears, with null) an admin account's sign-in name. */
export async function adminSetUsername(email: string, username: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_set_username', { p_email: email, p_username: username })
  if (error) throw new Error(friendlyError(error.message))
}

export async function adminListAdmins(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_admins')
  if (error) throw new Error(friendlyError(error.message))
  return (data ?? []) as AdminUser[]
}

/** Promote or demote another account. The database refuses to let an admin demote themselves. */
export async function adminSetPlatformAdmin(email: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_platform_admin', { p_email: email, p_is_admin: isAdmin })
  if (error) throw new Error(friendlyError(error.message))
}

/** Case-insensitive match across the fields an admin would search by. */
export function matchesBusiness(b: AdminBusiness, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [b.name, b.slug, b.owner_name, b.owner_email, b.category].some((v) => v?.toLowerCase().includes(q))
}
