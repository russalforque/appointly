import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  LockKeyhole,
  LogOut,
  Search,
  Share,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { supabase } from '../../lib/supabase'
import { unwrap } from '../../lib/db'
import { initials } from '../../lib/format'
import {
  billingStatusLabel,
  fetchPlans,
  fetchSubscription,
  hasBillingAccess,
  hasCapability,
  staffLimit,
} from '../../lib/billing'
import { isPlatformAdmin } from '../../lib/admin'
import { useLoad } from '../../lib/useLoad'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { shareLink } from '../../lib/share'
import { useToast } from '../../lib/toast'
import type { Business } from '../../lib/types'
import { Bone, ErrorState } from '../../components/Status'
import NotificationBell from '../../components/NotificationBell'
import Logo from '../../components/Logo'
import type { BillingContext, PlanAccess } from './useBusiness'
import CreateBusiness from './CreateBusiness'
import { NAV_SECTIONS, pageLabelFor, type NavEntry } from './nav'
import { BottomNav, BusinessMark, MoreSheet } from './MobileNav'

const SIDEBAR_COLLAPSED_KEY = 'appointly:sidebar-collapsed'

function DashboardShellSkeleton() {
  return (
    <div className="font-dashboard min-h-screen bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-18 overflow-hidden border-r border-neutral-200 bg-white md:block lg:w-64">
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
      {/* Phones: the same top bar and tab bar the loaded shell has, so nothing jumps on arrival */}
      <div className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white px-4 md:hidden" aria-hidden>
        <Bone className="h-8 w-8 rounded-xl" />
        <Bone className="h-3.5 w-28" />
      </div>
      <main className="min-w-0 p-4 sm:p-6 md:ml-18 lg:ml-64 xl:p-8">
        <div className="mx-auto max-w-6xl animate-pulse space-y-2" aria-busy="true" aria-label="Loading">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-7 w-64" />
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-6 w-6 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

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

const headerIconBtn =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-600 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9 sm:w-9 sm:rounded-lg'

/** The public booking link — the thing owners share most — kept one click away on every page. */
function BookingLinkActions({ url, name }: { url: string; name: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const display = url.replace(/^https?:\/\//, '')

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const copyIcon = copied ? (
    <Check size={15} strokeWidth={2} className="text-green-600" />
  ) : (
    <Copy size={15} strokeWidth={1.75} />
  )

  return (
    <>
      {/* Wide screens: the link itself, so owners can see what they are sharing */}
      <div className="hidden h-9 min-w-0 items-center rounded-lg border border-neutral-200 bg-neutral-50 pl-3 lg:flex">
        <span className="max-w-56 truncate text-xs text-neutral-500 xl:max-w-72" title={url}>
          {display}
        </span>
        <button
          type="button"
          onClick={copy}
          className="ml-2 flex h-full shrink-0 items-center gap-1.5 border-l border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 outline-none transition-colors hover:bg-white hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
        >
          {copyIcon}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open booking page"
          aria-label="Open booking page in a new tab"
          className="flex h-full shrink-0 items-center rounded-r-lg border-l border-neutral-200 px-2.5 text-neutral-500 outline-none transition-colors hover:bg-white hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
        >
          <ExternalLink size={15} strokeWidth={1.75} />
        </a>
      </div>

      {/* Phones: one Share button that opens the system share sheet — how links actually get sent */}
      <button
        type="button"
        onClick={() => shareLink(url, name, toast)}
        aria-label="Share booking link"
        className={`${headerIconBtn} md:hidden`}
      >
        <Share size={19} strokeWidth={1.75} />
      </button>

      {/* Tablets: copy and open as icons */}
      <button
        type="button"
        onClick={copy}
        title="Copy booking link"
        aria-label="Copy booking link"
        className={`${headerIconBtn} hidden md:flex lg:hidden`}
      >
        {copyIcon}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Open booking page"
        aria-label="Open booking page in a new tab"
        className={`${headerIconBtn} hidden md:flex lg:hidden`}
      >
        <ExternalLink size={17} strokeWidth={1.75} />
      </a>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Booking link copied' : ''}
      </span>
    </>
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
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-neutral-900">Appointly</span>
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
          <div className="flex justify-center" title="Your plan has ended. Choose a plan to unlock your dashboard.">
            <LockKeyhole size={16} className="shrink-0 text-amber-500" strokeWidth={1.75} />
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-700">
            <LockKeyhole size={14} className="mt-0.5 shrink-0" strokeWidth={1.75} />
            Your plan has ended. Choose a plan to unlock your dashboard.
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
  // Phones: the More sheet holds everything that is not a daily tab.
  const [moreOpen, setMoreOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const location = useLocation()
  // Tablets (md–lg) get the icon rail by default: a 256px sidebar leaves too little room beside it.
  // Expanding it there overlays the page instead of squeezing it; the saved preference is desktop-only.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [tabletExpanded, setTabletExpanded] = useState(false)
  const rail = isDesktop ? collapsed : !tabletExpanded
  const overlayOpen = !isDesktop && tabletExpanded

  useEffect(() => {
    if (!overlayOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTabletExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayOpen])

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
      // Resolved once here so every page can gate on it without re-querying the plan. The
      // database enforces the same rules; this only decides what to draw.
      can: {
        notifications: hasCapability(subscription, plans, 'notifications'),
        reminders: hasCapability(subscription, plans, 'reminders'),
        advancedBooking: hasCapability(subscription, plans, 'advanced_booking'),
        bookingPolicies: hasCapability(subscription, plans, 'booking_policies'),
        staffAvailability: hasCapability(subscription, plans, 'staff_availability'),
        analytics: hasCapability(subscription, plans, 'analytics'),
        staffLimit: staffLimit(subscription, plans),
      },
      billing: { subscription, plans },
      platformAdmin,
    }
  }, [userId])
  const { data, loading, error, reload } = useLoad<
    | { business: null; platformAdmin: boolean }
    | {
        business: Business
        timezone: string
        billingLabel: string
        can: PlanAccess
        billing: BillingContext
        platformAdmin: boolean
      }
    | null
  >(load)

  // Approving a payment, an admin plan change or a switch made in another tab all land on the
  // subscription row: re-resolve the plan the moment it changes, so features unlock (or lock)
  // without a refresh.
  const businessId = data?.business?.id
  useEffect(() => {
    if (!businessId) return
    const channel = supabase
      .channel(`subscription:${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `business_id=eq.${businessId}` },
        () => reload(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, reload])

  if (authLoading) return <DashboardShellSkeleton />
  if (!session) return <Navigate to="/login" replace />
  if (loading) return <DashboardShellSkeleton />
  if (error)
    return (
      <div className="font-dashboard grid min-h-dvh place-items-center bg-neutral-50 p-4">
        <ErrorState message={error} onRetry={reload} />
      </div>
    )
  if (!data) return <CreateBusiness onCreated={reload} />
  if (!data.business) return data.platformAdmin ? <Navigate to="/admin" replace /> : <CreateBusiness onCreated={reload} />
  const { business, timezone, billingLabel, can, billing, platformAdmin } = data
  const locked = !hasBillingAccess(billing.subscription)
  const userLabel = (session!.user.user_metadata?.full_name as string | undefined)?.trim() || session!.user.email || 'Account'
  const userEmail = session!.user.email ?? ''
  const bookingUrl = `${window.location.origin}/book/${business.slug}`

  if (locked && !location.pathname.startsWith('/dashboard/billing')) {
    return <Navigate to="/dashboard/billing" replace />
  }

  return (
    <div className="font-dashboard min-h-screen bg-neutral-50">
      {/* Tablet: an expanded sidebar floats over the page, so a tap outside puts it away */}
      {overlayOpen && (
        <div className="fixed inset-0 z-20 hidden bg-black/20 md:block" onClick={() => setTabletExpanded(false)} aria-hidden="true" />
      )}

      {/* Desktop / tablet sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-neutral-200 bg-white transition-[width] duration-200 md:block ${
          rail ? 'w-18' : 'w-64'
        } ${overlayOpen ? 'shadow-xl' : ''}`}
      >
        <SidebarContent
          business={business}
          billingLabel={billingLabel}
          locked={locked}
          isPlatformAdmin={platformAdmin}
          collapsed={rail}
          onNavigate={() => setTabletExpanded(false)}
          onSignOut={() => supabase.auth.signOut()}
          userLabel={userLabel}
          userEmail={userEmail}
        />
        <button
          onClick={isDesktop ? toggleCollapsed : () => setTabletExpanded((v) => !v)}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!rail}
          title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          // The visible disc stays small; the ::before pad gives it a finger-sized hit area on tablets.
          className="absolute -right-3.5 top-6 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 outline-none transition-colors before:absolute before:-inset-2 before:content-[''] hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          {rail ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />}
        </button>
      </aside>

      <div className={`min-w-0 transition-[margin] duration-200 md:ml-18 ${collapsed ? 'lg:ml-18' : 'lg:ml-64'}`}>
        {/* Top bar — where you are on the left, booking link + notifications on the right */}
        <header className="sticky top-0 z-15 flex h-14 items-center gap-1 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur sm:gap-2 sm:px-6 xl:px-8">
          {/* Phones: whose dashboard this is. The page title says where you are; the tab bar, how to move. */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:hidden">
            <BusinessMark business={business} className="h-8 w-8 text-xs" />
            <span className="truncate text-[15px] font-semibold tracking-tight text-neutral-900">{business.name}</span>
          </div>

          {/* Tablet and up: a breadcrumb */}
          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 md:block">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              <li className="min-w-0 truncate text-neutral-500">{business.name}</li>
              <li aria-hidden className="shrink-0 text-neutral-300">
                <ChevronRight size={14} strokeWidth={2} />
              </li>
              <li aria-current="page" className="min-w-0 truncate font-semibold text-neutral-900">
                {pageLabelFor(location.pathname)}
              </li>
            </ol>
          </nav>

          {!locked && <BookingLinkActions url={bookingUrl} name={business.name} />}

          {/* Every plan gets the bell: billing notices (payment verified, plan changed) go here too.
              Booking notifications are only written for plans that include them. */}
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-neutral-200 sm:block" />
          <NotificationBell businessId={business.id} timezone={timezone} />


          {/* A locked account has no tab bar, so signing out has to stay reachable on a phone */}
          {locked && (
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="-mr-1.5 flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-neutral-600 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600 md:hidden"
            >
              <LogOut size={17} strokeWidth={1.75} aria-hidden /> Sign out
            </button>
          )}
        </header>

        <main
          className={`min-w-0 p-4 sm:p-6 md:pb-6 xl:p-8 ${locked ? 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]' : 'pb-bottom-bar'}`}
        >
          <Outlet context={{ business, timezone, can, billing, reload }} />
        </main>
      </div>

      {!locked && <BottomNav onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />}
      {moreOpen && (
        <MoreSheet
          business={business}
          billingLabel={billingLabel}
          platformAdmin={platformAdmin}
          userLabel={userLabel}
          userEmail={userEmail}
          bookingUrl={bookingUrl}
          onClose={() => setMoreOpen(false)}
          onSignOut={() => {
            setMoreOpen(false)
            supabase.auth.signOut()
          }}
        />
      )}
    </div>
  )
}
