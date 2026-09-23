import { useCallback, useState, type FormEvent } from 'react'
import { ImageUp, Loader2, QrCode, X } from 'lucide-react'
import { PROOF_ACCEPT, fetchPaymentSettings, savePaymentSettings, uploadQrImage, validateProof } from '../../lib/payments'
import { useLoad } from '../../lib/useLoad'
import { btnPrimary, input, panel } from '../../lib/ui'
import type { PaymentSettings } from '../../lib/types'
import Field from '../../components/Field'
import Switch from '../../components/Switch'
import { ErrorText, FormSkeleton, Saved } from '../../components/Status'

function SettingsForm({ settings, onSaved }: { settings: PaymentSettings; onSaved: () => void }) {
  const [active, setActive] = useState(settings.is_active)
  const [qrUrl, setQrUrl] = useState<string | null>(settings.qr_image_url)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function pickQr(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const problem = validateProof(f)
    if (problem) {
      setFormError(problem)
      e.target.value = ''
      return
    }
    setFormError(null)
    setQrFile(f)
    setQrPreview(URL.createObjectURL(f))
  }

  function clearQr() {
    setQrFile(null)
    setQrPreview(null)
    setQrUrl(null)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setSaving(true)
    setFormError(null)
    try {
      const url = qrFile ? await uploadQrImage(qrFile) : qrUrl
      await savePaymentSettings({
        accountName: String(f.get('account_name') ?? ''),
        accountNumber: String(f.get('account_number') ?? ''),
        qrImageUrl: url,
        instructions: String(f.get('instructions') ?? ''),
        isActive: active,
      })
      setQrUrl(url)
      setQrFile(null)
      setQrPreview(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the payment settings.')
    } finally {
      setSaving(false)
    }
  }

  const shownQr = qrPreview ?? qrUrl

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className={`${panel} space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">Accept GoTyme payments</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              When off, customers cannot start a new payment and see a short notice instead.
            </p>
          </div>
          <Switch checked={active} onChange={() => setActive((v) => !v)} label="Accept GoTyme payments" />
        </div>
      </section>

      <section className={`${panel} space-y-4`}>
        <h2 className="text-[15px] font-semibold text-neutral-900">{settings.bank_name} account</h2>

        <Field label="Account name">
          <input name="account_name" defaultValue={settings.account_name} maxLength={120} className={input} />
        </Field>

        <Field label="Account number">
          <input name="account_number" defaultValue={settings.account_number} maxLength={40} className={input} />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">QR Ph code</span>
          {shownQr ? (
            <div className="relative inline-block">
              <img
                src={shownQr}
                alt="QR Ph code"
                className="h-48 w-48 rounded-xl border border-neutral-200 bg-white object-contain p-2"
              />
              <button
                type="button"
                onClick={clearQr}
                aria-label="Remove QR code"
                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-7 text-center transition-colors hover:border-brand-600 hover:bg-brand-50/40">
              <ImageUp size={22} strokeWidth={1.5} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-700">Upload the QR code image</span>
              <span className="text-xs text-neutral-500">JPG, PNG or WebP · up to 5MB</span>
              <input type="file" accept={PROOF_ACCEPT} onChange={pickQr} className="sr-only" />
            </label>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <QrCode size={13} strokeWidth={1.75} />
            Upload a clear, square image so it stays easy to scan on a phone.
          </p>
        </div>

        <Field label="Payment instructions" hint="Shown as-is under the payment details. One step per line.">
          <textarea name="instructions" defaultValue={settings.instructions} rows={6} maxLength={1200} className={input} />
        </Field>
      </section>

      <ErrorText message={formError} />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={`${btnPrimary} h-11`}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          Save settings
        </button>
        <Saved show={saved} />
      </div>
    </form>
  )
}

/** GoTyme account details shown to every paying customer. Editable without a deploy. */
export default function AdminPaymentSettingsPage() {
  const load = useCallback(() => fetchPaymentSettings(), [])
  const { data, loading, error, reload } = useLoad(load)

  if (loading) return <FormSkeleton sections={2} fieldsPerSection={3} />
  if (error || !data) return <ErrorText message={error ?? 'Payment settings are missing.'} />

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Payment settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The GoTyme Bank details customers see when they pay for a subscription.
        </p>
      </div>

      <SettingsForm settings={data} onSaved={reload} />
    </div>
  )
}
