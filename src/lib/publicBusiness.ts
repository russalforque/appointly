import type { WorkingHours } from './types'

/**
 * What get_public_business() returns: the business as a visitor may see it. Contact fields the
 * owner switched off arrive as null, so the page never has to know about the switches.
 */
export interface PublicBusiness {
  id: string
  slug: string
  name: string
  category: string | null
  tagline: string | null
  description: string | null
  about: string | null
  logo_url: string | null
  cover_image_url: string | null
  accent_color: string | null
  is_active: boolean
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  maps_url: string | null
  website_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  tiktok_url: string | null
  booking_instructions: string | null
  cancellation_policy: string | null
  reschedule_policy: string | null
  late_policy: string | null
  no_show_policy: string | null
  timezone: string
  max_advance_days: number
  working_hours: WorkingHours
}

export const POLICY_FIELDS = [
  ['cancellation_policy', 'Cancellation policy'],
  ['reschedule_policy', 'Rescheduling policy'],
  ['late_policy', 'Late arrival policy'],
  ['no_show_policy', 'No-show policy'],
] as const

export type PolicyKey = (typeof POLICY_FIELDS)[number][0]

/** One readable line from the address parts, skipping the blank ones. */
export function fullAddress(b: { address: string | null; city: string | null; region: string | null; postal_code: string | null }) {
  return [b.address, b.city, b.region, b.postal_code].map((p) => p?.trim()).filter(Boolean).join(', ')
}

/** The owner's own map link, or a Google Maps search for the address when they have none. */
export function directionsUrl(mapsUrl: string | null, address: string): string | null {
  if (mapsUrl) return mapsUrl
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null
}

/** "example.com/path" — a website link as people say it, without the scheme. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
