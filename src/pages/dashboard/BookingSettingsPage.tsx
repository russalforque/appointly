import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, CircleCheckBig, Hourglass, Loader2, RotateCcw, Save, Sparkles, Timer, XCircle, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap, friendlyError } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { btn, btnGhost, panel } from '../../lib/ui'
import type { BusinessSettings } from '../../lib/types'
import Switch from '../../components/Switch'
import UpgradeNotice from '../../components/UpgradeNotice'
import { ErrorText, FormSkeleton, PageHeaderSkeleton, Saved } from '../../components/Status'
import { useBusiness } from './useBusiness'

const NOTICE_HOURS = [1, 2, 4, 12, 24]
const ADVANCE_DAYS = [7, 14, 30, 60, 90]
const BUFFER_MINUTES = [0, 5, 10, 15, 30]
const DEADLINE_HOURS = [1, 2, 4, 12, 24]

type Values = {
  notice: number
  advance: number
  buffer: number
  deadline: number
  allowCancel: boolean
  autoConfirm: boolean
}

const hoursLabel = (h: number) => (h % 24 === 0 && h >= 24 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hr${h === 1 ? '' : 's'}`)
const daysLabel = (d: number) => (d % 7 === 0 && d <= 28 ? `${d / 7} week${d === 7 ? '' : 's'}` : `${d} days`)
const bufferLabel = (m: number) => (m === 0 ? 'None' : `${m} min`)

/** Presets plus whatever is already stored, so a custom value is never silently dropped. */
const optionsFor = (presets: number[], current: number) => [...new Set([...presets, current])].sort((a, b) => a - b)

/**
 * Segmented choice, used instead of a <select> for these short preset lists: every
 * option is visible and one tap wide, rather than hidden behind a native picker.
 */
function OptionChips({
  legend,
  hint,
  options,
  value,
  format,
  onChange,
}: {
  legend: string
  hint: string
  options: number[]
  value: number
  format: (n: number) => string
  onChange: (n: number) => void
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-slate-700">{legend}</span>
      <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={legend}>
        {options.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`h-11 min-w-16 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-10 ${
              value === n ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {format(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionHeading({ icon: Icon, tint, children }: { icon: typeof Timer; tint: string; children: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
      <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${tint}`}>
        <Icon size={14} strokeWidth={2} />
      </span>
      {children}
    </h2>
  )
}

export default function BookingSettingsPage() {
  const { business, can } = useBusiness()
  const load = useCallback(
    () => unwrap<BusinessSettings>(supabase.from('business_settings').select('*').eq('business_id', business.id).single()),
    [business.id],
  )
  const { data: s, loading, error: loadError, reload } = useLoad(load)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<Values | null>(null)
  const [initial, setInitial] = useState<Values | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!s || initialized.current) return
    initialized.current = true
    const snapshot: Values = {
      notice: s.min_notice_hours,
      advance: s.max_advance_days,
      buffer: s.buffer_minutes,
      deadline: s.cancellation_deadline_hours,
      allowCancel: s.allow_customer_cancellation,
      autoConfirm: s.auto_confirm,
    }
    setValues(snapshot)
    setInitial(snapshot)
  }, [s])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(timer)
  }, [saved])

  const isDirty = !!values && !!initial && JSON.stringify(values) !== JSON.stringify(initial)
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => (v ? { ...v, [key]: value } : v))

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values || busy) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('business_settings')
      .update({
        min_notice_hours: values.notice,
        max_advance_days: values.advance,
        auto_confirm: values.autoConfirm,
        // Business-plan columns; sending them without the plan trips the database guard.
        ...(can.advancedBooking
          ? {
              buffer_minutes: values.buffer,
              allow_customer_cancellation: values.allowCancel,
              cancellation_deadline_hours: values.deadline,
            }
          : {}),
      })
      .eq('business_id', business.id)
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else {
      setInitial(values)
      setSaved(true)
      reload()
    }
  }

  if (loading || (!values && !loadError))
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeaderSkeleton />
        <FormSkeleton fieldsPerSection={5} />
      </div>
    )
  if (loadError || !s || !values) return <ErrorText message={loadError ?? 'Settings not found.'} />

  return (
    <div className="mx-auto max-w-2xl">
      {/* Desktop: sticky action bar keeps Save/Discard reachable the whole way down the form */}
      <div className="sticky top-0 z-10 -mx-8 hidden flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 bg-neutral-50/95 px-8 py-4 backdrop-blur md:flex">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">Booking settings</h1>
          <p className="mt-1 text-sm text-neutral-500">Control how customers can book, cancel, and get confirmed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ErrorText message={error} />
          <Saved show={saved} />
          {isDirty && !busy && (
            <button type="button" onClick={() => setValues(initial)} className={`${btnGhost} flex items-center gap-1.5`}>
              <RotateCcw size={14} strokeWidth={1.75} /> Discard
            </button>
          )}
          <button form="booking-settings-form" className={`${btn} flex items-center gap-1.5`} disabled={busy || !isDirty}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Mobile: header scrolls away — actions live in the bottom bar, within thumb reach */}
      <div className="flex items-start justify-between gap-3 pt-1 md:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Booking settings</h1>
          <p className="mt-1 text-sm text-neutral-500">Control how customers book, cancel, and get confirmed.</p>
        </div>
        {isDirty && (
          <span className="mt-1 flex flex-none items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
        )}
      </div>

      <div className="space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:space-y-6 md:pb-6 md:pt-6">
        {/* These rules are abstract on their own, so restate them as the sentence a customer would experience */}
        <div className="flex gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <Sparkles size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-600" />
          <div className="text-sm">
            <p className="font-medium text-neutral-900">What this means for customers</p>
            <p className="mt-1 text-neutral-600">
              They can book from <strong className="font-semibold text-neutral-900">{hoursLabel(values.notice)}</strong> ahead and up to{' '}
              <strong className="font-semibold text-neutral-900">{daysLabel(values.advance)}</strong> in advance.{' '}
              {values.autoConfirm ? 'Bookings are confirmed straight away.' : 'Every booking waits for you to confirm it.'}{' '}
              {values.allowCancel
                ? `They can cancel online until ${hoursLabel(values.deadline)} before the appointment.`
                : 'They cannot cancel online — they have to contact you.'}
              {values.buffer > 0 && ` A ${values.buffer}-minute gap is added after every appointment.`}
            </p>
          </div>
        </div>

        <form id="booking-settings-form" onSubmit={save} className="space-y-4 sm:space-y-6">
          <section className={`${panel} space-y-5`}>
            <SectionHeading icon={Timer} tint="bg-indigo-50 text-indigo-600">
              Timing rules
            </SectionHeading>

            <OptionChips
              legend="Minimum booking notice"
              hint="Customers cannot book sooner than this from now."
              options={optionsFor(NOTICE_HOURS, values.notice)}
              value={values.notice}
              format={hoursLabel}
              onChange={(n) => set('notice', n)}
            />

            <OptionChips
              legend="Maximum advance booking"
              hint="How far ahead customers can book."
              options={optionsFor(ADVANCE_DAYS, values.advance)}
              value={values.advance}
              format={daysLabel}
              onChange={(n) => set('advance', n)}
            />

            {can.advancedBooking ? (
              <OptionChips
                legend="Buffer between appointments"
                hint="Extra gap added after every appointment, on top of any service-specific buffer."
                options={optionsFor(BUFFER_MINUTES, values.buffer)}
                value={values.buffer}
                format={bufferLabel}
                onChange={(n) => set('buffer', n)}
              />
            ) : (
              <UpgradeNotice feature="Buffers between appointments" />
            )}
          </section>

          <section className={`${panel} space-y-4`}>
            <SectionHeading icon={XCircle} tint="bg-amber-50 text-amber-600">
              Cancellations
            </SectionHeading>

            {can.advancedBooking ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800">Allow customer cancellations</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Let customers cancel from their confirmation link.</p>
                  </div>
                  <Switch
                    checked={values.allowCancel}
                    onChange={() => set('allowCancel', !values.allowCancel)}
                    label="Allow customers to cancel their own bookings"
                  />
                </div>

                {/* Indented under the toggle it depends on, and only shown once it applies */}
                {values.allowCancel && (
                  <div className="border-l-2 border-neutral-100 pl-4">
                    <OptionChips
                      legend="Cancellation deadline"
                      hint="Customers can no longer cancel online once this deadline passes."
                      options={optionsFor(DEADLINE_HOURS, values.deadline)}
                      value={values.deadline}
                      format={(h) => `${hoursLabel(h)} before`}
                      onChange={(n) => set('deadline', n)}
                    />
                  </div>
                )}
              </>
            ) : (
              <UpgradeNotice feature="Cancellation rules" />
            )}
          </section>

          <section className={`${panel} space-y-4`}>
            <SectionHeading icon={CircleCheckBig} tint="bg-blue-50 text-blue-600">
              Booking confirmation
            </SectionHeading>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(
                [
                  [true, Zap, 'Auto-confirm', 'Bookings are confirmed immediately.'],
                  [false, Hourglass, 'Pending approval', 'You confirm each booking manually.'],
                ] as const
              ).map(([isAuto, Icon, title, description]) => {
                const selected = values.autoConfirm === isAuto
                return (
                  <label
                    key={title}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      selected ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="confirmation"
                      checked={selected}
                      onChange={() => set('autoConfirm', isAuto)}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
                        selected ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      <Icon size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-neutral-900">{title}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>
                    </span>
                  </label>
                )
              })}
            </div>

            {!values.autoConfirm && (
              <p className="rounded-xl bg-neutral-50 px-3.5 py-3 text-xs text-neutral-500">
                New bookings arrive as <span className="font-medium text-neutral-700">Pending</span> and stay unconfirmed until you approve
                them from the Bookings page.
              </p>
            )}
          </section>
        </form>
      </div>

      {/* Mobile: save bar slides up only when there is something to save */}
      <div
        aria-hidden={!isDirty && !busy}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur transition-transform duration-200 ease-out md:hidden ${
          isDirty || busy ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
      >
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setValues(initial)}
            disabled={busy}
            className={`${btnGhost} flex h-11 flex-none items-center justify-center gap-1.5 px-4 disabled:opacity-50`}
          >
            <RotateCcw size={15} strokeWidth={1.75} /> Discard
          </button>
          <button
            form="booking-settings-form"
            className={`${btn} flex h-11 flex-1 items-center justify-center gap-1.5`}
            disabled={busy || !isDirty}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Mobile: transient confirmation, since the save bar itself slides away on success */}
      {saved && (
        <div role="status" className="fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:hidden">
          <span className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            <Check size={16} strokeWidth={2.5} /> Settings saved
          </span>
        </div>
      )}
    </div>
  )
}
