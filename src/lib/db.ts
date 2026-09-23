type Result<T> = { data: T | null; error: { message: string } | null }

/** Turns raw Postgres/network messages into something a business owner can act on. */
export function friendlyError(msg: string): string {
  if (/duplicate key/i.test(msg)) return 'That already exists.'
  if (/foreign key/i.test(msg)) return "This item is in use and can't be changed."
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that."
  if (/failed to fetch|network/i.test(msg)) return 'Network error. Check your connection and try again.'
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
