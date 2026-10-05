// How the plans are described. Prices, capabilities and the staff allowance come from the plans
// table (the database is what enforces them); this file only holds the words around them, so the
// landing page, the pricing page, billing and every upgrade prompt describe a plan the same way.
import type { Plan, PlanCapability } from './types'

export const STARTER_PLAN_ID = 'starter'
export const BUSINESS_PLAN_ID = 'business'
/** Emphasised as "Most popular" wherever the plans are shown side by side. */
export const RECOMMENDED_PLAN_ID = BUSINESS_PLAN_ID

interface PlanCopy {
  /** One line on who the plan is for. */
  audience: string
  /** Heading over the feature list, e.g. "Everything in Starter, plus". */
  featuresHeading: string
  /** The card's short list; the comparison table has the full detail. */
  highlights: string[]
  support: string
}

const PLAN_COPY: Record<string, PlanCopy> = {
  [STARTER_PLAN_ID]: {
    audience: 'For solo professionals and small businesses.',
    featuresHeading: 'Includes',
    highlights: [
      'Online booking & public booking page',
      'Services, calendar & customer management',
      'Staff management — {staff}',
      'Business hours & availability',
      'Booking confirmation emails',
      'Basic booking settings',
    ],
    support: 'Standard',
  },
  [BUSINESS_PLAN_ID]: {
    audience: 'For growing businesses that need more control.',
    featuresHeading: 'Everything in Starter, plus',
    highlights: [
      '{staff}',
      'Booking notifications & customer reminders',
      'Advanced booking rules — buffers, notice & advance windows',
      'Cancellation rules & booking policies',
      'Staff-specific availability',
      'Reports & analytics',
      'Priority support',
    ],
    support: 'Priority',
  },
}

/** "Up to 5 staff" / "Unlimited staff". */
export const staffAllowanceLabel = (limit: number | null) => (limit ? `Up to ${limit} staff` : 'Unlimited staff')

/**
 * Copy for a plan, falling back to the database's own feature list for a plan this file doesn't
 * know. `{staff}` in a highlight becomes the plan's real allowance, so the number lives in one place.
 */
export function planCopy(plan: Plan): PlanCopy {
  const copy = PLAN_COPY[plan.id]
  if (!copy) return { audience: '', featuresHeading: 'Includes', highlights: plan.features, support: 'Standard' }
  const staff = staffAllowanceLabel(plan.max_staff)
  return {
    ...copy,
    highlights: copy.highlights.map((h) => (h === '{staff}' ? staff : h.replace('{staff}', staff.toLowerCase()))),
  }
}

/** What each Business capability is called and what it does, for upgrade prompts and downgrade warnings. */
export const CAPABILITY_INFO: Record<PlanCapability, { title: string; description: string }> = {
  notifications: {
    title: 'Booking notifications',
    description: 'Get notified in your dashboard the moment a customer books.',
  },
  reminders: {
    title: 'Customer reminders',
    description: 'Automatic reminder emails before every confirmed appointment.',
  },
  advanced_booking: {
    title: 'Advanced booking rules',
    description: 'Buffers, minimum notice, how far ahead customers can book, slot intervals and cancellation rules.',
  },
  booking_policies: {
    title: 'Booking policies',
    description: 'Cancellation, rescheduling, late-arrival and no-show policies on your booking page.',
  },
  staff_availability: {
    title: 'Staff-specific availability',
    description: 'Individual weekly schedules and days off for each staff member.',
  },
  analytics: {
    title: 'Reports & analytics',
    description: 'Booking, revenue, service and staff trends over time.',
  },
}

type CellValue = boolean | string

export interface ComparisonRow {
  label: string
  value: (plan: Plan) => CellValue
}

const always = () => true
const has = (cap: PlanCapability) => (plan: Plan) => plan.capabilities?.includes(cap) ?? false

/** The full feature matrix. Capability rows read the plan's own capabilities, so it can't drift from the database. */
export const COMPARISON: { group: string; rows: ComparisonRow[] }[] = [
  {
    group: 'Booking',
    rows: [
      { label: 'Online booking', value: always },
      { label: 'Public booking website', value: always },
      { label: 'Booking confirmation emails', value: always },
      { label: 'Customer reminder emails', value: has('reminders') },
      { label: 'Booking notifications', value: has('notifications') },
    ],
  },
  {
    group: 'Business',
    rows: [
      { label: 'Services', value: always },
      { label: 'Calendar', value: always },
      { label: 'Customer management', value: always },
      { label: 'Staff', value: (p) => (p.max_staff ? `Up to ${p.max_staff}` : 'Unlimited') },
      { label: 'Business hours & closed dates', value: always },
      { label: 'Staff-specific schedules & days off', value: has('staff_availability') },
    ],
  },
  {
    group: 'Booking rules',
    rows: [
      { label: 'Auto-confirm or approve bookings', value: always },
      { label: 'Minimum notice & maximum advance booking', value: has('advanced_booking') },
      { label: 'Buffer times & slot intervals', value: has('advanced_booking') },
      { label: 'Customer cancellation rules', value: has('advanced_booking') },
      { label: 'Cancellation, rescheduling & no-show policies', value: has('booking_policies') },
    ],
  },
  {
    group: 'Insights & support',
    rows: [
      { label: "Today's bookings & revenue", value: always },
      { label: 'Reports & analytics', value: has('analytics') },
      { label: 'Support', value: (p) => planCopy(p).support },
    ],
  },
]

/** Where every upgrade prompt leads: the plans on the Billing page, with Business picked out. */
export const UPGRADE_HREF = `/dashboard/billing?plan=${BUSINESS_PLAN_ID}`
