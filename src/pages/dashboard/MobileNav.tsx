import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, Copy, ExternalLink, LayoutGrid, LogOut, Share, ShieldCheck } from 'lucide-react'
import Modal from '../../components/Modal'
import { initials } from '../../lib/format'
import { copyText, shareLink } from '../../lib/share'
import { useToast } from '../../lib/toast'
import type { Business } from '../../lib/types'
import { MORE_SECTIONS, TAB_ITEMS, isActive, type NavEntry } from './nav'

/** Business logo, or its initials on the brand tint — the same mark in the top bar and the sheet. */
export function BusinessMark({ business, className }: { business: Business; className: string }) {
  return business.logo_url ? (
    <img src={business.logo_url} alt="" className={`${className} shrink-0 rounded-xl object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white`}>
      {initials(business.name)}
    </span>
  )
}

/**
 * Phone tab bar: the four places an owner goes every day, plus More. Fixed to the bottom edge,
 * clear of the home indicator, and it marks More as current when a page behind it is open —
 * so "where am I?" always has an answer on screen.
 */
export function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { pathname } = useLocation()
  const inMore = !TAB_ITEMS.some((t) => isActive(t, pathname))
  const tab = 'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-medium outline-none transition-colors focus-visible:bg-neutral-100'

  return (
    <nav
      data-bottom-nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch">
        {TAB_ITEMS.map((item) => (
          <li key={item.to} className="flex flex-1">
            <TabLink item={item} className={tab} />
          </li>
        ))}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={onMore}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={inMore ? 'page' : undefined}
            className={`${tab} ${inMore || moreOpen ? 'text-brand-700' : 'text-neutral-500'}`}
          >
            <TabIndicator on={inMore} />
            <LayoutGrid size={22} strokeWidth={inMore ? 2.25 : 1.75} aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}

function TabIndicator({ on }: { on: boolean }) {
  return <span aria-hidden className={`absolute top-0 h-0.5 w-8 rounded-full bg-brand-600 transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`} />
}

function TabLink({ item, className }: { item: NavEntry; className: string }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive: on }) => `${className} ${on ? 'text-brand-700' : 'text-neutral-500'}`}>
      {({ isActive: on }) => (
        <>
          <TabIndicator on={on} />
          <Icon size={22} strokeWidth={on ? 2.25 : 1.75} aria-hidden />
          <span className="max-w-full truncate px-1">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Everything that is not a daily tab: the business setup pages, account pages, the booking link
 * to share, and signing out. One sheet, grouped the same way as the desktop sidebar.
 */
export function MoreSheet({
  business,
  billingLabel,
  platformAdmin,
  userLabel,
  userEmail,
  bookingUrl,
  onClose,
  onSignOut,
}: {
  business: Business
  billingLabel: string
  platformAdmin: boolean
  userLabel: string
  userEmail: string
  bookingUrl: string
  onClose: () => void
  onSignOut: () => void
}) {
  const toast = useToast()
  const sections = platformAdmin
    ? [...MORE_SECTIONS, { label: 'Appointly', items: [{ to: '/admin/payments', label: 'Admin area', icon: ShieldCheck }] }]
    : MORE_SECTIONS
  const linkBtn =
    'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-neutral-800 outline-none ring-1 ring-neutral-200 transition-colors active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600'

  return (
    <Modal
      onClose={onClose}
      titleId="more-title"
      title={
        <span className="flex min-w-0 items-center gap-3">
          <BusinessMark business={business} className="h-10 w-10 text-sm" />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold leading-tight">{business.name}</span>
            <span className="block truncate text-xs font-normal text-neutral-500">{billingLabel}</span>
          </span>
        </span>
      }
    >
      {/* The thing owners share most, kept one tap from anywhere */}
      <section aria-label="Your booking page" className="rounded-2xl bg-neutral-50 p-3">
        <p className="px-1 text-xs font-medium text-neutral-500">Your booking page</p>
        <p className="mt-0.5 truncate px-1 text-sm font-medium text-neutral-900">{bookingUrl.replace(/^https?:\/\//, '')}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => shareLink(bookingUrl, business.name, toast)} className={linkBtn}>
            <Share size={16} strokeWidth={2} aria-hidden /> Share
          </button>
          <button type="button" onClick={() => copyText(bookingUrl, toast)} className={linkBtn}>
            <Copy size={16} strokeWidth={2} aria-hidden /> Copy
          </button>
          <a href={bookingUrl} target="_blank" rel="noreferrer" aria-label="Open booking page" className={`${linkBtn} max-w-14`}>
            <ExternalLink size={16} strokeWidth={2} aria-hidden />
          </a>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.label} aria-label={section.label} className="mt-5">
          <h3 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">{section.label}</h3>
          <ul className="overflow-hidden rounded-2xl border border-neutral-200/80">
            {section.items.map((item, i) => {
              const Icon = item.icon
              return (
                <li key={item.to} className={i > 0 ? 'border-t border-neutral-100' : ''}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive: on }) =>
                      `flex h-13 items-center gap-3 px-3.5 text-[15px] outline-none transition-colors active:bg-neutral-100 focus-visible:bg-neutral-100 ${
                        on ? 'bg-brand-50/60 font-semibold text-brand-700' : 'font-medium text-neutral-800'
                      }`
                    }
                  >
                    {({ isActive: on }) => (
                      <>
                        <Icon size={19} strokeWidth={1.75} className={on ? 'text-brand-600' : 'text-neutral-400'} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <ChevronRight size={17} className="text-neutral-300" aria-hidden />
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <section aria-label="Account" className="mt-5 flex items-center gap-3 rounded-2xl border border-neutral-200/80 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
          {initials(userLabel)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-neutral-900">{userLabel}</span>
          <span className="block truncate text-xs text-neutral-500">{userEmail}</span>
        </span>
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-600 outline-none transition-colors active:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <LogOut size={16} strokeWidth={2} aria-hidden /> Sign out
        </button>
      </section>
    </Modal>
  )
}
