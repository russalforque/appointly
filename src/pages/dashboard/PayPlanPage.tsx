import { useCallback, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ImageUp,
  Info,
  Landmark,
  Loader2,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react'
import { fetchPlans, fmtMoney } from '../../lib/billing'
import {
  PROOF_ACCEPT,
  fetchPaymentSettings,
  fetchPayments,
  findPossibleDuplicate,
  startPayment,
  submitPayment,
  uploadProof,
  validateProof,
} from '../../lib/payments'
import { todayIn } from '../../lib/format'
import { useLoad } from '../../lib/useLoad'
import { btnPrimary, input, panel } from '../../lib/ui'
import type { SubscriptionPayment } from '../../lib/types'
import Field from '../../components/Field'
import CopyButton from '../../components/CopyButton'
import { Bone, ErrorText, PageHeaderSkeleton } from '../../components/Status'
import { useBusiness } from './useBusiness'

/** A labelled value with a copy affordance, used for the details a customer retypes into their bank app. */
function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`truncate text-sm font-semibold text-neutral-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
        <CopyButton value={value} label={label} />
      </span>
    </div>
  )
}

function StepHeading({ step, title, icon }: { step: number; title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-600">
        {step}
      </span>
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-neutral-900">
        {icon}
        {title}
      </h2>
    </div>
  )
}

export default function PayPlanPage() {
  const { planId = '' } = useParams()
  const { business, timezone } = useBusiness()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const [plans, settings, history] = await Promise.all([fetchPlans(), fetchPaymentSettings(), fetchPayments(business.id)])
    const plan = plans.find((p) => p.id === planId)
    if (!plan) throw new Error('That plan is no longer available.')
    if (!settings?.is_active) throw new Error('Online payment is unavailable right now. Please try again later.')
    // Reserving here means the reference on screen is the one the admin will see.
    const payment = await startPayment(business.id, plan.id)
    return { plan, settings, history, payment }
  }, [business.id, planId])
  const { data, loading, error } = useLoad(load)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [txnRef, setTxnRef] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'uploading' | 'submitting' | null>(null)
  const [done, setDone] = useState<SubscriptionPayment | null>(null)

  if (!planId) return <Navigate to="/dashboard/billing" replace />

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const problem = validateProof(f)
    if (problem) {
      setFormError(problem)
      e.target.value = ''
      return
    }
    setFormError(null)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!data) return
    if (!file) {
      setFormError('Upload your proof of payment.')
      return
    }
    const form = new FormData(e.currentTarget)
    setFormError(null)
    setBusy('uploading')
    try {
      const path = await uploadProof(business.id, data.payment.id, file)
      setBusy('submitting')
      const saved = await submitPayment({
        paymentId: data.payment.id,
        transactionRef: txnRef,
        paymentDate: String(form.get('payment_date') ?? ''),
        proofPath: path,
        notes: String(form.get('notes') ?? '').trim() || null,
      })
      setDone(saved)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit your payment. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  if (loading)
    return (
      <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
        <PageHeaderSkeleton />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${panel} space-y-3`}>
            <Bone className="h-4 w-32" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    )

  if (error || !data)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/dashboard/billing" className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          <ArrowLeft size={15} strokeWidth={1.75} /> Back to billing
        </Link>
        <div className={`${panel} flex items-start gap-3 text-sm text-neutral-700`}>
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-500" />
          {error ?? 'Something went wrong.'}
        </div>
      </div>
    )

  const { plan, settings, history, payment } = data
  const amount = fmtMoney(payment.amount_cents, payment.currency)
  const duplicate = findPossibleDuplicate(history, txnRef)

  if (done)
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-[env(safe-area-inset-bottom)]">
        <section className={`${panel} text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 size={24} strokeWidth={1.75} />
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">Payment submitted successfully</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-600">
            We&apos;ll verify your transfer and activate your {plan.name} plan. You&apos;ll get a notification as soon as
            it&apos;s done — usually within one business day.
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Reference</span>
            <span className="font-mono text-sm font-semibold text-neutral-900">{done.payment_reference}</span>
            <CopyButton value={done.payment_reference} label="payment reference" />
          </p>
          <button type="button" onClick={() => navigate('/dashboard/billing')} className={`${btnPrimary} mt-5 h-11 w-full sm:w-auto`}>
            Back to billing
          </button>
        </section>
      </div>
    )

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-[env(safe-area-inset-bottom)] sm:space-y-5">
      <div className="min-w-0">
        <Link
          to="/dashboard/billing"
          className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <ArrowLeft size={15} strokeWidth={1.75} /> Back to billing
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Complete your payment</h1>
        <p className="mt-1 text-sm text-neutral-500">Pay from your banking app, then send us the receipt to verify.</p>
      </div>

      {/* Step 1 — what is being bought */}
      <section className={`${panel} space-y-3`}>
        <StepHeading step={1} title="Your plan" icon={<Building2 size={15} strokeWidth={1.75} className="text-neutral-400" />} />
        <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">{plan.name}</p>
            <p className="text-xs text-neutral-500">Billed every {payment.billing_interval === 'year' ? 'year' : 'month'}</p>
          </div>
          <p className="text-xl font-bold tracking-tight text-neutral-900">{amount}</p>
        </div>
      </section>

      {/* Step 2 — payment method */}
      <section className={`${panel} space-y-3`}>
        <StepHeading step={2} title="Payment method" icon={<Landmark size={15} strokeWidth={1.75} className="text-neutral-400" />} />
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-brand-600 bg-brand-50/40 px-3.5 py-3">
          <input type="radio" name="method" checked readOnly className="h-4 w-4 accent-brand-600" aria-label="GoTyme Bank / QR Ph" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">{settings.bank_name} / QR Ph</span>
            <span className="block text-xs text-neutral-500">Bank transfer or QR Ph scan, verified by our team</span>
          </span>
          <QrCode size={20} strokeWidth={1.5} className="shrink-0 text-brand-600" />
        </label>
      </section>

      {/* Step 3 — how to pay */}
      <section className={`${panel} space-y-3`}>
        <StepHeading step={3} title="Pay this amount" icon={<QrCode size={15} strokeWidth={1.75} className="text-neutral-400" />} />

        {settings.qr_image_url && (
          <div className="flex justify-center">
            <img
              src={settings.qr_image_url}
              alt={`${settings.bank_name} QR Ph code`}
              className="h-56 w-56 rounded-xl border border-neutral-200 bg-white object-contain p-2 sm:h-64 sm:w-64"
            />
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 px-3.5 py-1">
          <DetailRow label="Bank" value={settings.bank_name} />
          {settings.account_name && <DetailRow label="Account name" value={settings.account_name} />}
          {settings.account_number && <DetailRow label="Account number" value={settings.account_number} mono />}
          <DetailRow label="Amount" value={amount} />
          <DetailRow label="Reference" value={payment.payment_reference} mono />
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-800">
          <Info size={15} strokeWidth={1.75} className="mt-px shrink-0" />
          <p>
            Put your payment reference <span className="font-mono font-semibold">{payment.payment_reference}</span> in the
            notes or message field of the transfer when your app allows it. It helps us match your payment faster.
          </p>
        </div>

        {settings.instructions && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">{settings.instructions}</p>
        )}
      </section>

      {/* Step 4 — proof */}
      <form onSubmit={submit} className={`${panel} space-y-4`} noValidate>
        <StepHeading step={4} title="Confirm your payment" icon={<ImageUp size={15} strokeWidth={1.75} className="text-neutral-400" />} />

        <Field label="Reference number from your receipt" hint="The transaction or reference number your bank shows after the transfer.">
          <input
            name="transaction_ref"
            value={txnRef}
            onChange={(e) => setTxnRef(e.target.value)}
            required
            minLength={4}
            maxLength={64}
            autoComplete="off"
            placeholder="e.g. 0123456789"
            className={input}
          />
        </Field>

        {duplicate && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            You already submitted this reference number on payment {duplicate.payment_reference}. Check your history before
            submitting again.
          </p>
        )}

        <Field label="Payment date">
          <input
            type="date"
            name="payment_date"
            required
            defaultValue={todayIn(timezone)}
            max={todayIn(timezone)}
            className={input}
          />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Proof of payment</span>
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              <img src={preview} alt="Receipt preview" className="max-h-72 w-full object-contain" />
              <button
                type="button"
                onClick={clearFile}
                aria-label="Remove receipt"
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-neutral-600 shadow-sm outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-7 text-center transition-colors hover:border-brand-600 hover:bg-brand-50/40">
              <ImageUp size={22} strokeWidth={1.5} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-700">Upload your receipt</span>
              <span className="text-xs text-neutral-500">JPG, PNG or WebP · up to 5MB</span>
              <input type="file" accept={PROOF_ACCEPT} onChange={pickFile} className="sr-only" />
            </label>
          )}
          {file && <p className="mt-1.5 truncate text-xs text-neutral-500">{file.name}</p>}
        </div>

        <Field label="Notes (optional)">
          <textarea name="notes" rows={3} maxLength={500} placeholder="Anything we should know about this payment" className={input} />
        </Field>

        <ErrorText message={formError} />

        <button type="submit" disabled={busy !== null} className={`${btnPrimary} h-12 w-full sm:h-11`}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy === 'uploading' ? 'Uploading receipt…' : busy === 'submitting' ? 'Submitting…' : 'Submit payment'}
        </button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-500">
          <ShieldCheck size={14} strokeWidth={1.75} className="mt-px shrink-0 text-neutral-400" />
          Your subscription activates once our team verifies the transfer. Submitting a receipt does not activate it on its
          own.
        </p>
      </form>
    </div>
  )
}
