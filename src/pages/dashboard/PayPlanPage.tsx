import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Hash,
  ImageUp,
  Info,
  Landmark,
  Loader2,
  QrCode,
  ReceiptText,
  ShieldCheck,
  X,
} from 'lucide-react'
import { fetchPlans, fmtMoney } from '../../lib/billing'
import {
  MAX_PROOF_BYTES,
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
import CopyButton from '../../components/CopyButton'
import PaymentStatusPill from '../../components/PaymentStatusPill'
import { Bone, PageHeaderSkeleton } from '../../components/Status'
import { useBusiness } from './useBusiness'
import { LEGAL_UPDATED } from '../legal/LegalLayout'

/** The four stages of a manual GoTyme payment, so nobody expects instant activation. */
const FLOW = ['Payment details', 'Submit payment', 'Admin verification', 'Plan activated'] as const

/** Where the customer is in FLOW: 0 while filling the form, 2 once the receipt is in. */
function FlowSteps({ current }: { current: number }) {
  return (
    <ol className="flex items-start gap-1 sm:gap-2" aria-label="Payment progress">
      {FLOW.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center gap-1">
              <span className={`h-px flex-1 ${i === 0 ? 'bg-transparent' : state === 'todo' ? 'bg-neutral-200' : 'bg-brand-600'}`} />
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-bold ${
                  state === 'done'
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : state === 'current'
                      ? 'border-brand-600 bg-white text-brand-700 ring-2 ring-brand-600/20'
                      : 'border-neutral-200 bg-white text-neutral-400'
                }`}
              >
                {state === 'done' ? <CheckCircle2 size={13} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className={`h-px flex-1 ${i === FLOW.length - 1 ? 'bg-transparent' : 'bg-neutral-200'}`} />
            </div>
            <span
              className={`text-[10px] leading-tight sm:text-[11px] ${
                state === 'todo' ? 'text-neutral-400' : 'font-semibold text-neutral-700'
              }`}
            >
              {label}
              {state === 'current' && <span className="sr-only"> (current step)</span>}
              {state === 'done' && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

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

function SectionHeading({ title, icon, hint }: { title: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          {icon}
        </span>
        {title}
      </h2>
      {hint && <p className="mt-1.5 text-sm text-neutral-500">{hint}</p>}
    </div>
  )
}

/** A readable download name, e.g. 'appointly-gotyme-bank-qr.png'. Keeps the image's own extension. */
function qrFileName(bankName: string, url: string): string {
  const slug = bankName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'qr-ph'
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  return `appointly-${slug}-qr.${['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png'}`
}

/**
 * Saves the QR image to the customer's device so they can pay from their banking app on the same
 * phone. The image is fetched as a blob because `download` is ignored on cross-origin hrefs; if
 * that is blocked we fall back to opening it, where a long-press or right-click still saves it.
 */
function SaveQrButton({ url, fileName }: { url: string; fileName: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'opened'>('idle')

  useEffect(() => {
    if (state !== 'saved') return
    const id = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(id)
  }, [state])

  async function save() {
    setState('saving')
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
      setState('saved')
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
      setState('opened')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={save}
        disabled={state === 'saving'}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-600 outline-none transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-60"
      >
        {state === 'saving' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : state === 'saved' ? (
          <Check size={14} strokeWidth={2} className="text-green-600" />
        ) : (
          <Download size={14} strokeWidth={1.75} />
        )}
        {state === 'saved' ? 'Saved to your device' : state === 'saving' ? 'Saving…' : 'Save QR image'}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === 'saved' ? 'QR image saved to your device' : ''}
      </span>
      {state === 'opened' && (
        <p className="mt-2 text-xs text-neutral-500">
          The QR opened in a new tab — long-press or right-click it to save the image.
        </p>
      )}
    </>
  )
}

/** Inline, field-level error. Referenced by the input's aria-describedby. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600">
      <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" />
      {message}
    </p>
  )
}

const fmtBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`

type FormErrors = { txnRef?: string; date?: string; file?: string; terms?: string; form?: string }

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
  const [paymentDate, setPaymentDate] = useState(() => todayIn(timezone))
  const [errors, setErrors] = useState<FormErrors>({})
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState<'uploading' | 'submitting' | null>(null)
  const [done, setDone] = useState<SubscriptionPayment | null>(null)

  const txnRefInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  if (!planId) return <Navigate to="/dashboard/billing" replace />

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const problem = validateProof(f)
    if (problem) {
      setErrors((prev) => ({ ...prev, file: problem }))
      e.target.value = ''
      return
    }
    setErrors((prev) => ({ ...prev, file: undefined, form: undefined }))
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
    setFile(f)
  }

  function clearFile() {
    setFile(null)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    if (fileInput.current) fileInput.current.value = ''
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!data || busy) return

    // Catch what we can before the upload, and point at the field that needs fixing.
    const next: FormErrors = {}
    if (txnRef.trim().length < 4) next.txnRef = 'Enter the reference number shown on your bank receipt.'
    if (!paymentDate) next.date = 'Choose the date you sent the transfer.'
    if (!file) next.file = 'Upload a screenshot or photo of your receipt.'
    if (!agreed) next.terms = 'Please accept the subscription terms to continue.'
    setErrors(next)
    if (next.txnRef) {
      txnRefInput.current?.focus()
      return
    }
    if (next.date || next.file || next.terms || !file) return

    const notes = String(new FormData(e.currentTarget).get('notes') ?? '').trim() || null
    setBusy('uploading')
    try {
      const path = await uploadProof(business.id, data.payment.id, file)
      setBusy('submitting')
      const saved = await submitPayment({
        paymentId: data.payment.id,
        transactionRef: txnRef,
        paymentDate,
        proofPath: path,
        notes,
        termsAccepted: agreed,
        termsVersion: LEGAL_UPDATED,
      })
      setDone(saved)
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Could not submit your payment. Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  const backLink = (
    <Link
      to="/dashboard/billing"
      className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <ArrowLeft size={15} strokeWidth={1.75} /> Back to billing
    </Link>
  )

  if (loading)
    return (
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5" aria-busy="true" aria-label="Loading payment details">
        <PageHeaderSkeleton />
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className={`${panel} space-y-3`}>
              <Bone className="h-4 w-32" />
              <Bone className="h-3 w-full" />
              <Bone className="h-3 w-2/3" />
              <Bone className="h-24 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <div className={`${panel} space-y-3`}>
          <Bone className="h-4 w-40" />
          <Bone className="h-10 w-full rounded-lg" />
          <Bone className="h-10 w-full rounded-lg" />
        </div>
      </div>
    )

  if (error || !data)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {backLink}
        <div className={`${panel} flex items-start gap-3 text-sm text-neutral-700`} role="alert">
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-500" />
          {error ?? 'Something went wrong.'}
        </div>
      </div>
    )

  const { plan, settings, history, payment } = data
  const amount = fmtMoney(payment.amount_cents, payment.currency)
  const period = payment.billing_interval === 'year' ? 'Yearly' : 'Monthly'
  const duplicate = findPossibleDuplicate(history, txnRef)
  const awaiting = history.find((p) => p.status === 'pending') ?? null

  if (done)
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-[env(safe-area-inset-bottom)]">
        <section className={panel} aria-live="polite">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CheckCircle2 size={24} strokeWidth={1.75} />
            </span>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">Payment submitted</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-600">
              We&apos;ll check your transfer and activate your {plan.name} plan. You&apos;ll get a notification as soon as
              it&apos;s done — usually within one business day.
            </p>
            <p className="mt-3 flex justify-center">
              <PaymentStatusPill status={done.status} />
            </p>
          </div>

          <dl className="mt-5 rounded-xl border border-neutral-200 px-3.5 py-1">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2.5">
              <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">Appointly reference</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-sm font-semibold text-neutral-900">{done.payment_reference}</span>
                <CopyButton value={done.payment_reference} label="payment reference" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2.5">
              <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">Plan</dt>
              <dd className="truncate text-sm font-semibold text-neutral-900">
                {plan.name} · {period}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-500">Amount</dt>
              <dd className="text-sm font-semibold text-neutral-900">{amount}</dd>
            </div>
          </dl>

          <div className="mt-5">
            <FlowSteps current={2} />
          </div>

          <button type="button" onClick={() => navigate('/dashboard/billing')} className={`${btnPrimary} mt-5 h-12 w-full sm:h-11`}>
            Back to billing
          </button>
        </section>
      </div>
    )

  // Arriving here with a receipt still under review: show its status rather than invite a second one.
  if (awaiting)
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-[env(safe-area-inset-bottom)]">
        {backLink}
        <section className={panel}>
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Clock3 size={24} strokeWidth={1.75} />
            </span>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">A payment is already being verified</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-600">
              You have a payment our team is still reviewing. Please wait for the result before sending another one.
            </p>
            <p className="mt-3 flex justify-center">
              <PaymentStatusPill status={awaiting.status} />
            </p>
            <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Appointly reference</span>
              <span className="font-mono text-sm font-semibold text-neutral-900">{awaiting.payment_reference}</span>
              <CopyButton value={awaiting.payment_reference} label="payment reference" />
            </p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/billing')} className={`${btnPrimary} mt-5 h-12 w-full sm:h-11`}>
            Go to billing
          </button>
        </section>
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-[env(safe-area-inset-bottom)] sm:space-y-5">
      <header className="min-w-0">
        {backLink}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Complete your payment</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Pay with {settings.bank_name} or QR Ph from your banking app, then upload the receipt. Your subscription is
          activated after our team verifies the transfer.
        </p>
      </header>

      <div className={`${panel} py-4!`}>
        <FlowSteps current={0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-5">
        {/* What you are paying for, and how */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:space-y-5">
          <section className={`${panel} space-y-3`} aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                <ReceiptText size={15} strokeWidth={1.75} />
              </span>
              Order summary
            </h2>

            <dl className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <dt className="sr-only">Plan</dt>
                  <dd className="truncate text-sm font-semibold text-neutral-900">{plan.name}</dd>
                  <dt className="sr-only">Billing period</dt>
                  <dd className="mt-0.5 text-xs text-neutral-500">{period} · one billing period, prepaid</dd>
                </div>
                <dd className="shrink-0 text-sm font-medium text-neutral-700">{amount}</dd>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3 border-t border-neutral-200 pt-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Amount due</dt>
                <dd className="text-[26px] font-bold leading-none tracking-tight text-neutral-900 sm:text-3xl">{amount}</dd>
              </div>
            </dl>

            <p className="text-xs leading-relaxed text-neutral-500">
              Send this exact amount. The plan does not renew automatically — you choose when to pay again.
            </p>
          </section>

          <section className={`${panel} space-y-3`} aria-labelledby="method-heading">
            <h2 id="method-heading" className="flex items-center gap-2 text-[15px] font-semibold text-neutral-900">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                <Landmark size={15} strokeWidth={1.75} />
              </span>
              Payment method
            </h2>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-brand-600 bg-brand-50/40 px-3.5 py-3">
              <input
                type="radio"
                name="method"
                checked
                readOnly
                className="h-4 w-4 accent-brand-600"
                aria-label={`${settings.bank_name} / QR Ph`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900">{settings.bank_name} / QR Ph</span>
                <span className="block text-xs text-neutral-500">Bank transfer or QR Ph scan, verified by our team</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                <CheckCircle2 size={11} strokeWidth={2.5} /> Selected
              </span>
            </label>
          </section>
        </div>

        {/* Where and how to send the money */}
        <section className={`${panel} space-y-4`} aria-labelledby="pay-heading">
          <div id="pay-heading">
            <SectionHeading
              title="How to pay"
              icon={<QrCode size={15} strokeWidth={1.75} />}
              hint="Four steps, from your banking app back to this page."
            />
          </div>

          <ol className="space-y-1.5 text-sm text-neutral-700">
            <li className="flex items-start gap-2.5">
              <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-600">
                1
              </span>
              <span className="min-w-0 leading-relaxed">
                Send exactly <span className="font-semibold text-neutral-900">{amount}</span>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-600">
                2
              </span>
              <span className="min-w-0 leading-relaxed">Scan the QR code, or transfer using the account details below</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-600">
                3
              </span>
              <span className="min-w-0 leading-relaxed">Add your Appointly reference to the transfer note if your app allows it</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-600">
                4
              </span>
              <span className="min-w-0 leading-relaxed">Upload your receipt in the form below</span>
            </li>
          </ol>

          {settings.qr_image_url && (
            <figure className="rounded-xl border border-neutral-200 bg-white p-4 text-center">
              <figcaption className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Scan to pay</figcaption>
              <img
                src={settings.qr_image_url}
                alt={`${settings.bank_name} QR Ph code`}
                className="mx-auto mt-3 h-56 w-56 max-w-full object-contain xs:h-60 xs:w-60 sm:h-64 sm:w-64"
              />
              <p className="mt-3 text-xs text-neutral-500">
                Open your banking app, choose Scan QR, then confirm {amount}. Paying on this phone? Save the QR and pick
                it from your gallery in the scanner.
              </p>
              <div className="mt-3">
                <SaveQrButton url={settings.qr_image_url} fileName={qrFileName(settings.bank_name, settings.qr_image_url)} />
              </div>
            </figure>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Or transfer to</h3>
            <div className="mt-2 rounded-xl border border-neutral-200 px-3.5 py-1">
              <DetailRow label="Bank" value={settings.bank_name} />
              {settings.account_name && <DetailRow label="Account name" value={settings.account_name} />}
              {settings.account_number && <DetailRow label="Account number" value={settings.account_number} mono />}
              <DetailRow label="Amount" value={amount} />
            </div>
          </div>

          {/* Kept visually apart from the bank details — this reference is ours, not the bank's. */}
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-3.5 py-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-800">
              <Hash size={13} strokeWidth={2} />
              Appointly payment reference
            </h3>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold tracking-tight text-neutral-900">{payment.payment_reference}</span>
              <CopyButton value={payment.payment_reference} label="Appointly payment reference" />
            </p>
            <p className="mt-2 text-xs leading-relaxed text-brand-900/80">
              Include this in your transfer note when possible — it helps us match your payment faster. It is not the same
              as the reference number your bank gives you afterwards.
            </p>
          </div>

          {settings.instructions && (
            <div className="flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
              <Info size={15} strokeWidth={1.75} className="mt-px shrink-0 text-neutral-400" />
              <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-600">{settings.instructions}</p>
            </div>
          )}
        </section>
      </div>

      {/* Confirming the transfer */}
      <form onSubmit={submit} className={`${panel} space-y-5`} noValidate>
        <SectionHeading
          title="Confirm your payment"
          icon={<ImageUp size={15} strokeWidth={1.75} />}
          hint="Tell us what your bank showed after the transfer so we can match it."
        />

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          <div>
            <label htmlFor="transaction_ref" className="block text-sm font-medium text-slate-700">
              Bank transaction reference <span className="text-red-600">*</span>
            </label>
            <input
              id="transaction_ref"
              ref={txnRefInput}
              name="transaction_ref"
              value={txnRef}
              onChange={(e) => {
                setTxnRef(e.target.value)
                if (errors.txnRef) setErrors((prev) => ({ ...prev, txnRef: undefined }))
              }}
              minLength={4}
              maxLength={64}
              autoComplete="off"
              placeholder="e.g. 0123456789"
              aria-required="true"
              aria-invalid={errors.txnRef ? true : undefined}
              aria-describedby={`transaction_ref-hint${errors.txnRef ? ' transaction_ref-error' : ''}`}
              className={`mt-1 ${input} ${errors.txnRef ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
            />
            <p id="transaction_ref-hint" className="mt-1 text-xs text-neutral-500">
              The number your bank shows on the receipt — not the Appointly reference above.
            </p>
            <FieldError id="transaction_ref-error" message={errors.txnRef} />
          </div>

          <div>
            <label htmlFor="payment_date" className="block text-sm font-medium text-slate-700">
              Payment date <span className="text-red-600">*</span>
            </label>
            <input
              id="payment_date"
              type="date"
              name="payment_date"
              value={paymentDate}
              onChange={(e) => {
                setPaymentDate(e.target.value)
                if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }))
              }}
              max={todayIn(timezone)}
              aria-required="true"
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={`payment_date-hint${errors.date ? ' payment_date-error' : ''}`}
              className={`mt-1 ${input} ${errors.date ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
            />
            <p id="payment_date-hint" className="mt-1 text-xs text-neutral-500">
              The day you sent the transfer.
            </p>
            <FieldError id="payment_date-error" message={errors.date} />
          </div>
        </div>

        {duplicate && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            You already submitted this reference number on payment {duplicate.payment_reference}. Check your history before
            submitting again.
          </p>
        )}

        <div>
          <span className="block text-sm font-medium text-slate-700">
            Proof of payment <span className="text-red-600">*</span>
          </span>
          <p className="mt-1 text-xs text-neutral-500">A screenshot or photo of the transfer confirmation.</p>

          <input
            id="proof"
            ref={fileInput}
            type="file"
            accept={PROOF_ACCEPT}
            onChange={pickFile}
            aria-invalid={errors.file ? true : undefined}
            aria-describedby={`proof-hint${errors.file ? ' proof-error' : ''}`}
            className="peer sr-only"
          />

          {preview && file ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              <div className="relative">
                <img src={preview} alt={`Receipt preview: ${file.name}`} className="max-h-72 w-full object-contain" />
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove receipt"
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-neutral-600 shadow-sm outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-white px-3 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-600">
                  <CheckCircle2 size={14} strokeWidth={2} className="shrink-0 text-green-600" />
                  <span className="truncate font-medium text-neutral-800">{file.name}</span>
                  <span className="shrink-0 text-neutral-400">{fmtBytes(file.size)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <label
                    htmlFor="proof"
                    className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600"
                  >
                    Change
                  </label>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-neutral-500 outline-none transition-colors hover:text-red-600 focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    Remove
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <label
              htmlFor="proof"
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors hover:border-brand-600 hover:bg-brand-50/40 peer-focus-visible:border-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 ${
                errors.file ? 'border-red-300 bg-red-50/40' : 'border-neutral-300 bg-neutral-50'
              }`}
            >
              <ImageUp size={22} strokeWidth={1.5} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-700">Upload your receipt</span>
              <span id="proof-hint" className="text-xs text-neutral-500">
                JPG, PNG or WebP · up to {Math.round(MAX_PROOF_BYTES / 1024 / 1024)}MB
              </span>
            </label>
          )}
          <FieldError id="proof-error" message={errors.file} />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
            Notes <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="Anything we should know about this payment"
            className={`mt-1 ${input}`}
          />
        </div>

        {/* The terms of the purchase itself: prepaid period, manual verification, no auto-renewal. */}
        <div>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border bg-neutral-50 px-3.5 py-3 ${
              errors.terms ? 'border-red-300' : 'border-neutral-200'
            }`}
          >
            <input
              type="checkbox"
              name="accept_subscription_terms"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked)
                if (errors.terms) setErrors((prev) => ({ ...prev, terms: undefined }))
              }}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? 'terms-error' : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            <span className="text-xs leading-relaxed text-neutral-600">
              I understand this {payment.billing_interval === 'year' ? 'yearly' : 'monthly'} {plan.name} plan is prepaid
              for one billing period, activates only after our team verifies my transfer, does not renew automatically,
              and is non-refundable once activated. I agree to the{' '}
              <Link to="/terms#subscription" target="_blank" className="font-medium text-brand-600 hover:text-brand-700">
                subscription terms
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" target="_blank" className="font-medium text-brand-600 hover:text-brand-700">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <FieldError id="terms-error" message={errors.terms} />
        </div>

        {errors.form && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
          >
            <AlertTriangle size={16} strokeWidth={1.75} className="mt-px shrink-0" />
            {errors.form}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <button type="submit" disabled={busy !== null} className={`${btnPrimary} h-12 w-full sm:h-11 sm:w-auto sm:px-6`}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy === 'uploading' ? 'Uploading receipt…' : busy === 'submitting' ? 'Submitting…' : 'Submit payment'}
          </button>
          <p aria-live="polite" className="text-xs leading-relaxed text-neutral-500 sm:max-w-sm">
            {busy === 'uploading'
              ? 'Uploading your receipt — please keep this page open.'
              : busy === 'submitting'
                ? 'Sending your payment for verification…'
                : 'Submitting sends your receipt for review. It does not activate your plan on its own.'}
          </p>
        </div>
      </form>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-100/60 px-4 py-3.5 text-xs leading-relaxed text-neutral-500 sm:flex-row sm:gap-6">
        <p className="flex items-start gap-2">
          <ShieldCheck size={15} strokeWidth={1.75} className="mt-px shrink-0 text-neutral-400" />
          Every payment is checked by hand — we never see your banking credentials.
        </p>
        <p className="flex items-start gap-2">
          <Clock3 size={15} strokeWidth={1.75} className="mt-px shrink-0 text-neutral-400" />
          Verification usually finishes within one business day, and we notify you either way.
        </p>
      </div>
    </div>
  )
}
