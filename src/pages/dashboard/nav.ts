import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock3,
  CreditCard,
  Home,
  LayoutDashboard,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavEntry = { to: string; end?: boolean; label: string; icon: LucideIcon }

/** The sidebar's grouped menu (tablet and desktop) and the phone "More" sheet. */
export const NAV_SECTIONS: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', end: true, label: 'Dashboard', icon: LayoutDashboard },
      { to: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/dashboard/bookings', label: 'Bookings', icon: CalendarCheck },
      { to: '/dashboard/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Insights',
    items: [{ to: '/dashboard/reports', label: 'Reports', icon: BarChart3 }],
  },
  {
    label: 'Business',
    items: [
      { to: '/dashboard/profile', label: 'Business Profile', icon: Building2 },
      { to: '/dashboard/hours', label: 'Business Hours', icon: Clock3 },
      { to: '/dashboard/services', label: 'Services', icon: ClipboardList },
      { to: '/dashboard/staff', label: 'Staff', icon: UserRound },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/dashboard/booking-settings', label: 'Booking Settings', icon: Settings2 },
      { to: '/dashboard/billing', label: 'Plans & Billing', icon: CreditCard },
    ],
  },
]

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)

/**
 * The phone tab bar: the four daily destinations. Everything set up once and revisited rarely —
 * profile, hours, services, staff, settings, billing — lives behind "More".
 */
export const TAB_ITEMS: NavEntry[] = [
  { to: '/dashboard', end: true, label: 'Home', icon: Home },
  { to: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/dashboard/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/dashboard/customers', label: 'Customers', icon: Users },
]

export const MORE_SECTIONS = NAV_SECTIONS.filter((s) => s.label !== 'Main')

export const isActive = (item: NavEntry, pathname: string) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)

/** The nav label for the current route, for the tablet/desktop breadcrumb. */
export function pageLabelFor(pathname: string): string {
  return NAV_ITEMS.find((i) => isActive(i, pathname))?.label ?? 'Dashboard'
}
