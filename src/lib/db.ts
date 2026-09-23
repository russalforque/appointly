type Result<T> = { data: T | null; error: { message: string } | null }

/**
 * Postgres messages that name schema internals — a table, a column, a constraint, a function
 * signature. The RPCs in supabase/migrations raise sentences written for the person reading
 * them, so the default is to pass a message through; these patterns are what must not be.
 */
const INTERNAL = [
  /relation ".*" does not exist/i,
  /column ".*" (does not exist|of relation)/i,
  /function .*\(.*\) does not exist/i,
  /violates (check|not-null|exclusion) constraint/i,
  /null value in column/i,
  /invalid input (syntax|value) for/i,
  /syntax error/i,
  /operator does not exist/i,
  /could not (serialize|obtain)/i,
  /deadlock detected/i,
  /^pgrst/i,
  /schema cache/i,
  /stack depth/i,
  /statement timeout|canceling statement/i,
]

/** Turns raw Postgres/network messages into something a business owner can act on. */
export function friendlyError(msg: string): string {
  if (/duplicate key/i.test(msg)) return 'That already exists.'
  if (/foreign key/i.test(msg)) return "This item is in use and can't be changed."
  if (/row-level security|permission denied|insufficient privilege/i.test(msg))
    return "You don't have permission to do that."
  if (/failed to fetch|network|load failed/i.test(msg))
    return 'Network error. Check your connection and try again.'
  if (/jwt|token is expired|invalid claim/i.test(msg))
    return 'Your session has expired. Sign in again to continue.'
  if (/payload too large|exceeded the maximum allowed size/i.test(msg))
    return 'That file is too large.'
  if (/mime type .* is not supported|invalid_mime_type/i.test(msg))
    return 'That file type is not allowed.'
  if (INTERNAL.some((re) => re.test(msg))) return 'Something went wrong. Please try again.'
  return msg
}

/** Awaits a Supabase query and throws on error. */
export async function unwrap<T>(q: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

/** Trimmed form value, or null when empty. */
export function formStr(f: FormData, key: string): string | null {
  return String(f.get(key) ?? '').trim() || null
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
