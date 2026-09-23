import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { BadgeCheck, Bell, BellOff, CalendarCheck, CalendarX2, CheckCheck, CheckCircle2, Clock3, Receipt, XCircle, type LucideIcon } from 'lucide-react'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/notifications'
import { supabase } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { fmtDateTime, fmtRelative } from '../lib/format'
import type { AppNotification } from '../lib/types'
import Modal from './Modal'
import { Bone } from './Status'

/** Per-kind glyph so a long feed can be skimmed by shape, not just read. */
const KIND: Record<string, { icon: LucideIcon; tint: string }> = {
  new_booking: { icon: CalendarCheck, tint: 'bg-green-50 text-green-600' },
  booking_cancelled: { icon: CalendarX2, tint: 'bg-red-50 text-red-600' },
  reminder: { icon: Clock3, tint: 'bg-blue-50 text-blue-600' },
  payment_submitted: { icon: Receipt, tint: 'bg-blue-50 text-blue-600' },
  payment_approved: { icon: CheckCircle2, tint: 'bg-green-50 text-green-600' },
  payment_rejected: { icon: XCircle, tint: 'bg-red-50 text-red-600' },
  plan_updated: { icon: BadgeCheck, tint: 'bg-brand-50 text-brand-600' },
}
const FALLBACK_KIND = { icon: Bell, tint: 'bg-neutral-100 text-neutral-500' }

/** Tracks a CSS media query so the panel can be a sheet on phones and a dropdown on desktop. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function NotificationItem({
  notification,
  timezone,
  onMarkRead,
}: {
  notification: AppNotification
  timezone: string
  onMarkRead: (id: string) => void
}) {
  const { icon: Icon, tint } = KIND[notification.type] ?? FALLBACK_KIND
  const unread = !notification.is_read

  return (
    <li>
      {/* The whole row is the "mark read" target — a text link was a 40px-wide tap area */}
      <button
        type="button"
        disabled={!unread}
        onClick={() => onMarkRead(notification.id)}
        aria-label={unread ? `Mark "${notification.title}" as read` : undefined}
        className={`flex w-full items-start gap-3 px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
          unread ? 'bg-brand-50/40 hover:bg-brand-50 active:bg-brand-100/60' : 'hover:bg-neutral-50'
        } disabled:hover:bg-transparent`}
      >
        <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full ${tint}`}>
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className={`min-w-0 flex-1 text-sm ${unread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
              {notification.title}
            </span>
            <span
              className="mt-0.5 flex-none text-[11px] text-neutral-400"
              title={fmtDateTime(notification.created_at, timezone)}
            >
              {fmtRelative(notification.created_at)}
            </span>
          </span>
          <span className={`mt-0.5 block text-sm ${unread ? 'text-neutral-700' : 'text-neutral-500'}`}>{notification.message}</span>
        </span>
        {unread && <span className="mt-2 h-2 w-2 flex-none rounded-full bg-brand-600" aria-hidden="true" />}
      </button>
    </li>
  )
}

function PanelBody({
  notifications,
  loading,
  timezone,
  onMarkRead,
}: {
  notifications: AppNotification[]
  loading: boolean
  timezone: string
  onMarkRead: (id: string) => void
}) {
  if (loading && notifications.length === 0)
    return (
      <div className="space-y-3 px-3 py-4" aria-busy="true" aria-label="Loading notifications">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Bone className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3.5 w-1/3" />
              <Bone className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    )

  if (notifications.length === 0)
    return (
      <div className="px-4 py-10 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <BellOff size={18} strokeWidth={1.75} />
        </span>
        <p className="mt-3 text-sm font-medium text-neutral-700">You're all caught up</p>
        <p className="mt-1 text-sm text-neutral-500">New bookings will show up here.</p>
      </div>
    )

  return (
    <ul className="divide-y divide-neutral-100">
      {notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} timezone={timezone} onMarkRead={onMarkRead} />
      ))}
    </ul>
  )
}

export default function NotificationBell({
  businessId,
  timezone,
  theme = 'light',
  align = 'right',
}: {
  businessId: string
  timezone: string
  /** 'dark' for placement on the dark sidebar, 'light' for the white mobile top bar. */
  theme?: 'light' | 'dark'
  /** Which edge of the button the desktop dropdown hangs from. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const instanceId = useId()
  const isPhone = useMediaQuery('(max-width: 639px)')
  const load = useCallback(() => fetchNotifications(businessId), [businessId])
  const { data, loading, reload } = useLoad(load)
  const notifications = data ?? []
  const unread = notifications.filter((n) => !n.is_read).length

  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${businessId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `business_id=eq.${businessId}` },
        () => reload(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, instanceId, reload])

  // The desktop dropdown is dismissed with Esc; the mobile sheet handles that itself.
  useEffect(() => {
    if (!open || isPhone) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, isPhone])

  async function markRead(id: string) {
    await markNotificationRead(id)
    reload()
  }

  async function markAllRead() {
    await markAllNotificationsRead(businessId)
    reload()
  }

  const header = (
    <>
      {unread > 0 && (
        <button
          type="button"
          onClick={markAllRead}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-brand-600 outline-none transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <CheckCheck size={14} strokeWidth={2} />
          Mark all read
        </button>
      )}
    </>
  )

  const body: ReactNode = (
    <PanelBody notifications={notifications} loading={loading} timezone={timezone} onMarkRead={markRead} />
  )

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 sm:h-9 sm:w-9 sm:rounded-lg ${
          theme === 'dark'
            ? 'text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:ring-white/40'
            : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-neutral-900'
        }`}
      >
        <Bell size={19} strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white sm:right-0.5 sm:top-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Phones get a focus-trapped bottom sheet; desktop keeps an anchored dropdown */}
      {open &&
        (isPhone ? (
          <Modal
            onClose={() => setOpen(false)}
            titleId="notifications-title"
            title={
              <span className="flex items-center gap-2">
                Notifications
                {unread > 0 && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{unread} new</span>
                )}
              </span>
            }
          >
            {unread > 0 && <div className="mb-2 flex justify-end">{header}</div>}
            <div className="-mx-5 border-t border-neutral-100">{body}</div>
          </Modal>
        ) : (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-label="Notifications"
              className={`absolute top-11 z-40 w-96 max-w-[90vw] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg shadow-neutral-900/10 ${
                align === 'left' ? 'left-0' : 'right-0'
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  Notifications
                  {unread > 0 && (
                    <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{unread}</span>
                  )}
                </p>
                {header}
              </div>
              <div className="max-h-96 overflow-y-auto overscroll-contain">{body}</div>
            </div>
          </>
        ))}
    </div>
  )
}
