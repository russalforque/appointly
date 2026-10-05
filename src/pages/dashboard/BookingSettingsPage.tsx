import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { BellRing, CircleCheckBig, Hourglass, Loader2, Sparkles, Timer, XCircle, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap, friendlyError } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { useToast } from '../../lib/toast'
import { useConfirm } from '../../lib/confirm'
import { panel } from '../../lib/ui'
import type { BusinessSettings } from '../../lib/types'
import Switch from '../../components/Switch'
import { PlanBadge, UpgradeBanner } from '../../components/UpgradeNotice'
import SettingsHeader from '../../components/SettingsHeader'
import { ErrorState, FormSkeleton, PageHeaderSkeleton } from '../../components/Status'
import { useBusiness } from './useBusiness'

const NOTICE_HOURS = [1, 2, 4, 12, 24]
const ADVANCE_DAYS = [7, 14, 30, 60, 90]
const BUFFER_MINUTES = [0, 5, 10, 15, 30]
const DEADLINE_HOURS = [1, 2, 4, 12, 24]
const REMINDER_HOURS = [2, 12, 24, 48]

/**
 * The column defaults from the schema. A plan without advanced booking rules runs on these, and
 * the database lets any business put a rule back to its default — never to a custom value.
 */
const ADVANCED_DEFAULTS = { notice: 2, advance: 60, buffer: 0, deadline: 2, allowCancel: true } as const

type Values = {
  notice: number
  advance: number
  buffer: number
  deadline: number
  allowCancel: boolean
  autoConfirm: boolean
  remindersOn: boolean
  reminderHours: number
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
  disabled = false,
}: {
  legend: string
  hint: string
  options: number[]
  value: number
  format: (n: number) => string
  onChange: (n: number) => void
  /** Locked by the plan: the current value stays readable, the others can't be picked. */
  disabled?: boolean
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
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`h-11 min-w-16 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed sm:h-10 ${
              value === n
                ? disabled
                  ? 'border-neutral-300 bg-neutral-100 text-neutral-700'
                  : 'border-brand-600 bg-brand-50 text-brand-700'
                : disabled
                  ? 'border-neutral-100 text-neutral-300'
                  : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {format(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

function SectionHeading({ icon: Icon, tint, children, locked }: { icon: typeof Timer; tint: string; children: string; locked?: boolean }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
      <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${tint}`}>
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {locked && <PlanBadge />}
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
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
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
      remindersOn: s.reminders_enabled,
      reminderHours: s.reminder_hours,
    }
    setValues(snapshot)
    setInitial(snapshot)
  }, [s])

  const isDirty = !!values && !!initial && JSON.stringify(values) !== JSON.stringify(initial)
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => (v ? { ...v, [key]: value } : v))

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values || busy) return
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('business_settings')
      .update({
        auto_confirm: values.autoConfirm,
        // Business-plan columns: only sent when the plan includes them. The database refuses
        // them otherwise, so this is a courtesy, not the rule.
        ...(can.advancedBooking
          ? {
              min_notice_hours: values.notice,
              max_advance_days: values.advance,
              buffer_minutes: values.buffer,
              allow_customer_cancellation: values.allowCancel,
              cancellation_deadline_hours: values.deadline,
            }
          : {}),
        ...(can.reminders ? { reminders_enabled: values.remindersOn, reminder_hours: values.reminderHours } : {}),
      })
      .eq('business_id', business.id)
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else {
      setInitial(values)
      toast('Booking settings saved')
      reload()
    }
  }

  // A business that set custom rules on a trial or on Business keeps them after moving to
  // Starter. It can't edit them any more, but it can always go back to the defaults.
  async function resetToDefaults() {
    if (resetting) return
    const ok = await confirm({
      title: 'Reset booking rules to the defaults?',
      body: `Customers will be able to book from ${hoursLabel(ADVANCED_DEFAULTS.notice)} ahead and up to ${daysLabel(ADVANCED_DEFAULTS.advance)} in advance, with no buffer, and can cancel online until ${hoursLabel(ADVANCED_DEFAULTS.deadline)} before.`,
      confirmLabel: 'Reset rules',
    })
    if (!ok) return
    setResetting(true)
    const { error } = await supabase
      .from('business_settings')
      .update({
        min_notice_hours: ADVANCED_DEFAULTS.notice,
        max_advance_days: ADVANCED_DEFAULTS.advance,
        buffer_minutes: ADVANCED_DEFAULTS.buffer,
        allow_customer_cancellation: ADVANCED_DEFAULTS.allowCancel,
        cancellation_deadline_hours: ADVANCED_DEFAULTS.deadline,
      })
      .eq('business_id', business.id)
    setResetting(false)
    if (error) return setError(friendlyError(error.message))
    const next = values && {
      ...values,
      notice: ADVANCED_DEFAULTS.notice,
      advance: ADVANCED_DEFAULTS.advance,
      buffer: ADVANCED_DEFAULTS.buffer,
      allowCancel: ADVANCED_DEFAULTS.allowCancel,
      deadline: ADVANCED_DEFAULTS.deadline,
    }
    setValues(next)
    setInitial((i) => i && next && { ...i, ...next, autoConfirm: i.autoConfirm })
    toast('Booking rules reset to the defaults')
    reload()
  }

  if (loading || (!values && !loadError))
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeaderSkeleton />
        <FormSkeleton fieldsPerSection={5} />
      </div>
    )
  if (loadError || !s || !values) return <ErrorState message={loadError ?? 'Settings not found.'} onRetry={reload} />

  const locked = !can.advancedBooking
  const custom =
    s.min_notice_hours !== ADVANCED_DEFAULTS.notice ||
    s.max_advance_days !== ADVANCED_DEFAULTS.advance ||
    s.buffer_minutes !== ADVANCED_DEFAULTS.buffer ||
    s.allow_customer_cancellation !== ADVANCED_DEFAULTS.allowCancel ||
    s.cancellation_deadline_hours !== ADVANCED_DEFAULTS.deadline

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsHeader
        title="Booking settings"
        subtitle="Control how customers book, cancel, and get confirmed."
        form="booking-settings-form"
        dirty={isDirty}
        saving={busy}
        error={error}
        onDiscard={() => {
          setValues(initial)
          setError(null)
        }}
      />

      <div className="space-y-4 pt-4 sm:space-y-6 md:pt-6">
        {/* One prompt for the page, not one per section */}
        {locked && (
          <UpgradeBanner
            title="Advanced booking rules are part of Business"
            body={
              custom
                ? 'Your current rules stay in effect. Upgrade to change them, or reset them to the defaults.'
                : 'Set your own notice period, booking window, buffers, cancellation rules and reminders.'
            }
            action={
              custom && (
                <button
                  type="button"
                  onClick={resetToDefaults}
                  disabled={resetting}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-700 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-60 sm:h-9 sm:rounded-lg"
                >
                  {resetting && <Loader2 size={14} className="animate-spin" aria-hidden />}
                  Reset to defaults
                </button>
              )
            }
          />
        )}

        {/* These rules are abstract on their own, so restate them as the sentence a customer would experience */}
        <div className="flex gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
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
              {can.reminders && values.remindersOn && ` They get a reminder email ${hoursLabel(values.reminderHours)} before.`}
            </p>
          </div>
        </div>

        <form id="booking-settings-form" onSubmit={save} className="space-y-4 sm:space-y-6">
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

          <section className={`${panel} space-y-5`}>
            <SectionHeading icon={Timer} tint="bg-indigo-50 text-indigo-600" locked={locked}>
              Timing rules
            </SectionHeading>

            <OptionChips
              legend="Minimum booking notice"
              hint="Customers cannot book sooner than this from now."
              options={optionsFor(NOTICE_HOURS, values.notice)}
              value={values.notice}
              format={hoursLabel}
              onChange={(n) => set('notice', n)}
              disabled={locked}
            />

            <OptionChips
              legend="Maximum advance booking"
              hint="How far ahead customers can book."
              options={optionsFor(ADVANCE_DAYS, values.advance)}
              value={values.advance}
              format={daysLabel}
              onChange={(n) => set('advance', n)}
              disabled={locked}
            />

            <OptionChips
              legend="Buffer between appointments"
              hint="Extra gap added after every appointment, on top of any service-specific buffer."
              options={optionsFor(BUFFER_MINUTES, values.buffer)}
              value={values.buffer}
              format={bufferLabel}
              onChange={(n) => set('buffer', n)}
              disabled={locked}
            />
          </section>

          <section className={`${panel} space-y-4`}>
            <SectionHeading icon={XCircle} tint="bg-amber-50 text-amber-600" locked={locked}>
              Cancellations
            </SectionHeading>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">Allow customer cancellations</p>
                <p className="mt-0.5 text-xs text-neutral-500">Let customers cancel from their confirmation link.</p>
              </div>
              <Switch
                checked={values.allowCancel}
                onChange={() => set('allowCancel', !values.allowCancel)}
                label="Allow customers to cancel their own bookings"
                disabled={locked}
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
                  disabled={locked}
                />
              </div>
            )}
          </section>

          <section className={`${panel} space-y-4`}>
            <SectionHeading icon={BellRing} tint="bg-violet-50 text-violet-600" locked={!can.reminders}>
              Customer reminders
            </SectionHeading>

            {can.reminders ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800">Send reminder emails</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Confirmed customers with an email address get a reminder before their appointment.
                    </p>
                  </div>
                  <Switch
                    checked={values.remindersOn}
                    onChange={() => set('remindersOn', !values.remindersOn)}
                    label="Send reminder emails to customers"
                  />
                </div>
                {values.remindersOn && (
                  <div className="border-l-2 border-neutral-100 pl-4">
                    <OptionChips
                      legend="Send the reminder"
                      hint="Bookings made closer to the appointment than this only get the confirmation email."
                      options={optionsFor(REMINDER_HOURS, values.reminderHours)}
                      value={values.reminderHours}
                      format={(h) => `${hoursLabel(h)} before`}
                      onChange={(n) => set('reminderHours', n)}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                Cut no-shows with an automatic reminder email before every confirmed appointment. Confirmation emails are sent on
                every plan.
              </p>
            )}
          </section>
        </form>
      </div>
    </div>
  )
}
