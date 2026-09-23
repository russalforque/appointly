import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { supabase } from '../../lib/supabase'
import { friendlyError, slugify, unwrap } from '../../lib/db'
import { initials } from '../../lib/format'
import { billingStatusLabel, fetchPlans, fetchSubscription, hasBillingAccess, hasCapability } from '../../lib/billing'
import { isPlatformAdmin } from '../../lib/admin'
import { useLoad } from '../../lib/useLoad'
import { btn, card, input } from '../../lib/ui'
import type { Business, Subscription } from '../../lib/types'
import Field from '../../components/Field'
import Select from '../../components/Select'
import { Bone, ErrorText } from '../../components/Status'
import NotificationBell from '../../components/NotificationBell'
import Logo from '../../components/Logo'
import type { PlanAccess } from './useBusiness'

const CATEGORIES = ['Salon', 'Barbershop', 'Spa', 'Massage', 'Dental clinic', 'Car detailing', 'Cleaning', 'Pet grooming', 'Repair', 'Other']
const SIDEBAR_COLLAPSED_KEY = 'appointly:sidebar-collapsed'

function CreateBusiness({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim()
    setBusy(true)
    const { error } = await supabase.rpc('create_business', {
      p_name: name,
      p_slug: String(f.get('slug')).trim() || slugify(name),
      p_category: String(f.get('category')),
    })
    setBusy(false)
    if (error) setError(error.code === '23505' ? 'That URL name is already taken.' : friendlyError(error.message))
    else onCreated()
  }

  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 px-4">
      <form onSubmit={submit} className={`${card} w-full max-w-md space-y-4`}>
        <h1 className="text-xl font-semibold">Set up your business</h1>
        <Field label="Business name">
          <input name="name" required className={input} />
        </Field>
        <Field label="Booking page URL name (e.g. my-salon)">
          <input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="auto from name" className={input} />
        </Field>
        <Field label="Category">
          <Select name="category" className={input}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <ErrorText message={error} />
        <button className={btn} disabled={busy}>
          Create business
        </button>
      </form>
    </main>
  )
}

function DashboardShellSkeleton() {
  return (
    <div className="font-dashboard min-h-screen bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-neutral-200 bg-white md:block">
        <div className="flex h-full animate-pulse flex-col gap-4 px-3 py-4">
          <div className="space-y-3 px-1">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-neutral-100" />
              <div className="h-3.5 w-20 rounded bg-neutral-100" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-28 rounded bg-neutral-100" />
              <div className="h-2.5 w-20 rounded bg-neutral-100" />
            </div>
          </div>
          <div className="h-9 rounded-lg bg-neutral-100" />
          <div className="flex-1 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-neutral-100" />
            ))}
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 md:ml-64 md:p-8">
        <div className="mx-auto max-w-6xl animate-pulse space-y-2" aria-busy="true" aria-label="Loading">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-7 w-64" />
        </div>
      </main>
    </div>
  )
}

type NavEntry = { to: string; end?: boolean; label: string; icon: LucideIcon }

const NAV_SECTIONS: { label: string; items: NavEntry[] }[] = [
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
      { to: '/dashboard/booking-settings', label: 'Settings', icon: Settings2 },
      { to: '/dashboard/billing', label: 'Billing', icon: CreditCard },
    ],
  },
]

function NavItem({
  to,
  end,
  label,
  icon: Icon,
  collapsed,
  onNavigate,
}: NavEntry & { collapsed: boolean; onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `group relative flex w-full items-center rounded-lg text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
          collapsed ? 'h-11 justify-center' : 'h-10 gap-3 px-3'
        } ${
          isActive
            ? 'bg-brand-50 font-semibold text-brand-700'
            : 'font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Accent bar so the active item reads without relying on colour alone */}
          <span
            aria-hidden
            className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-600 ${
              isActive ? '' : 'hidden'
            }`}
          />
          <Icon
            size={18}
            strokeWidth={isActive ? 2 : 1.75}
            className={`shrink-0 transition-colors ${
              isActive ? 'text-brand-600' : 'text-neutral-400 group-hover:text-neutral-600'
            }`}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({
  business,
  billingLabel,
  locked,
  isPlatformAdmin,
  collapsed,
  onNavigate,
  onSignOut,
  userLabel,
  userEmail,
}: {
  business: Business
  billingLabel: string | null
  locked: boolean
  isPlatformAdmin: boolean
  collapsed?: boolean
  onNavigate: () => void
  onSignOut: () => void
  userLabel: string
  userEmail: string
}) {
  const [query, setQuery] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  // Dismiss the account menu on outside click / Escape
  useEffect(() => {
    if (!profileOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileOpen])

  const sections = useMemo(() => {
    // Appointly staff get one extra section; it is only a shortcut, /admin guards itself.
    const all = isPlatformAdmin
      ? [...NAV_SECTIONS, { label: 'Appointly', items: [{ to: '/admin/payments', label: 'Admin payments', icon: ShieldCheck }] }]
      : NAV_SECTIONS
    const base = locked
      ? all.map((s) => ({ ...s, items: s.items.filter((i) => i.to === '/dashboard/billing') })).filter(
          (s) => s.items.length,
        )
      : all
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base
      .map((s) => ({ ...s, items: s.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length)
  }, [isPlatformAdmin, locked, query])

  return (
    <div className="flex h-full flex-col gap-4 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-4">
      {/* Brand + current business */}
      <div className={collapsed ? '' : 'px-1'}>
        <div
          className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Appointly' : undefined}
        >
          <Logo className="h-8 w-8" />
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-tight text-neutral-900">Appointly</span>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-neutral-900">{business.name}</p>
            <p className="truncate text-[11px] leading-tight text-neutral-500">
              {billingLabel ?? 'Booking dashboard'}
            </p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search menu"
            aria-label="Search menu"
            className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/15"
          />
        </div>
      )}

      {locked &&
        (collapsed ? (
          <div className="flex justify-center" title="Your trial has ended. Choose a plan to unlock your dashboard.">
            <LockKeyhole size={16} className="shrink-0 text-amber-500" strokeWidth={1.75} />
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-700">
            <LockKeyhole size={14} className="mt-0.5 shrink-0" strokeWidth={1.75} />
            Your trial has ended. Choose a plan to unlock your dashboard.
          </div>
        ))}

      <nav aria-label="Dashboard" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sections.length === 0 && !collapsed && (
          <p className="px-3 text-sm text-neutral-500">No menu items match &ldquo;{query}&rdquo;.</p>
        )}
        {sections.map((section, i) => (
          <div key={section.label} className={i === 0 ? '' : collapsed ? 'mt-3' : 'mt-5'}>
            {collapsed
              ? i > 0 && <div aria-hidden className="mx-auto mb-3 h-px w-6 bg-neutral-200" />
              : (
                  <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    {section.label}
                  </p>
                )}
            {/* aria-label keeps the grouping announced even when the heading is visually hidden */}
            <ul aria-label={section.label} className="space-y-1">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavItem {...item} collapsed={!!collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Account area — separated from navigation by a rule, not by a different visual language */}
      <div ref={profileRef} className="relative border-t border-neutral-200 pt-3">
        {profileOpen && (
          <div
            role="menu"
            className={`absolute z-30 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg ${
              collapsed ? 'bottom-0 left-full ml-2 w-44' : 'inset-x-0 bottom-full mb-2'
            }`}
          >
            <button
              role="menuitem"
              onClick={() => {
                setProfileOpen(false)
                onSignOut()
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-neutral-700 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
            >
              <LogOut size={16} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
              Sign out
            </button>
          </div>
        )}
        <button
          onClick={() => setProfileOpen((v) => !v)}
          title={collapsed ? `Account — ${userLabel}` : undefined}
          aria-label={collapsed ? `Account menu for ${userLabel}` : undefined}
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          className={`flex w-full items-center rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
            collapsed ? 'h-11 justify-center' : 'h-12 gap-2.5 px-2'
          } ${profileOpen ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
            {initials(userLabel)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-neutral-900">
                  {userLabel}
                </span>
                <span className="block truncate text-[11px] leading-tight text-neutral-500">{userEmail}</span>
              </span>
              <ChevronDown
                size={15}
                strokeWidth={2}
                className={`shrink-0 text-neutral-400 transition-transform duration-150 ${
                  profileOpen ? 'rotate-180' : ''
                }`}
              />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default function DashboardLayout() {
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user.id
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const location = useLocation()

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [mobileOpen])

  // First business the user belongs to (MVP: one business per user)
  const load = useCallback(async () => {
    if (!userId) return null
    const m = await unwrap<{ business_id: string }[]>(
      supabase.from('business_members').select('business_id').eq('user_id', userId).limit(1),
    )
    // A platform admin may have no business of their own; they belong in /admin, not in setup.
    if (!m.length) return { business: null, platformAdmin: await isPlatformAdmin() }
    const id = m[0].business_id
    const [business, settings, plans, subscription, platformAdmin] = await Promise.all([
      unwrap<Business>(supabase.from('businesses').select('*').eq('id', id).single()),
      unwrap<{ timezone: string }>(supabase.from('business_settings').select('timezone').eq('business_id', id).single()),
      fetchPlans(),
      fetchSubscription(id),
      isPlatformAdmin(),
    ])
    return {
      business,
      timezone: settings.timezone,
      billingLabel: billingStatusLabel(subscription, plans),
      // Resolved once here so every page can gate on it without re-querying the plan.
      can: {
        notifications: hasCapability(subscription, plans, 'notifications'),
        advancedBooking: hasCapability(subscription, plans, 'advanced_booking'),
      },
      subscription,
      platformAdmin,
    }
  }, [userId])
  const { data, loading, error, reload } = useLoad<
    | { business: null; platformAdmin: boolean }
    | {
        business: Business
        timezone: string
        billingLabel: string
        subscription: Subscription | null
        can: PlanAccess
        platformAdmin: boolean
      }
    | null
  >(load)

  if (authLoading) return <DashboardShellSkeleton />
  if (!session) return <Navigate to="/login" replace />
  if (loading) return <DashboardShellSkeleton />
  if (error) return <ErrorText message={error} />
  if (!data) return <CreateBusiness onCreated={reload} />
  if (!data.business) return data.platformAdmin ? <Navigate to="/admin" replace /> : <CreateBusiness onCreated={reload} />
  const { business, timezone, billingLabel, subscription, can, platformAdmin } = data
  const locked = !hasBillingAccess(subscription)
  const userLabel = (session!.user.user_metadata?.full_name as string | undefined)?.trim() || session!.user.email || 'Account'
  const userEmail = session!.user.email ?? ''

  if (locked && !location.pathname.startsWith('/dashboard/billing')) {
    return <Navigate to="/dashboard/billing" replace />
  }

  return (
    <div className="font-dashboard min-h-screen bg-neutral-50">
      {/* Desktop / tablet sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-neutral-200 bg-white transition-[width] duration-200 md:block ${
          collapsed ? 'w-18' : 'w-64'
        }`}
      >
        <SidebarContent
          business={business}
          billingLabel={billingLabel}
          locked={locked}
          isPlatformAdmin={platformAdmin}
          collapsed={collapsed}
          onNavigate={() => {}}
          onSignOut={() => supabase.auth.signOut()}
          userLabel={userLabel}
          userEmail={userEmail}
        />
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />}
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:hidden">
        <button
          className="-ml-2.5 flex h-11 w-11 items-center justify-center rounded-lg text-neutral-600 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-900"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <p className="flex-1 truncate text-sm font-semibold text-neutral-900">{business.name}</p>
        {can.notifications && <NotificationBell businessId={business.id} timezone={timezone} />}
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            className="absolute right-1.5 top-2.5 z-10 flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
          <SidebarContent
            business={business}
            billingLabel={billingLabel}
            locked={locked}
            isPlatformAdmin={platformAdmin}
            onNavigate={() => setMobileOpen(false)}
            onSignOut={() => supabase.auth.signOut()}
            userLabel={userLabel}
            userEmail={userEmail}
          />
        </div>
      </div>

      <main
        className={`min-w-0 p-4 transition-[margin] duration-200 sm:p-6 md:p-8 ${collapsed ? 'md:ml-18' : 'md:ml-64'}`}
      >
        <Outlet context={{ business, timezone, can, reload }} />
      </main>
    </div>
  )
}
