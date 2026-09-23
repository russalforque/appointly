import { useOutletContext } from 'react-router-dom'
import type { Business } from '../../lib/types'

/** What the current plan unlocks; the database enforces the same rules on every write. */
export interface PlanAccess {
  notifications: boolean
  advancedBooking: boolean
}

export const useBusiness = () =>
  useOutletContext<{ business: Business; timezone: string; can: PlanAccess; reload: () => void }>()
