import { Fragment, useId, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { fmtMoney } from '../lib/billing'
import { COMPARISON, RECOMMENDED_PLAN_ID, planCopy } from '../lib/plans'
import type { Plan } from '../lib/types'

/**
 * The plans side by side — one stacked column on phones, two from sm. Shared by the landing page,
 * the pricing page and Billing, so a plan reads the same everywhere; only the button differs,
 * which the caller renders from the visitor's own situation.
 */
export function PlanCards({
  plans,
  action,
  note,
  currentPlanId,
  focusPlanId,
}: {
  plans: Plan[]
  /** The card's button. */
  action: (plan: Plan) => ReactNode
  /** Optional line under the button, e.g. what happens to unused time. */
  note?: (plan: Plan) => ReactNode
  /** Badged "Current plan" instead of "Most popular". */
  currentPlanId?: string | null
  /** Arrived from an upgrade prompt for this plan: ring it. */
  focusPlanId?: string | null
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          action={action(plan)}
          note={note?.(plan)}
          current={plan.id === currentPlanId}
          focused={plan.id === focusPlanId}
        />
      ))}
    </div>
  )
}

function PlanCard({
  plan,
  action,
  note,
  current,
  focused,
}: {
  plan: Plan
  action: ReactNode
  note?: ReactNode
  current: boolean
  focused: boolean
}) {
  const titleId = useId()
  const copy = planCopy(plan)
  const recommended = plan.id === RECOMMENDED_PLAN_ID
  const emphasised = recommended || focused

  return (
    <article
      aria-labelledby={titleId}
      className={`relative flex flex-col rounded-2xl border bg-white p-5 sm:p-6 ${
        emphasised ? 'border-brand-600 shadow-md shadow-brand-600/10 ring-1 ring-brand-600' : 'border-neutral-200 shadow-sm shadow-neutral-900/4'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="text-base font-semibold text-neutral-900">
          {plan.name}
        </h3>
        {current ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
            <Check size={11} strokeWidth={3} aria-hidden />
            Current plan
          </span>
        ) : (
          recommended && (
            <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">Most popular</span>
          )
        )}
      </div>
      {copy.audience && <p className="mt-1 text-sm text-neutral-500">{copy.audience}</p>}

      <p className="mt-5 flex flex-wrap items-baseline gap-x-1">
        <span className="text-[34px] font-semibold leading-none tracking-tight text-neutral-900">
          {fmtMoney(plan.price_cents, plan.currency)}
        </span>
        <span className="text-sm text-neutral-500">/ {plan.interval}</span>
      </p>

      <div className="mt-5">{action}</div>
      {note && <div className="mt-2 text-xs leading-relaxed text-neutral-500">{note}</div>}

      <div className="mt-6 border-t border-neutral-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{copy.featuresHeading}</p>
        <ul className="mt-3 space-y-2.5 text-sm text-neutral-700">
          {copy.highlights.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <Check size={16} strokeWidth={2.25} className="mt-px flex-none text-brand-600" aria-hidden />
              <span className="min-w-0">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === 'string') return <span className="text-sm font-medium text-neutral-800">{value}</span>
  return value ? (
    <>
      <Check size={17} strokeWidth={2.5} className="mx-auto text-brand-600" aria-hidden />
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <Minus size={16} strokeWidth={2} className="mx-auto text-neutral-300" aria-hidden />
      <span className="sr-only">Not included</span>
    </>
  )
}

/** Every feature, row by row. Narrow plan columns keep it readable on a phone without scrolling sideways. */
export function PlanComparison({ plans }: { plans: Plan[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Plan comparison</caption>
        <colgroup>
          <col />
          {plans.map((p) => (
            <col key={p.id} className="w-22 sm:w-36" />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50/70">
            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Features
            </th>
            {plans.map((p) => (
              <th key={p.id} scope="col" className="px-2 py-3 text-center text-sm font-semibold text-neutral-900">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON.map((group) => (
            <Fragment key={group.group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={plans.length + 1}
                  className="px-4 pb-2 pt-5 text-xs font-semibold uppercase tracking-wider text-neutral-400"
                >
                  {group.group}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-t border-neutral-100">
                  <th scope="row" className="px-4 py-3 text-sm font-normal text-neutral-700">
                    {row.label}
                  </th>
                  {plans.map((p) => (
                    <td key={p.id} className="px-2 py-3 text-center">
                      <Cell value={row.value(p)} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
