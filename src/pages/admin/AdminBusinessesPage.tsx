import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Building2, ExternalLink, Loader2, Search, SlidersHorizontal, Users } from 'lucide-react'
import { adminListBusinesses, adminListPlans, adminSetBusinessPlan, matchesBusiness } from '../../lib/admin'
import { fmtDate, fmtMoney } from '../../lib/billing'
import { useLoad } from '../../lib/useLoad'
import { btnGhost, btnPrimary, input, panel } from '../../lib/ui'
import type { AdminBusiness, AdminPlanStatus, Plan, SubscriptionStatus } from '../../lib/types'
import Field from '../../components/Field'
import Modal from '../../components/Modal'
import Select from '../../components/Select'
import { Bone, ErrorText, ListSkeleton, PageHeaderSkeleton, StatGridSkeleton } from '../../components/Status'

const SUB_TONE: Record<SubscriptionStatus | 'none' | 'expired', { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-green-200 bg-green-50 text-green-700' },
  trialing: { label: 'Trial', className: 'border-brand-200 bg-brand-50 text-brand-700' },
  expired: { label: 'Expired', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  pending: { label: 'Payment pending', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  past_due: { label: 'Past due', className: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: 'Cancelled', className: 'border-neutral-200 bg-neutral-100 text-neutral-600' },
  none: { label: 'No subscription', className: 'border-neutral-200 bg-neutral-100 text-neutral-600' },
}

/** Trials that ran out still read as 'trialing' in the row, so resolve that for display. */
function subKey(b: AdminBusiness): SubscriptionStatus | 'none' | 'expired' {
  if (!b.subscription_status) return 'none'
  if (b.subscription_status === 'trialing' && b.trial_end && new Date(b.trial_end).getTime() < Date.now()) return 'expired'
  return b.subscription_status
}

function SubPill({ business }: { business: AdminBusiness }) {
  const { label, className } = SUB_TONE[subKey(business)]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  )
}

/** When the current period or trial runs out, whichever applies. */
function renewal(b: AdminBusiness): string {
  const iso = b.subscription_status === 'trialing' ? b.trial_end : b.current_period_end
  return iso ? fmtDate(iso) : '—'
}

const PLAN_STATUSES: { value: AdminPlanStatus; label: string; hint: string }[] = [
  { value: 'active', label: 'Active (paid)', hint: 'Full access until the end date.' },
  { value: 'trialing', label: 'Trial', hint: 'Full access until the trial ends.' },
  { value: 'past_due', label: 'Past due', hint: 'Locked out until they pay.' },
  { value: 'cancelled', label: 'Cancelled', hint: 'Locked out; no end date.' },
]

/** 'YYYY-MM-DD' for a date input, n months from today. */
function dateInputValue(monthsAhead: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + monthsAhead)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Sets a business's plan by hand. Everything here is re-validated by admin_set_business_plan;
 * the defaults exist so the ordinary case ("give them another month") is one click.
 */
function ManagePlanDialog({
  business,
  plans,
  onClose,
  onDone,
}: {
  business: AdminBusiness
  plans: Plan[]
  onClose: () => void
  onDone: () => void
}) {
  const [planId, setPlanId] = useState(business.plan_id ?? plans[0]?.id ?? '')
  const [status, setStatus] = useState<AdminPlanStatus>(
    business.subscription_status && business.subscription_status !== 'pending' ? business.subscription_status : 'active',
  )
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = plans.find((p) => p.id === planId)
  const datedStatus = status === 'active' || status === 'trialing'

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await adminSetBusinessPlan({
        businessId: business.id,
        planId,
        status,
        // End of the chosen day, so "until the 30th" includes the 30th.
        periodEnd: datedStatus && endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
        note: note.trim() || null,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this plan.')
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Manage plan" titleId="manage-plan-title">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{business.name}</span>
          {business.owner_email && <> — {business.owner_email}</>}
        </p>

        <Field label="Plan">
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)} required className={input}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {fmtMoney(p.price_cents, p.currency)}/{p.interval}
                {p.is_active ? '' : ' (retired)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Status"
          hint={PLAN_STATUSES.find((s) => s.value === status)?.hint}
        >
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminPlanStatus)}
            className={input}
          >
            {PLAN_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        {datedStatus && (
          <Field
            label={status === 'trialing' ? 'Trial ends' : 'Paid period ends'}
            hint={
              endDate
                ? undefined
                : `Leave empty for one ${plan?.interval ?? 'month'} from today.`
            }
          >
            <input
              type="date"
              value={endDate}
              min={dateInputValue(0)}
              onChange={(e) => setEndDate(e.target.value)}
              className={input}
            />
            <span className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: '+1 month', months: 1 },
                { label: '+3 months', months: 3 },
                { label: '+1 year', months: 12 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setEndDate(dateInputValue(p.months))}
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {p.label}
                </button>
              ))}
            </span>
          </Field>
        )}

        <Field label="Note (optional)" hint="Added to the notification the owner sees, and to the audit log.">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. Comped for the pilot month"
            className={input}
          />
        </Field>

        <ErrorText message={error} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={`${btnGhost} h-11 sm:h-10`}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !planId} className={`${btnPrimary} h-11 sm:h-10`}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save plan
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={panel}>
      <p className="truncate text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{value}</p>
    </div>
  )
}

export default function AdminBusinessesPage() {
  const load = useCallback(async () => {
    const [businesses, plans] = await Promise.all([adminListBusinesses(), adminListPlans()])
    return { businesses, plans }
  }, [])
  const { data: loaded, loading, error, reload } = useLoad(load)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AdminBusiness | null>(null)
  const data = loaded?.businesses

  const rows = useMemo(() => (data ?? []).filter((b) => matchesBusiness(b, query)), [data, query])

  if (loading)
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton />
        <StatGridSkeleton />
        <Bone className="h-10 w-full rounded-lg sm:w-72" />
        <ListSkeleton rows={6} />
      </div>
    )
  if (error || !loaded || !data) return <ErrorText message={error} />

  const paying = data.filter((b) => b.subscription_status === 'active').length
  const trialing = data.filter((b) => subKey(b) === 'trialing').length

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Businesses</h1>
        <p className="mt-1 text-sm text-neutral-500">Every account on Appointly, with its owner and subscription.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat label="Businesses" value={data.length} />
        <Stat label="Paying" value={paying} />
        <Stat label="On trial" value={trialing} />
        <Stat label="Bookings" value={data.reduce((n, b) => n + Number(b.booking_count), 0)} />
      </div>

      <div className="relative sm:max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search business, owner or email"
          aria-label="Search businesses"
          className="h-11 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 sm:h-10"
        />
      </div>

      {rows.length === 0 ? (
        <div className={`${panel} flex flex-col items-center gap-2 py-10 text-center`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
            <Building2 size={20} strokeWidth={1.5} />
          </span>
          <p className="text-sm font-medium text-neutral-900">
            {query ? 'No businesses match your search' : 'No businesses yet'}
          </p>
          <p className="max-w-xs text-sm text-neutral-500">
            {query ? 'Try a different name or email.' : 'Accounts appear here as soon as someone signs up.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${panel} hidden !p-0 md:block`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Subscription</th>
                  <th className="px-4 py-3">Renews / ends</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                  <th className="px-4 py-3 text-right">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="max-w-56 px-4 py-3">
                      <p className="flex items-center gap-1.5 truncate font-medium text-neutral-900">
                        {b.name}
                        {!b.is_active && (
                          <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
                            Off
                          </span>
                        )}
                      </p>
                      <a
                        href={`/book/${b.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate text-xs text-neutral-500 underline-offset-2 hover:text-brand-700 hover:underline"
                      >
                        /{b.slug}
                        <ExternalLink size={11} strokeWidth={1.75} />
                      </a>
                    </td>
                    <td className="max-w-56 px-4 py-3">
                      <p className="truncate text-neutral-900">{b.owner_name ?? '—'}</p>
                      <p className="truncate text-xs text-neutral-500">{b.owner_email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{b.plan_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <SubPill business={b} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{renewal(b)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{fmtDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{b.booking_count}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(b)}
                        className={`${btnGhost} inline-flex items-center gap-1.5 whitespace-nowrap`}
                      >
                        <SlidersHorizontal size={14} strokeWidth={1.75} />
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — same data, no horizontal scrolling */}
          <ul className="space-y-3 md:hidden">
            {rows.map((b) => (
              <li key={b.id} className={panel}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{b.name}</p>
                    <p className="truncate text-xs text-neutral-500">{b.owner_email ?? '—'}</p>
                  </div>
                  <SubPill business={b} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-neutral-500">Owner</dt>
                    <dd className="truncate text-neutral-900">{b.owner_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Plan</dt>
                    <dd className="truncate text-neutral-900">{b.plan_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Renews / ends</dt>
                    <dd className="text-neutral-700">{renewal(b)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">Joined</dt>
                    <dd className="text-neutral-700">{fmtDate(b.created_at)}</dd>
                  </div>
                </dl>
                <p className="mt-3 flex items-center gap-3 border-t border-neutral-100 pt-2.5 text-xs text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} strokeWidth={1.75} />
                    {b.member_count} member{Number(b.member_count) === 1 ? '' : 's'}
                  </span>
                  <span>{b.booking_count} bookings</span>
                  <a
                    href={`/book/${b.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-2 hover:underline"
                  >
                    Booking page
                    <ExternalLink size={11} strokeWidth={1.75} />
                  </a>
                </p>
                <button
                  onClick={() => setEditing(b)}
                  className={`${btnGhost} mt-3 flex h-11 w-full items-center justify-center gap-1.5`}
                >
                  <SlidersHorizontal size={14} strokeWidth={1.75} />
                  Manage plan
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <ManagePlanDialog
          business={editing}
          plans={loaded.plans}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}
