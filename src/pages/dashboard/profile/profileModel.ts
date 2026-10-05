import type { Business } from '../../../lib/types'

export const LIMITS = {
  name: 120,
  category: 80,
  tagline: 120,
  description: 500,
  about: 2000,
  phone: 40,
  email: 254,
  address: 300,
  city: 120,
  region: 120,
  postal_code: 20,
  booking_instructions: 500,
  confirmation_message: 500,
  policy: 1000,
  url: 2048,
} as const

export const SLUG_MIN = 3
export const SLUG_MAX = 63

export const DEFAULT_ACCENT = '#18257d'
export const ACCENT_PRESETS = ['#18257d', '#4f46e5', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777', '#171717']

/** Suggested categories; anything else is typed in through "Other". */
export const CATEGORIES = [
  'Salon',
  'Barbershop',
  'Spa',
  'Massage',
  'Nail salon',
  'Beauty & aesthetics',
  'Dental clinic',
  'Medical clinic',
  'Physical therapy',
  'Wellness',
  'Fitness & training',
  'Tattoo & piercing',
  'Car detailing',
  'Cleaning',
  'Pet grooming',
  'Veterinary clinic',
  'Repair',
  'Photography',
  'Tutoring',
  'Consulting',
]

export type FormValues = {
  name: string
  category: string
  tagline: string
  description: string
  about: string
  logo_url: string
  cover_image_url: string
  accent_color: string
  phone: string
  email: string
  website_url: string
  address: string
  city: string
  region: string
  postal_code: string
  maps_url: string
  show_phone: boolean
  show_email: boolean
  show_address: boolean
  facebook_url: string
  instagram_url: string
  tiktok_url: string
  slug: string
  is_active: boolean
  booking_instructions: string
  confirmation_message: string
  cancellation_policy: string
  reschedule_policy: string
  late_policy: string
  no_show_policy: string
}

export type FieldKey = keyof FormValues
export type Errors = Partial<Record<FieldKey, string>>

const TEXT_KEYS = [
  'name', 'category', 'tagline', 'description', 'about', 'logo_url', 'cover_image_url', 'accent_color',
  'phone', 'email', 'website_url', 'address', 'city', 'region', 'postal_code', 'maps_url',
  'facebook_url', 'instagram_url', 'tiktok_url', 'slug', 'booking_instructions', 'confirmation_message',
  'cancellation_policy', 'reschedule_policy', 'late_policy', 'no_show_policy',
] as const satisfies readonly FieldKey[]

export const URL_KEYS = ['website_url', 'maps_url', 'facebook_url', 'instagram_url', 'tiktok_url'] as const

export function valuesOf(b: Business): FormValues {
  const text = Object.fromEntries(TEXT_KEYS.map((k) => [k, (b[k] as string | null | undefined) ?? ''])) as Record<
    (typeof TEXT_KEYS)[number],
    string
  >
  return {
    ...text,
    accent_color: b.accent_color ?? DEFAULT_ACCENT,
    // Columns added in 0028 default to visible; `?? true` covers a client running ahead of it.
    show_phone: b.show_phone ?? true,
    show_email: b.show_email ?? true,
    show_address: b.show_address ?? true,
    is_active: b.is_active,
  }
}

export const sameValues = (a: FormValues, b: FormValues) =>
  (Object.keys(a) as FieldKey[]).every((k) => a[k] === b[k])

/**
 * The update payload: only the columns that changed, trimmed, with blanks stored as null — the URL
 * columns reject '' (0026), and an empty phone would otherwise read as "set" everywhere else.
 */
export function changedRow(values: FormValues, initial: FormValues): Record<string, string | boolean | null> {
  const row: Record<string, string | boolean | null> = {}
  for (const k of Object.keys(values) as FieldKey[]) {
    if (values[k] === initial[k]) continue
    const v = values[k]
    row[k] = typeof v === 'boolean' ? v : k === 'name' || k === 'slug' ? v.trim() : v.trim() || null
  }
  return row
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const HEX = /^#[0-9a-f]{6}$/i
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Accepts "example.com" by assuming https, the way people type addresses. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`
}

export function isWebUrl(v: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(v) || v.length > LIMITS.url) return false
  try {
    const u = new URL(v)
    return u.hostname.includes('.')
  } catch {
    return false
  }
}

/** "#abc" → "#aabbcc", "4F46E5" → "#4f46e5"; anything else comes back unchanged for validation to flag. */
export function normalizeHex(raw: string): string {
  let v = raw.trim().toLowerCase()
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return v
}

/** Lowercase, dashes for anything else, no leading/trailing or doubled dashes. */
export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
}

const SOCIAL_HOSTS: Partial<Record<FieldKey, [RegExp, string]>> = {
  facebook_url: [/(^|\.)(facebook|fb)\.(com|me)$/i, 'Facebook'],
  instagram_url: [/(^|\.)instagram\.com$/i, 'Instagram'],
  tiktok_url: [/(^|\.)tiktok\.com$/i, 'TikTok'],
}

export function validate(v: FormValues): Errors {
  const e: Errors = {}
  if (!v.name.trim()) e.name = 'Business name is required.'

  const lengths: [FieldKey, number][] = [
    ['name', LIMITS.name], ['category', LIMITS.category], ['tagline', LIMITS.tagline],
    ['description', LIMITS.description], ['about', LIMITS.about], ['phone', LIMITS.phone],
    ['address', LIMITS.address], ['city', LIMITS.city], ['region', LIMITS.region],
    ['postal_code', LIMITS.postal_code], ['booking_instructions', LIMITS.booking_instructions],
    ['confirmation_message', LIMITS.confirmation_message], ['cancellation_policy', LIMITS.policy],
    ['reschedule_policy', LIMITS.policy], ['late_policy', LIMITS.policy], ['no_show_policy', LIMITS.policy],
  ]
  for (const [k, max] of lengths) {
    if (!e[k] && (v[k] as string).trim().length > max) e[k] = `Keep this under ${max} characters.`
  }

  const email = v.email.trim()
  if (email && (!EMAIL.test(email) || email.length > LIMITS.email)) e.email = 'Enter a valid email address, like hello@yourbusiness.com.'

  const phone = v.phone.trim()
  if (phone && !/^[+()\d][\d\s().-]{5,}$/.test(phone)) e.phone = 'Use digits, spaces, and + ( ) - only.'

  for (const k of URL_KEYS) {
    const url = v[k].trim()
    if (!url) continue
    if (!isWebUrl(url)) {
      e[k] = 'Enter a full link starting with https://'
      continue
    }
    const social = SOCIAL_HOSTS[k]
    if (social && !social[0].test(new URL(url).hostname)) e[k] = `That doesn't look like a ${social[1]} link.`
  }

  if (!HEX.test(v.accent_color)) e.accent_color = 'Use a 6-digit hex color, like #4f46e5.'

  const slug = v.slug.trim()
  if (slug.length < SLUG_MIN) e.slug = `Use at least ${SLUG_MIN} characters.`
  else if (slug.length > SLUG_MAX) e.slug = `Keep it under ${SLUG_MAX} characters.`
  else if (!SLUG.test(slug)) e.slug = 'Use lowercase letters, numbers, and single dashes.'

  return e
}

/** Rough "how complete is the public page" score, for the checklist beside the form. */
export function completeness(v: FormValues, hasHours: boolean) {
  const items: [string, boolean][] = [
    ['Logo', !!v.logo_url],
    ['Cover image', !!v.cover_image_url],
    ['Tagline or description', !!(v.tagline.trim() || v.description.trim())],
    ['Contact details', !!(v.phone.trim() || v.email.trim())],
    ['Location', !!v.address.trim()],
    ['Business hours', hasHours],
  ]
  return { items, done: items.filter(([, ok]) => ok).length }
}
