// Sign-in helpers shared by the login form. Supabase Auth only authenticates an email and a
// password, so a staff username is resolved to its account's email first.
import { supabase } from './supabase'

/** Why a username could not be turned into an account, when it could not. */
export type LoginLookup =
  | { ok: true; email: string }
  | { ok: false; reason: 'unknown' }
  | { ok: false; reason: 'unavailable'; detail: string }

/**
 * Turns whatever was typed into the sign-in field into the email Supabase authenticates.
 * Anything containing '@' is already an email and is passed straight through.
 *
 * The two failures are kept apart on purpose: "no account has this username" is something the
 * person can fix, while a failing lookup means the username RPC is missing or unreachable —
 * usually a migration that has not been run — and saying "wrong password" for that sends
 * whoever is signing in hunting for the wrong problem.
 */
export async function emailForLogin(identifier: string): Promise<LoginLookup> {
  const id = identifier.trim()
  if (id.includes('@')) return { ok: true, email: id }
  const { data, error } = await supabase.rpc('auth_email_for_username', { p_username: id.toLowerCase() })
  if (error) return { ok: false, reason: 'unavailable', detail: error.message }
  const email = (data as string | null) ?? null
  return email ? { ok: true, email } : { ok: false, reason: 'unknown' }
}

/** Where an account belongs right after signing in: staff go to the admin area. */
export async function homePathFor(): Promise<string> {
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (isAdmin !== true) return '/dashboard'
  // An admin who also runs a business of their own still has a dashboard worth landing on.
  const { data: hasBusiness } = await supabase.rpc('has_any_business')
  return hasBusiness === true ? '/dashboard' : '/admin'
}
