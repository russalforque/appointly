import { useCallback, useState, type FormEvent } from 'react'
import { Banknote, CheckCircle2, Inbox, Loader2, XCircle } from 'lucide-react'
import { fmtDate, fmtMoney } from '../../lib/billing'
import { adminListPayments, adminPaymentCounts, approvePayment, rejectPayment } from '../../lib/payments'
import { useLoad } from '../../lib/useLoad'
import { btnGhost, btnPrimary, input, panel } from '../../lib/ui'
import type { AdminPayment, PaymentStatus } from '../../lib/types'
import Modal from '../../components/Modal'
import PaymentStatusPill from '../../components/PaymentStatusPill'
import ProofPreview from '../../components/ProofPreview'
import { Bone, ErrorText, ListSkeleton, PageHeaderSkeleton, StatGridSkeleton } from '../../components/Status'

const FILTERS: { value: PaymentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
]

const REJECTION_PRESETS = [
  'Incorrect amount',
  'Invalid receipt',
  'Payment could not be verified',
  'Incorrect reference number',
  'Duplicate payment',
]

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">{value}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-right text-sm text-neutral-900">{children}</span>
    </div>
  )
}

function RejectDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: AdminPayment
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await rejectPayment(payment.id, reason)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject this payment.')
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Reject payment" titleId="reject-payment-title">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-neutral-600">
          Rejecting <span className="font-mono font-semibold text-neutral-900">{payment.payment_reference}</span> from{' '}
          {payment.business_name}. The customer sees this reason and can submit a new payment.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {REJECTION_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {p}
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Reason for rejection</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            minLength={5}
            maxLength={300}
            className={input}
            placeholder="Explain what was wrong with this payment"
          />
        </label>

        <ErrorText message={error} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={`${btnGhost} h-11 sm:h-10`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length < 5}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-sm font-medium text-white outline-none transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50 sm:h-10"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Reject payment
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ReviewDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: AdminPayment
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      await approvePayment(payment.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve this payment.')
      setBusy(false)
      setConfirming(false)
    }
  }

  if (rejecting) return <RejectDialog payment={payment} onClose={() => setRejecting(false)} onDone={onDone} />

  return (
    <Modal onClose={onClose} title="Review payment" titleId="review-payment-title" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-neutral-900">{payment.payment_reference}</span>
          <PaymentStatusPill status={payment.status} />
        </div>

        {payment.status === 'rejected' && payment.rejection_reason && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
            <span className="font-semibold">Rejected: </span>
            {payment.rejection_reason}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer</h3>
            <div className="rounded-xl border border-neutral-200 px-3.5 py-1">
              <Row label="Business">{payment.business_name}</Row>
              <Row label="Owner">{payment.owner_name ?? '—'}</Row>
              <Row label="Email">{payment.owner_email ?? '—'}</Row>
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Subscription</h3>
            <div className="rounded-xl border border-neutral-200 px-3.5 py-1">
              <Row label="Plan">{payment.plan_name ?? payment.plan_id}</Row>
              <Row label="Billing">{payment.billing_interval === 'year' ? 'Yearly' : 'Monthly'}</Row>
              <Row label="Amount">{fmtMoney(payment.amount_cents, payment.currency)}</Row>
            </div>
          </section>

          <section className="sm:col-span-2">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Payment</h3>
            <div className="rounded-xl border border-neutral-200 px-3.5 py-1">
              <Row label="Method">GoTyme Bank / QR Ph</Row>
              <Row label="Customer reference">{payment.customer_transaction_reference}</Row>
              <Row label="Payment date">{fmtDate(payment.payment_date)}</Row>
              <Row label="Submitted">{fmtDate(payment.submitted_at)}</Row>
              {payment.terms_accepted_at && (
                <Row label="Terms accepted">
                  {fmtDate(payment.terms_accepted_at)}
                  {payment.terms_version ? ` · version ${payment.terms_version}` : ''}
                </Row>
              )}
              {payment.notes && <Row label="Notes">{payment.notes}</Row>}
            </div>
          </section>
        </div>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Proof of payment</h3>
          <ProofPreview path={payment.proof_path} />
        </section>

        <ErrorText message={error} />

        {payment.status === 'pending' &&
          (confirming ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-3">
              <p className="text-sm font-medium text-green-900">
                Approve this payment and activate the {payment.plan_name ?? payment.plan_id} subscription?
              </p>
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setConfirming(false)} className={`${btnGhost} h-11 sm:h-10`}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={approve}
                  disabled={busy}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-green-700 px-3.5 text-sm font-medium text-white outline-none transition-colors hover:bg-green-800 focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-50 sm:h-10"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  Yes, approve
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setRejecting(true)} className={`${btnGhost} h-11 sm:h-10`}>
                Reject payment
              </button>
              <button type="button" onClick={() => setConfirming(true)} className={`${btnPrimary} h-11 sm:h-10`}>
                Approve payment
              </button>
            </div>
          ))}
      </div>
    </Modal>
  )
}

export default function AdminPaymentsPage() {
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('pending')
  const load = useCallback(
    async () => {
      const [payments, counts] = await Promise.all([
        adminListPayments(filter === 'all' ? undefined : filter),
        adminPaymentCounts(),
      ])
      return { payments, counts }
    },
    [filter],
  )
  const { data, loading, error, reload } = useLoad(load)
  const [open, setOpen] = useState<AdminPayment | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  function finish(message: string) {
    setOpen(null)
    setFlash(message)
    reload()
  }

  if (loading)
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton />
        <StatGridSkeleton />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <ListSkeleton rows={5} />
      </div>
    )
  if (error || !data) return <ErrorText message={error} />

  const { payments, counts } = data

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Payments</h1>
        <p className="mt-1 text-sm text-neutral-500">Verify GoTyme Bank transfers and activate subscriptions.</p>
      </div>

      {flash && (
        <p className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-green-800">
          <CheckCircle2 size={16} strokeWidth={1.75} className="mt-px shrink-0" />
          {flash}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat label="Pending" value={counts.pending} tone="bg-amber-500" />
        <Stat label="Approved" value={counts.approved} tone="bg-green-600" />
        <Stat label="Rejected" value={counts.rejected} tone="bg-red-500" />
        <Stat label="Total" value={counts.total} tone="bg-neutral-400" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`h-9 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
              filter === f.value
                ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700'
                : 'border-neutral-200 bg-white font-medium text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {payments.length === 0 ? (
        <div className={`${panel} flex flex-col items-center gap-2 py-10 text-center`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
            <Inbox size={20} strokeWidth={1.5} />
          </span>
          <p className="text-sm font-medium text-neutral-900">
            {filter === 'pending' ? 'No payments waiting for verification' : 'No payments here'}
          </p>
          <p className="max-w-xs text-sm text-neutral-500">
            {filter === 'pending'
              ? 'New customer payments will appear here as soon as they are submitted.'
              : 'Try a different filter.'}
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
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Customer reference</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {payments.map((p) => (
                  <tr key={p.id} className="align-middle">
                    <td className="max-w-48 px-4 py-3">
                      <p className="truncate font-medium text-neutral-900">{p.business_name}</p>
                      <p className="truncate text-xs text-neutral-500">{p.owner_email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.plan_name ?? p.plan_id}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-neutral-900">
                      {fmtMoney(p.amount_cents, p.currency)}
                    </td>
                    <td className="max-w-40 truncate px-4 py-3 font-mono text-xs text-neutral-600">
                      {p.customer_transaction_reference}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{fmtDate(p.payment_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{fmtDate(p.submitted_at)}</td>
                    <td className="px-4 py-3">
                      <PaymentStatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => setOpen(p)} className={`${btnGhost} h-9`}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — the same rows without horizontal scrolling */}
          <ul className="space-y-3 md:hidden">
            {payments.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpen(p)}
                  className={`${panel} block w-full text-left outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{p.business_name}</p>
                      <p className="truncate text-xs text-neutral-500">{p.owner_email ?? '—'}</p>
                    </div>
                    <PaymentStatusPill status={p.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-neutral-500">Plan</dt>
                      <dd className="truncate font-medium text-neutral-900">{p.plan_name ?? p.plan_id}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Amount</dt>
                      <dd className="font-medium text-neutral-900">{fmtMoney(p.amount_cents, p.currency)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-neutral-500">Customer reference</dt>
                      <dd className="truncate font-mono text-xs text-neutral-700">{p.customer_transaction_reference}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Submitted</dt>
                      <dd className="text-neutral-700">{fmtDate(p.submitted_at)}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                    <Banknote size={15} strokeWidth={1.75} />
                    Review payment
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <ReviewDialog
          payment={open}
          onClose={() => setOpen(null)}
          onDone={() =>
            finish(
              open.status === 'pending'
                ? 'Payment updated. The customer has been notified.'
                : 'Payment updated.',
            )
          }
        />
      )}

      {payments.some((p) => p.status === 'rejected') && (
        <p className="flex items-start gap-2 text-xs text-neutral-500">
          <XCircle size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-neutral-400" />
          Rejected payments are kept for the record and can still be reviewed.
        </p>
      )}
    </div>
  )
}
