// Business-plan reports. Computed by get_business_report() in the database, which refuses any
// business whose plan does not include analytics — so the page can't be unlocked from the browser.
import { supabase } from './supabase'
import { friendlyError } from './db'

export type ReportDays = 7 | 30 | 90 | 365

export interface ReportTotals {
  bookings: number
  completed: number
  cancelled: number
  no_show: number
  revenue: number
}

export interface BusinessReport {
  from: string
  to: string
  days: ReportDays
  current: ReportTotals & { customers: number; new_customers: number }
  previous: ReportTotals
  series: { date: string; bookings: number; revenue: number }[]
  services: { name: string; bookings: number; revenue: number }[]
  staff: { name: string; bookings: number; completed: number; no_show: number; revenue: number }[]
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: { dow: number; bookings: number }[]
}

export async function fetchReport(businessId: string, days: ReportDays): Promise<BusinessReport> {
  const { data, error } = await supabase.rpc('get_business_report', { p_business_id: businessId, p_days: days })
  if (error) throw new Error(friendlyError(error.message))
  const r = data as BusinessReport
  // numeric columns arrive as numbers or strings depending on size; normalise once here.
  const n = (v: unknown) => Number(v ?? 0)
  return {
    ...r,
    current: { ...r.current, revenue: n(r.current.revenue) },
    previous: { ...r.previous, revenue: n(r.previous.revenue) },
    series: r.series.map((s) => ({ ...s, revenue: n(s.revenue) })),
    services: r.services.map((s) => ({ ...s, revenue: n(s.revenue) })),
    staff: r.staff.map((s) => ({ ...s, revenue: n(s.revenue) })),
  }
}

/** Percentage change, or null when there is nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}
