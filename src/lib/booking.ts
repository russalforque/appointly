import { supabase } from './supabase'
import { unwrap } from './db'

import type { BookingRow, BookingStatus } from './types'

export type { BookingStatus }

export interface Slot {
  staff_id: string
  start_at: string // ISO timestamp
}

export interface NewBooking {
  serviceId: string
  start: string // ISO timestamp of a slot returned by getAvailableSlots
  name: string
  email?: string
  phone?: string
  notes?: string
  staffId?: string // omit for "any available staff"
}

/** date is business-local, YYYY-MM-DD. */
export const getAvailableSlots = (serviceId: string, date: string, staffId?: string) =>
  unwrap<Slot[]>(
    supabase.rpc('get_available_slots', { p_service_id: serviceId, p_date: date, p_staff_id: staffId ?? null }),
  )

export async function createBooking(b: NewBooking) {
  const rows = await unwrap<{ booking_id: string; public_token: string }[]>(
    supabase.rpc('create_booking', {
      p_service_id: b.serviceId,
      p_start: b.start,
      p_name: b.name,
      p_email: b.email ?? null,
      p_phone: b.phone ?? null,
      p_notes: b.notes ?? null,
      p_staff_id: b.staffId ?? null,
    }),
  )
  return rows[0]
}

/** Business members only (enforced by RLS). */
export const setBookingStatus = (bookingId: string, status: BookingStatus) =>
  unwrap<null>(supabase.from('bookings').update({ status }).eq('id', bookingId))

/** Customer self-cancel by public token; the RPC enforces the cancellation deadline. */
export const cancelBooking = (token: string) => unwrap<null>(supabase.rpc('cancel_booking', { p_token: token }))

const BOOKING_SELECT = '*, services(name, duration_minutes, price), staff(name, position), customers(name, email, phone)'

/** Bookings for a business, filtered by start time range (ISO) and/or status. */
export function fetchBookings(
  businessId: string,
  o: { from?: string; to?: string; status?: BookingStatus; descending?: boolean; limit?: number } = {},
) {
  let q = supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('business_id', businessId)
    .order('start_at', { ascending: !o.descending })
  if (o.from) q = q.gte('start_at', o.from)
  if (o.to) q = q.lt('start_at', o.to)
  if (o.status) q = q.eq('status', o.status)
  if (o.limit) q = q.limit(o.limit)
  return unwrap<BookingRow[]>(q)
}
