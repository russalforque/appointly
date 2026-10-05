import type { ReactNode, InputHTMLAttributes } from 'react'
import { AlertCircle, Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { fieldCls } from './formStyles'

/**
 * A labelled control with its hint, character count, and error in one place. The error replaces
 * the hint rather than stacking under it, so the row never grows two lines at once.
 */
export function FormField({
  id,
  label,
  optional,
  hint,
  error,
  count,
  max,
  aside,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: ReactNode
  error?: string
  count?: number
  max?: number
  /** Right side of the label row — a visibility switch, a link. */
  aside?: ReactNode
  children: ReactNode
}) {
  const near = max !== undefined && count !== undefined && count > max * 0.9
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-neutral-800">
          {label}
          {optional && <span className="ml-1 font-normal text-neutral-400">(optional)</span>}
        </label>
        {aside}
      </div>
      {children}
      {(error || hint || max !== undefined) && (
        <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
          {error ? (
            <p id={`${id}-msg`} className="flex items-start gap-1.5 font-medium text-red-600" role="alert">
              <AlertCircle size={13} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
              {error}
            </p>
          ) : hint ? (
            <p id={`${id}-msg`} className="text-neutral-500">
              {hint}
            </p>
          ) : (
            <span />
          )}
          {max !== undefined && count !== undefined && (
            <span className={`shrink-0 tabular-nums ${count > max ? 'font-medium text-red-600' : near ? 'text-amber-600' : 'text-neutral-400'}`}>
              {count}/{max}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Text input with an optional leading icon. */
export function IconInput({
  icon: Icon,
  invalid,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon | ((p: { size?: number; className?: string }) => ReactNode); invalid?: boolean }) {
  return (
    <div className="relative">
      {Icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          <Icon size={15} />
        </span>
      )}
      <input {...props} className={`${fieldCls(invalid)} ${Icon ? '!pl-9' : ''} ${className}`} />
    </div>
  )
}

/**
 * Public/hidden switch for a contact field. Spelled out in words and an eye icon, not only a
 * colour, and wide enough to hit with a thumb.
 */
export function VisibilityToggle({ visible, onChange, what }: { visible: boolean; onChange: (v: boolean) => void; what: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      aria-label={`Show ${what} on booking page`}
      onClick={() => onChange(!visible)}
      className={`-my-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
        visible ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
      }`}
    >
      {visible ? <Eye size={13} strokeWidth={2} aria-hidden /> : <EyeOff size={13} strokeWidth={2} aria-hidden />}
      {visible ? 'Public' : 'Hidden'}
    </button>
  )
}

/**
 * One settings group. Wide screens put the title and explanation in a left rail and the fields
 * beside it, so the page reads as a list of topics rather than a wall of inputs; phones stack.
 */
export function Section({
  id,
  title,
  description,
  children,
  footer,
}: {
  id: string
  title: string
  description: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-40 py-7 first:pt-2 sm:py-9">
      <div className="grid gap-x-10 gap-y-4 2xl:grid-cols-[13rem_minmax(0,1fr)]">
        <div>
          <h2 id={`${id}-title`} className="text-[15px] font-semibold text-neutral-900">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{description}</p>
        </div>
        <div className="min-w-0 space-y-5">
          {children}
          {footer}
        </div>
      </div>
    </section>
  )
}
