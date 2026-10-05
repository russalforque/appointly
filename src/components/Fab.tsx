import { Plus, type LucideIcon } from 'lucide-react'

const cls =
  'fixed right-4 bottom-above-bar z-30 flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-600 pl-4 pr-5 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/30 outline-none transition-[background-color,transform] hover:bg-brand-700 active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:hidden'

/**
 * The page's primary action on phones, floating above the tab bar in the thumb's resting spot.
 * Labelled rather than a bare "+": "New booking" and "New service" do different things.
 * From sm up the same action lives in the page header instead.
 */
export default function Fab({
  label,
  icon: Icon = Plus,
  href,
  onClick,
}: {
  label: string
  icon?: LucideIcon
  /** An external page (the public booking page) — opens in a new tab. */
  href?: string
  onClick?: () => void
}) {
  const content = (
    <>
      <Icon size={20} strokeWidth={2.25} aria-hidden />
      {label}
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  )
}
