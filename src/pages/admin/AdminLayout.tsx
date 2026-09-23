import { useCallback } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { ArrowLeft, Banknote, Building2, LogOut, Settings2, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { hasAnyBusiness, isPlatformAdmin } from '../../lib/admin'
import { supabase } from '../../lib/supabase'
import { useLoad } from '../../lib/useLoad'
import { Bone, ErrorText } from '../../components/Status'
import Logo from '../../components/Logo'

const TABS = [
  { to: '/admin/payments', label: 'Payments', icon: Banknote },
  { to: '/admin/businesses', label: 'Businesses', icon: Building2 },
  { to: '/admin/admins', label: 'Admins', icon: Users },
  { to: '/admin/payment-settings', label: 'Payment settings', icon: Settings2 },
]

const headerLink =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600'

/**
 * Platform-admin area, separate from the business dashboard. The check here only decides what
 * to render — every admin action is re-authorized in the database.
 */
export default function AdminLayout() {
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user.id
  // A staff-only admin has no business of its own, so there is no dashboard to offer them.
  const load = useCallback(async () => {
    if (!userId) return { allowed: false, ownsBusiness: false }
    const allowed = await isPlatformAdmin()
    return { allowed, ownsBusiness: allowed ? await hasAnyBusiness() : false }
  }, [userId])
  const { data, loading, error } = useLoad(load)

  if (authLoading || loading)
    return (
      <div className="font-dashboard min-h-screen bg-neutral-50 p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-6xl space-y-3">
          <Bone className="h-7 w-48" />
          <Bone className="h-4 w-72" />
        </div>
      </div>
    )
  if (!session) return <Navigate to="/login" replace />
  if (error) return <ErrorText message={error} />
  if (!data?.allowed) return <Navigate to="/dashboard" replace />

  return (
    <div className="font-dashboard min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo className="h-7 w-7 shrink-0" />
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-neutral-900">Appointly Admin</span>
            <ShieldCheck size={14} strokeWidth={2} className="hidden shrink-0 text-brand-600 sm:block" />
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {data.ownsBusiness && (
              <NavLink to="/dashboard" className={headerLink}>
                <ArrowLeft size={15} strokeWidth={1.75} />
                <span className="hidden sm:inline">Dashboard</span>
              </NavLink>
            )}
            <button onClick={() => supabase.auth.signOut()} className={headerLink}>
              <LogOut size={15} strokeWidth={1.75} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </span>
        </div>
        <nav aria-label="Admin" className="mx-auto max-w-6xl px-4 sm:px-6">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `inline-flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
                      isActive
                        ? 'border-brand-600 font-semibold text-brand-700'
                        : 'border-transparent font-medium text-neutral-500 hover:text-neutral-900'
                    }`
                  }
                >
                  <Icon size={15} strokeWidth={1.75} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
