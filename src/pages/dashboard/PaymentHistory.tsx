import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { fmtDate, fmtMoney } from '../../lib/billing'
import { panel } from '../../lib/ui'
import type { Plan, SubscriptionPayment } from '../../lib/types'
import Modal from '../../components/Modal'
import CopyButton from '../../components/CopyButton'
import PaymentStatusPill from '../../components/PaymentStatusPill'
import ProofPreview from '../../components/ProofPreview'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="min-w-0 break-words text-right text-sm text-neutral-900">{children}</span>
    </div>
  )
}

function PaymentDetail({ payment, planName, onClose }: { payment: SubscriptionPayment; planName: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="Payment details" titleId="payment-detail-title" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-neutral-900">{payment.payment_reference}</span>
            <CopyButton value={payment.payment_reference} label="payment reference" />
          </span>
          <PaymentStatusPill status={payment.status} />
        </div>

        {payment.status === 'rejected' && payment.rejection_reason && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
            <span className="font-semibold">Reason: </span>
            {payment.rejection_reason}
          </p>
        )}

        <div className="rounded-xl border border-neutral-200 px-3.5 py-1">
          <Row label="Plan">{planName}</Row>
          <Row label="Amount">{fmtMoney(payment.amount_cents, payment.currency)}</Row>
          <Row label="Billing">{payment.billing_interval === 'year' ? 'Yearly' : 'Monthly'}</Row>
          <Row label="Method">GoTyme Bank / QR Ph</Row>
          <Row label="Your reference">{payment.customer_transaction_reference ?? '—'}</Row>
          <Row label="Payment date">{payment.payment_date ? fmtDate(payment.payment_date) : '—'}</Row>
          <Row label="Submitted">{payment.submitted_at ? fmtDate(payment.submitted_at) : '—'}</Row>
          {payment.verified_at && <Row label="Verified">{fmtDate(payment.verified_at)}</Row>}
          {payment.rejected_at && <Row label="Rejected">{fmtDate(payment.rejected_at)}</Row>}
          {payment.notes && <Row label="Notes">{payment.notes}</Row>}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Proof of payment</p>
          {payment.proof_path ? <ProofPreview path={payment.proof_path} /> : <p className="text-sm text-neutral-500">No receipt.</p>}
        </div>
      </div>
    </Modal>
  )
}

/** Payment history as rows on desktop and stacked cards on mobile — no horizontal scrolling. */
export default function PaymentHistory({ payments, plans }: { payments: SubscriptionPayment[]; plans: Plan[] }) {
  const [open, setOpen] = useState<SubscriptionPayment | null>(null)
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id

  return (
    <section>
      <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <Receipt size={14} strokeWidth={2} />
        </span>
        Payment history
      </h2>

      {payments.length === 0 ? (
        <div className={`${panel} mt-3 text-sm text-neutral-500`}>
          No payments yet. Once you pay for a plan, your receipts and their status appear here.
        </div>
      ) : (
        <ul className={`${panel} mt-3 !p-0 divide-y divide-neutral-100`}>
          {payments.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setOpen(p)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[13px] font-semibold text-neutral-900">{p.payment_reference}</span>
                    <PaymentStatusPill status={p.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">
                    {planName(p.plan_id)} · {p.submitted_at ? `Submitted ${fmtDate(p.submitted_at)}` : 'Not submitted'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-neutral-900">{fmtMoney(p.amount_cents, p.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <PaymentDetail payment={open} planName={planName(open.plan_id)} onClose={() => setOpen(null)} />}
    </section>
  )
}
