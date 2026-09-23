import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, CalendarOff, Check, Clock3, Copy, Info, Loader2, Plus, RotateCcw, Save, Wand2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { unwrap, friendlyError } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { btn, btnGhost, input, panel } from '../../lib/ui'
import { fmtClock, fmtDay, fmtDuration, todayIn } from '../../lib/format'
import type { BusinessSettings, WorkingHours } from '../../lib/types'
import Field from '../../components/Field'
import Chip from '../../components/Chip'
import Modal from '../../components/Modal'
import Select from '../../components/Select'
import { ErrorText, FormSkeleton, PageHeaderSkeleton, Saved } from '../../components/Status'
import { useBusiness } from './useBusiness'

const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
] as const

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKEND = ['sat', 'sun']
const TODAY_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]
const INTERVALS = [10, 15, 20, 30, 60]

type DayHours = { open: boolean; start: string; end: string }
type HoursState = Record<string, DayHours>
type Values = { hours: HoursState; timezone: string; interval: number }

/** Minutes between two 'HH:MM' times; zero or negative when the range is inverted. */
function spanMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

/**
 * Open/closed control for one day. Replaces the bare <Switch> here so the tap
 * area clears 44px on touch and the state is spelled out, not only colour-coded.
 */
function DayToggle({ open, label, onChange }: { open: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      aria-label={`${label} open`}
      onClick={onChange}
      className="-mr-1.5 flex h-11 shrink-0 items-center gap-2 rounded-xl px-1.5 outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-10"
    >
      <span className={`hidden text-xs font-medium xs:inline ${open ? 'text-brand-700' : 'text-neutral-400'}`}>
        {open ? 'Open' : 'Closed'}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          open ? 'bg-brand-600' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            open ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

const COPY_PRESETS: [string, readonly string[]][] = [
  ['Weekdays', WEEKDAYS],
  ['Weekend', WEEKEND],
]

/**
 * Body of the "copy one day onto others" sheet. Picking days and committing are
 * two separate steps, so a mis-tap on a phone never silently rewrites the week.
 */
function CopyHoursSheet({
  dayKey,
  label,
  source,
  onApply,
  onClose,
}: {
  dayKey: string
  label: string
  source: DayHours
  onApply: (targets: string[]) => void
  onClose: () => void
}) {
  const others = DAYS.filter(([k]) => k !== dayKey)
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  const preset = (keys: readonly string[]) => setSelected(keys.filter((k) => k !== dayKey))

  return (
    <div>
      <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
        Applying{' '}
        <span className="font-semibold text-neutral-900">
          {source.open ? `${fmtClock(source.start)} – ${fmtClock(source.end)}` : 'Closed all day'}
        </span>{' '}
        from {label} to the days you pick.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[['Every other day', others.map(([k]) => k)] as [string, string[]], ...COPY_PRESETS].map(([text, keys]) => (
          <button
            key={text}
            type="button"
            onClick={() => preset(keys)}
            className="h-9 rounded-full border border-neutral-200 px-3 text-xs font-medium text-neutral-600 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {text}
          </button>
        ))}
      </div>

      <ul className="mt-3 divide-y divide-neutral-100 border-y border-neutral-100">
        {others.map(([k, l]) => {
          const on = selected.includes(k)
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => toggle(k)}
                aria-pressed={on}
                className="flex h-12 w-full items-center justify-between gap-3 px-1 text-left outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <span className={`text-sm ${on ? 'font-medium text-neutral-900' : 'text-neutral-600'}`}>{l}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-neutral-300'
                  }`}
                >
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} className={`${btnGhost} h-11 flex-none px-4`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => {
            onApply(selected)
            onClose()
          }}
          className={`${btn} h-11 flex-1 disabled:cursor-not-allowed`}
        >
          {selected.length === 0 ? 'Select days' : `Apply to ${selected.length} day${selected.length > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

export default function HoursPage() {
  const { business, reload: reloadBusiness } = useBusiness()
  const load = useCallback(
    () => unwrap<BusinessSettings>(supabase.from('business_settings').select('*').eq('business_id', business.id).single()),
    [business.id],
  )
  const { data: s, loading, error: loadError, reload } = useLoad(load)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState<Values | null>(null)
  const [initial, setInitial] = useState<Values | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [copyFor, setCopyFor] = useState<{ key: string; label: string } | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!s || initialized.current) return
    initialized.current = true
    const snapshot: Values = {
      hours: Object.fromEntries(
        DAYS.map(([k]) => {
          const r = s.working_hours[k]?.[0]
          return [k, { open: !!r, start: r?.start.slice(0, 5) ?? '09:00', end: r?.end.slice(0, 5) ?? '18:00' }]
        }),
      ),
      timezone: s.timezone,
      interval: s.slot_interval_minutes,
    }
    setValues(snapshot)
    setInitial(snapshot)
  }, [s])

  // The mobile save bar slides away on success, so confirm the write briefly and then clear.
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(timer)
  }, [saved])

  const isDirty = !!values && !!initial && JSON.stringify(values) !== JSON.stringify(initial)

  const stats = useMemo(() => {
    let openDays = 0
    let minutes = 0
    for (const [k] of DAYS) {
      const d = values?.hours[k]
      if (!d?.open) continue
      openDays++
      minutes += Math.max(0, spanMinutes(d.start, d.end))
    }
    return { openDays, minutes }
  }, [values])

  const timezone = values?.timezone
  const tzNow = useMemo(() => {
    if (!timezone) return null
    try {
      return new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date())
    } catch {
      return null
    }
  }, [timezone])

  function setDay(k: string, patch: Partial<DayHours>) {
    setValues((v) => (v ? { ...v, hours: { ...v.hours, [k]: { ...v.hours[k], ...patch } } } : v))
    setFieldErrors((e) => ({ ...e, [k]: '' }))
  }

  function copyFrom(sourceKey: string, targets: string[]) {
    setValues((v) => {
      if (!v) return v
      const source = v.hours[sourceKey]
      if (!source) return v
      const hours = { ...v.hours }
      for (const k of targets) hours[k] = { ...source }
      return { ...v, hours }
    })
    setFieldErrors((e) => {
      const next = { ...e }
      for (const k of targets) delete next[k]
      return next
    })
  }

  /** One-tap starting points for the common shapes of a week; undoable via Discard. */
  function applyPreset(kind: 'weekdays' | 'everyday' | 'closeWeekend') {
    setValues((v) => {
      if (!v) return v
      const hours: HoursState = Object.fromEntries(
        DAYS.map(([k]) => {
          const cur = v.hours[k]
          if (kind === 'weekdays') return [k, WEEKDAYS.includes(k) ? { open: true, start: '09:00', end: '18:00' } : { ...cur, open: false }]
          if (kind === 'everyday') return [k, { ...cur, open: true }]
          return [k, WEEKEND.includes(k) ? { ...cur, open: false } : cur]
        }),
      )
      return { ...v, hours }
    })
    setFieldErrors({})
  }

  function discard() {
    setValues(initial)
    setFieldErrors({})
    setError(null)
    setSaved(false)
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!values || saving) return
    const errors: Record<string, string> = {}
    const working_hours: WorkingHours = {}
    for (const [k] of DAYS) {
      const day = values.hours[k]
      if (!day?.open) continue
      if (spanMinutes(day.start, day.end) <= 0) errors[k] = 'Closing time must be after opening time.'
      else working_hours[k] = [{ start: day.start, end: day.end }]
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Fix the highlighted time ranges before saving.')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('business_settings')
      .update({ working_hours, timezone: values.timezone, slot_interval_minutes: values.interval })
      .eq('business_id', business.id)
    setSaving(false)
    setError(error ? friendlyError(error.message) : null)
    if (!error) {
      setInitial(values)
      setSaved(true)
      reload()
      reloadBusiness()
    }
  }

  async function updateBlocked(patch: Partial<BusinessSettings>) {
    const { error } = await supabase.from('business_settings').update(patch).eq('business_id', business.id)
    setError(error ? friendlyError(error.message) : null)
    if (!error) reload()
  }

  function addBlocked(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = e.currentTarget
    const date = String(new FormData(f).get('date'))
    if (s && !s.blocked_dates.includes(date)) updateBlocked({ blocked_dates: [...s.blocked_dates, date].sort() })
    f.reset()
  }

  if (loading || (!values && !loadError))
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeaderSkeleton />
        <FormSkeleton sections={2} fieldsPerSection={3} />
      </div>
    )
  if (loadError || !s || !values) return <ErrorText message={loadError ?? 'Settings not found.'} />

  const zones = Intl.supportedValuesOf('timeZone')
  const intervalOptions = INTERVALS.includes(values.interval) ? INTERVALS : [...INTERVALS, values.interval].sort((a, b) => a - b)
  const today = todayIn(values.timezone)
  const summaryLine =
    stats.openDays === 0
      ? 'Closed every day — customers cannot book yet.'
      : `Open ${stats.openDays} of 7 days · ${fmtDuration(stats.minutes)} a week`

  return (
    <div className="mx-auto max-w-3xl">
      {/* Desktop: sticky action bar keeps Save/Discard reachable the whole way down the form */}
      <div className="sticky top-0 z-10 -mx-8 hidden flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 bg-neutral-50/95 px-8 py-4 backdrop-blur md:flex">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">Business Hours</h1>
          <p className="mt-1 text-sm text-neutral-500">{summaryLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ErrorText message={error} />
          <Saved show={saved} />
          {isDirty && !saving && (
            <button type="button" onClick={discard} className={`${btnGhost} flex items-center gap-1.5`}>
              <RotateCcw size={14} strokeWidth={1.75} />
              Discard
            </button>
          )}
          <button form="hours-form" className={`${btn} flex items-center gap-1.5`} disabled={saving || !isDirty}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Mobile: header scrolls away — actions live in the bottom bar, within thumb reach */}
      <div className="flex items-start justify-between gap-3 pt-1 md:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Business Hours</h1>
          <p className="mt-1 text-sm text-neutral-500">{summaryLine}</p>
        </div>
        {isDirty && (
          <span className="mt-1 flex flex-none items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
        )}
      </div>

      <div className="space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:space-y-6 md:pb-6 md:pt-6">
        <form id="hours-form" onSubmit={save} className="space-y-4 sm:space-y-6">
          <section className={`${panel} !p-3 sm:!p-5`}>
            <div className="px-1.5 sm:px-0">
              <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <Clock3 size={14} strokeWidth={2} />
                </span>
                Weekly Schedule
              </h2>
              <p className="mt-1 text-sm text-neutral-500">Switch a day on or off, then set when it opens and closes.</p>
            </div>

            {/* Common weeks in one tap — scrolls sideways on narrow phones instead of wrapping */}
            <div className="no-scrollbar -mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
              <span className="flex h-9 flex-none items-center gap-1.5 pr-0.5 text-xs font-medium text-neutral-400">
                <Wand2 size={13} strokeWidth={1.75} />
                Quick set
              </span>
              {([['Weekdays 9–6', 'weekdays'], ['Open every day', 'everyday'], ['Close weekend', 'closeWeekend']] as const).map(
                ([text, kind]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => applyPreset(kind)}
                    className="h-9 flex-none rounded-full border border-neutral-200 px-3 text-xs font-medium text-neutral-600 outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600"
                  >
                    {text}
                  </button>
                ),
              )}
            </div>

            <ul className="mt-2 divide-y divide-neutral-100">
              {DAYS.map(([k, label]) => {
                const day = values.hours[k]
                if (!day) return null
                const isToday = k === TODAY_KEY
                const invalid = !!fieldErrors[k]
                const minutes = spanMinutes(day.start, day.end)
                return (
                  <li
                    key={k}
                    className={`-mx-1.5 rounded-xl px-1.5 py-2 transition-colors sm:px-2 sm:py-2.5 ${isToday ? 'bg-brand-50/70' : ''}`}
                  >
                    <div className="flex items-center gap-2 sm:gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:w-36 sm:flex-none">
                        <span
                          className={`truncate text-[15px] font-semibold sm:text-sm ${day.open ? 'text-neutral-900' : 'text-neutral-400'}`}
                        >
                          {label}
                        </span>
                        {isToday && (
                          <span className="flex-none rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            Today
                          </span>
                        )}
                      </div>

                      {/* Desktop: the times sit inline on the same row */}
                      <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
                        {day.open ? (
                          <>
                            <input
                              type="time"
                              value={day.start}
                              onChange={(e) => setDay(k, { start: e.target.value })}
                              aria-label={`${label} opening time`}
                              aria-invalid={invalid}
                              className={`${input} !w-32 ${invalid ? '!border-red-400' : ''}`}
                            />
                            <span className="text-neutral-400">–</span>
                            <input
                              type="time"
                              value={day.end}
                              onChange={(e) => setDay(k, { end: e.target.value })}
                              aria-label={`${label} closing time`}
                              aria-invalid={invalid}
                              className={`${input} !w-32 ${invalid ? '!border-red-400' : ''}`}
                            />
                            {minutes > 0 && <span className="whitespace-nowrap text-xs text-neutral-400">{fmtDuration(minutes)}</span>}
                          </>
                        ) : (
                          <span className="text-sm text-neutral-400">Closed all day</span>
                        )}
                      </div>

                      <DayToggle open={day.open} label={label} onChange={() => setDay(k, { open: !day.open })} />
                      <button
                        type="button"
                        onClick={() => setCopyFor({ key: k, label })}
                        aria-label={`Copy ${label} hours to other days`}
                        title={`Copy ${label} hours to other days`}
                        className="flex h-11 w-9 flex-none items-center justify-center rounded-lg text-neutral-400 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-10 sm:w-10"
                      >
                        <Copy size={15} strokeWidth={1.75} />
                      </button>
                    </div>

                    {/* Mobile: labelled time pair on its own line, full-width tap targets */}
                    {day.open && (
                      <div className="mt-2 sm:hidden">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400">Opens</span>
                            <input
                              type="time"
                              value={day.start}
                              onChange={(e) => setDay(k, { start: e.target.value })}
                              aria-label={`${label} opening time`}
                              aria-invalid={invalid}
                              className={`${input} h-12 ${invalid ? '!border-red-400' : ''}`}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400">Closes</span>
                            <input
                              type="time"
                              value={day.end}
                              onChange={(e) => setDay(k, { end: e.target.value })}
                              aria-label={`${label} closing time`}
                              aria-invalid={invalid}
                              className={`${input} h-12 ${invalid ? '!border-red-400' : ''}`}
                            />
                          </label>
                        </div>
                        {!invalid && minutes > 0 && <p className="mt-1.5 text-xs text-neutral-400">Bookable for {fmtDuration(minutes)}</p>}
                      </div>
                    )}

                    {invalid && <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors[k]}</p>}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className={`${panel} space-y-4`}>
            <div>
              <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <CalendarDays size={14} strokeWidth={2} />
                </span>
                Scheduling Settings
              </h2>
              <p className="mt-1 text-sm text-neutral-500">How your open hours are sliced into bookable start times.</p>
            </div>

            <Field label="Time zone" hint={tzNow ? `It is ${tzNow} there right now.` : undefined}>
              <Select
                value={values.timezone}
                onChange={(e) => setValues((v) => (v ? { ...v, timezone: e.target.value } : v))}
                className={`${input} h-12 sm:h-auto`}
              >
                {(zones.includes(values.timezone) ? zones : [values.timezone, ...zones]).map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </Select>
            </Field>

            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Slot interval</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Slot interval in minutes">
                {intervalOptions.map((n) => {
                  const active = values.interval === n
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setValues((v) => (v ? { ...v, interval: n } : v))}
                      className={`h-11 min-w-16 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-10 ${
                        active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {n} min
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                How far apart bookable start times are — a new slot every {values.interval} minutes.
              </p>
            </div>
          </section>
        </form>

        <div className="flex gap-3 rounded-2xl border border-neutral-200 bg-neutral-100/60 p-4">
          <Info size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-neutral-400" />
          <div className="text-sm">
            <p className="font-medium text-neutral-800">How business hours affect bookings</p>
            <p className="mt-0.5 text-neutral-500">
              Customers can only select appointment times within your business hours. Staff availability, blocked dates, and existing
              bookings may further limit available times.
            </p>
          </div>
        </div>

        <section className={panel}>
          <h2 className="flex flex-wrap items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <CalendarOff size={14} strokeWidth={2} />
            </span>
            Blocked Dates
            {s.blocked_dates.length > 0 && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                {s.blocked_dates.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">One-off closures on top of your weekly hours — holidays, trips, maintenance.</p>

          <form onSubmit={addBlocked} className="mt-4 grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Add a date">
              <input name="date" type="date" min={today} required className={`${input} h-12 sm:h-auto`} />
            </Field>
            <button className={`${btnGhost} flex h-12 items-center gap-1.5 px-4 sm:h-auto sm:py-2`}>
              <Plus size={15} strokeWidth={1.75} />
              Add
            </button>
          </form>

          {s.blocked_dates.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-neutral-400">
              No blocked dates. Your weekly hours apply every week.
            </p>
          ) : (
            <div className="mt-4 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {s.blocked_dates.map((d) => (
                <Chip
                  key={d}
                  removeLabel={`Unblock ${fmtDay(d)}`}
                  onRemove={() => {
                    if (window.confirm(`Unblock ${fmtDay(d)}? Customers will be able to book that day.`))
                      updateBlocked({ blocked_dates: s.blocked_dates.filter((x) => x !== d) })
                  }}
                >
                  <span className={d < today ? 'text-neutral-400' : undefined}>{fmtDay(d)}</span>
                </Chip>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Mobile: save bar slides up only when there is something to save */}
      <div
        aria-hidden={!isDirty && !saving}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur transition-transform duration-200 ease-out md:hidden ${
          isDirty || saving ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
      >
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className={`${btnGhost} flex h-11 flex-none items-center justify-center gap-1.5 px-4 disabled:opacity-50`}
          >
            <RotateCcw size={15} strokeWidth={1.75} />
            Discard
          </button>
          <button
            form="hours-form"
            className={`${btn} flex h-11 flex-1 items-center justify-center gap-1.5`}
            disabled={saving || !isDirty}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Mobile: transient confirmation, since the save bar itself slides away on success */}
      {saved && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:hidden"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            <Check size={16} strokeWidth={2.5} />
            Hours saved
          </span>
        </div>
      )}

      {copyFor && values.hours[copyFor.key] && (
        <Modal onClose={() => setCopyFor(null)} titleId="copy-hours-title" title={`Copy ${copyFor.label}`}>
          <CopyHoursSheet
            dayKey={copyFor.key}
            label={copyFor.label}
            source={values.hours[copyFor.key]}
            onApply={(targets) => copyFrom(copyFor.key, targets)}
            onClose={() => setCopyFor(null)}
          />
        </Modal>
      )}
    </div>
  )
}
