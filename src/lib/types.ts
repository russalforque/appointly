export interface Business {
  id: string
  slug: string
  name: string
  category: string | null
  description: string | null
  about: string | null
  phone: string | null
  email: string | null
  address: string | null
  logo_url: string | null
  cover_image_url: string | null
  accent_color: string | null
  is_active: boolean
}

export type WorkingHours = Record<string, { start: string; end: string }[]>

export interface BusinessSettings {
  business_id: string
  timezone: string
  working_hours: WorkingHours
  blocked_dates: string[]
  slot_interval_minutes: number
  min_notice_hours: number
  max_advance_days: number
  auto_confirm: boolean
  buffer_minutes: number
  allow_customer_cancellation: boolean
  cancellation_deadline_hours: number
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_minutes: number
  buffer_minutes: number
  price: number | null
  is_active: boolean
  image_url: string | null
}

export interface Staff {
  id: string
  business_id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  position: string | null
  is_active: boolean
}

export interface Schedule {
  id: string
  staff_id: string
  day_of_week: number
  start_time: string
  end_time: string
}

export interface DayOff {
  id: string
  staff_id: string
  date: string
  reason: string | null
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export interface BookingRow {
  id: string
  business_id: string
  service_id: string
  staff_id: string
  customer_id: string
  start_at: string
  end_at: string
  status: BookingStatus
  notes: string | null
  public_token: string
  created_at: string
  services: { name: string; duration_minutes: number; price: number | null } | null
  staff: { name: string; position: string | null } | null
  customers: { name: string; email: string | null; phone: string | null } | null
}

export interface AppNotification {
  id: string
  business_id: string
  booking_id: string | null
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export interface Plan {
  id: string
  name: string
  price_cents: number
  currency: string
  interval: 'month' | 'year'
  features: string[]
  is_active: boolean
  sort_order: number
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'pending'

export interface Subscription {
  id: string
  business_id: string
  user_id: string | null
  plan_id: string | null
  status: SubscriptionStatus
  trial_start: string | null
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  provider: 'paymongo' | 'xendit'
  checkout_ref: string | null
  payment_ref: string | null
}

export interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  bookings: { count: number }[]
}

export type PaymentStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'expired'

export interface PaymentSettings {
  id: string
  bank_name: string
  account_name: string
  account_number: string
  qr_image_url: string | null
  instructions: string
  is_active: boolean
}

export interface SubscriptionPayment {
  id: string
  business_id: string
  user_id: string | null
  subscription_id: string | null
  plan_id: string
  payment_method: 'gotyme'
  amount_cents: number
  currency: string
  billing_interval: 'month' | 'year'
  payment_reference: string
  customer_transaction_reference: string | null
  payment_date: string | null
  proof_path: string | null
  notes: string | null
  status: PaymentStatus
  rejection_reason: string | null
  submitted_at: string | null
  verified_at: string | null
  rejected_at: string | null
}

/** A payment row joined with the business/owner details only a platform admin may read. */
export interface AdminPayment {
  id: string
  business_id: string
  business_name: string
  owner_name: string | null
  owner_email: string | null
  plan_id: string
  plan_name: string | null
  amount_cents: number
  currency: string
  billing_interval: 'month' | 'year'
  payment_method: string
  payment_reference: string
  customer_transaction_reference: string
  payment_date: string
  proof_path: string
  notes: string | null
  status: PaymentStatus
  rejection_reason: string | null
  submitted_at: string
  verified_at: string | null
  rejected_at: string | null
}

export interface PaymentCounts {
  pending: number
  approved: number
  rejected: number
  expired: number
  total: number
}
