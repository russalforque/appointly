import { useOutletContext } from 'react-router-dom'
import type { Business, Plan, Subscription } from '../../lib/types'

/** What the current plan unlocks; the database enforces the same rules on every write. */
export interface PlanAccess {
  notifications: boolean
  reminders: boolean
  advancedBooking: boolean
  bookingPolicies: boolean
  staffAvailability: boolean
  analytics: boolean
  /** Active staff allowed at once, or null for unlimited. */
  staffLimit: number | null
}

/** The subscription the dashboard was rendered with, refreshed live when the row changes. */
export interface BillingContext {
  subscription: Subscription | null
  plans: Plan[]
}

export const useBusiness = () =>
  useOutletContext<{
    business: Business
    timezone: string
    can: PlanAccess
    billing: BillingContext
    reload: () => void
  }>()
