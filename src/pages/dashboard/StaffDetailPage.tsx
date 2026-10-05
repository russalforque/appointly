import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarOff,
  Check,
  ChevronLeft,
  Clock3,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formStr, unwrap, friendlyError } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { useConfirm } from '../../lib/confirm'
import { useToast } from '../../lib/toast'
import { btn, btnGhost, input, panel } from '../../lib/ui'
import { fmtClock, fmtDateTime, fmtDay, fmtDuration, fmtPeso, initials, todayIn } from '../../lib/format'
import type { BookingRow, DayOff, Schedule, Service, Staff } from '../../lib/types'
import Field from '../../components/Field'
import Chip from '../../components/Chip'
import Select from '../../components/Select'
import Switch from '../../components/Switch'
import SaveBar from '../../components/SaveBar'
import { Bone, ErrorState, ErrorText, FormSkeleton } from '../../components/Status'
import { StatusBadge } from './BookingParts'
import { UpgradeBanner } from '../../components/UpgradeNotice'
import { useBusiness } from './useBusiness'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

type TabValue = 'profile' | 'services' | 'availability' | 'bookings'
const TABS: { value: TabValue; label: string; icon: LucideIcon }[] = [
  { value: 'profile', label: 'Profile', icon: UserRound },
  { value: 'services', label: 'Services', icon: BriefcaseBusiness },
  { value: 'availability', label: 'Availability', icon: Clock3 },
  { value: 'bookings', label: 'Bookings', icon: CalendarCheck },
]

type Profile = { name: string; position: string; email: string; phone: string; avatar_url: string; is_active: boolean }

const nullable = (v: string) => v.trim() || null

function SectionHeading({ icon: Icon, tint, children, hint }: { icon: LucideIcon; tint: string; children: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
        <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${tint}`}>
          <Icon size={14} strokeWidth={2} />
        </span>
        {children}
      </h2>
      {hint && <p className="mt-1 text-sm text-neutral-500">{hint}</p>}
    </div>
  )
}

export default function StaffDetailPage() {
  const { business, timezone, can } = useBusiness()
  const { id = '' } = useParams()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<TabValue>('profile')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [initialProfile, setInitialProfile] = useState<Profile | null>(null)
  const [busyService, setBusyService] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const loadedId = useRef<string | null>(null)

  const load = useCallback(async () => {
    const [staff, services, links, schedules, daysOff, upcoming] = await Promise.all([
      unwrap<Staff>(supabase.from('staff').select('*').eq('id', id).single()),
      unwrap<Service[]>(supabase.from('services').select('*').eq('business_id', business.id).order('name')),
      unwrap<{ service_id: string }[]>(supabase.from('staff_services').select('service_id').eq('staff_id', id)),
      unwrap<Schedule[]>(supabase.from('staff_schedules').select('*').eq('staff_id', id).order('start_time')),
      unwrap<DayOff[]>(supabase.from('staff_days_off').select('*').eq('staff_id', id).order('date')),
      unwrap<BookingRow[]>(
        supabase
          .from('bookings')
          .select('*, services(name, duration_minutes, price), staff(name, position), customers(name, email, phone)')
          .eq('staff_id', id)
          .gte('start_at', new Date().toISOString())
          .in('status', ['pending', 'confirmed'])
          .order('start_at')
          .limit(5),
      ),
    ])
    return { staff, services, assigned: new Set(links.map((l) => l.service_id)), schedules, daysOff, upcoming }
  }, [id, business.id])
  const { data, loading, error: loadError, reload } = useLoad(load)

  // Seed the editable profile once per staff member; later reloads must not clobber edits in progress.
  useEffect(() => {
    if (!data || loadedId.current === data.staff.id) return
    loadedId.current = data.staff.id
    const p: Profile = {
      name: data.staff.name,
      position: data.staff.position ?? '',
      email: data.staff.email ?? '',
      phone: data.staff.phone ?? '',
      avatar_url: data.staff.avatar_url ?? '',
      is_active: data.staff.is_active,
    }
    setProfile(p)
    setInitialProfile(p)
  }, [data])

  const isDirty = !!profile && !!initialProfile && JSON.stringify(profile) !== JSON.stringify(initialProfile)

  /** Runs a mutation, surfaces its error, and refreshes. Resolves to whether it succeeded. */
  async function run(q: PromiseLike<{ error: { message: string } | null }>, done?: string): Promise<boolean> {
    const { error } = await q
    setError(error ? friendlyError(error.message) : null)
    if (!error) {
      if (done) toast(done)
      reload()
    }
    return !error
  }

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!profile || saving) return
    setSaving(true)
    const { error } = await supabase
      .from('staff')
      .update({
        name: profile.name.trim(),
        position: nullable(profile.position),
        email: nullable(profile.email),
        phone: nullable(profile.phone),
        avatar_url: nullable(profile.avatar_url),
        is_active: profile.is_active,
      })
      .eq('id', id)
    setSaving(false)
    setError(error ? friendlyError(error.message) : null)
    if (!error) {
      setInitialProfile(profile)
      toast('Profile saved')
      reload()
    }
  }

  async function toggleService(serviceId: string, isAssigned: boolean) {
    if (busyService) return
    setBusyService(serviceId)
    const name = data?.services.find((x) => x.id === serviceId)?.name ?? 'Service'
    await run(
      isAssigned
        ? supabase.from('staff_services').delete().eq('staff_id', id).eq('service_id', serviceId)
        : supabase.from('staff_services').insert({ staff_id: id, service_id: serviceId, business_id: business.id }),
      isAssigned ? `${name} removed` : `${name} added`,
    )
    setBusyService(null)
  }

  // staff_schedules has no uniqueness rule, so a double tap used to store the same shift twice.
  async function addShift(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (adding || !data) return
    const f = e.currentTarget
    const form = new FormData(f)
    const day = Number(form.get('day'))
    const start = String(form.get('start'))
    const end = String(form.get('end'))
    if (end <= start) return setError('End time must be after start time.')
    const clash = data.schedules.find(
      (s) => s.day_of_week === day && start < s.end_time.slice(0, 5) && end > s.start_time.slice(0, 5),
    )
    if (clash)
      return setError(`That overlaps the ${fmtClock(clash.start_time)}–${fmtClock(clash.end_time)} shift on ${DAYS[day]}.`)
    setAdding(true)
    const ok = await run(
      supabase.from('staff_schedules').insert({ staff_id: id, day_of_week: day, start_time: start, end_time: end }),
      `${DAYS[day]} shift added`,
    )
    setAdding(false)
    if (ok) f.reset()
  }

  async function addDayOff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (adding || !data) return
    const f = e.currentTarget
    const form = new FormData(f)
    const date = String(form.get('date'))
    if (data.daysOff.some((d) => d.date === date)) return setError(`${fmtDay(date)} is already a day off.`)
    setAdding(true)
    const ok = await run(supabase.from('staff_days_off').insert({ staff_id: id, date, reason: formStr(form, 'reason') }), `Day off added for ${fmtDay(date)}`)
    setAdding(false)
    if (ok) f.reset()
  }

  if (loading || (!profile && !loadError))
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3" aria-hidden="true">
          <Bone className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Bone className="h-5 w-40" />
            <Bone className="h-3.5 w-52" />
          </div>
        </div>
        <FormSkeleton sections={2} fieldsPerSection={3} />
      </div>
    )
  if (loadError || !data || !profile) return <ErrorState message={loadError ?? 'Staff member not found.'} onRetry={reload} />

  const { staff, services, assigned, schedules, daysOff, upcoming } = data
  const today = todayIn(timezone)
  const firstName = staff.name.split(' ')[0]

  // Always allowed, on any plan: it is how a custom schedule kept from Business is let go of.
  async function resetToBusinessHours() {
    const ok = await confirm({
      title: `Put ${firstName} on your business hours?`,
      body: `Their ${schedules.length} custom shift${schedules.length === 1 ? '' : 's'} will be removed and they'll be bookable whenever you're open. Existing bookings are kept.`,
      confirmLabel: 'Use business hours',
    })
    if (ok) run(supabase.from('staff_schedules').delete().eq('staff_id', id), `${firstName} now follows your business hours`)
  }
  const tabCounts: Record<TabValue, number | null> = {
    profile: null,
    services: assigned.size,
    availability: schedules.length,
    bookings: upcoming.length,
  }
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((p) => (p ? { ...p, [key]: value } : p))

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/dashboard/staff"
        className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-neutral-500 outline-none transition-colors hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600 md:h-auto"
      >
        <ChevronLeft size={16} strokeWidth={2} /> Staff
      </Link>

      {/* Identity stays put while the tabs change, so you always know whose page this is */}
      <div className="mt-1 flex items-center gap-3 sm:gap-4">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover sm:h-18 sm:w-18" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg font-semibold text-brand-700 sm:h-18 sm:w-18">
            {initials(profile.name)}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 max-w-full truncate text-[22px] font-semibold tracking-tight text-neutral-900 sm:text-2xl">{staff.name}</h1>
            <span
              className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                staff.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-neutral-200 bg-neutral-50 text-neutral-500'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${staff.is_active ? 'bg-green-600' : 'bg-neutral-400'}`} />
              {staff.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {staff.position && <p className="truncate text-sm font-medium text-neutral-600">{staff.position}</p>}
          <p className="truncate text-sm text-neutral-500">{[staff.email, staff.phone].filter(Boolean).join(' · ') || 'No contact info'}</p>
        </div>
      </div>

      {/* Four separate jobs — editing details, assigning services, setting availability, reviewing
          bookings — so they get four tabs instead of one endless scroll. */}
      <div className="no-scrollbar sticky top-14 z-10 -mx-4 mt-4 flex overflow-x-auto bg-neutral-50/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:px-0 md:backdrop-blur-none">
        <div className="flex flex-none items-center gap-1 rounded-full bg-neutral-100 p-1" role="tablist">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 ${
                tab === value ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
              {label}
              {tabCounts[value] !== null && (
                <span className={`text-xs ${tab === value ? 'text-brand-500' : 'text-neutral-400'}`}>{tabCounts[value]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4 sm:space-y-6">
        <ErrorText message={error} />

        {tab === 'profile' && (
          <form id="staff-profile-form" onSubmit={saveProfile} className={`${panel} space-y-4`}>
            <Field label="Name">
              <input
                required
                value={profile.name}
                maxLength={120}
                onChange={(e) => set('name', e.target.value)}
                className={`${input} h-12 sm:h-auto`}
              />
            </Field>

            <Field label="Position / Role" hint="Optional — shown next to their name.">
              <input
                value={profile.position}
                maxLength={120}
                onChange={(e) => set('position', e.target.value)}
                placeholder="e.g. Dentist, Barber, Receptionist"
                className={`${input} h-12 sm:h-auto`}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={profile.email}
                  maxLength={254}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="jane@example.com"
                  className={`${input} h-12 sm:h-auto`}
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={profile.phone}
                  maxLength={40}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="09XX XXX XXXX"
                  className={`${input} h-12 sm:h-auto`}
                />
              </Field>
            </div>

            <Field label="Photo URL" hint="Optional. Paste a hosted image link — initials are used otherwise.">
              <input
                type="url"
                inputMode="url"
                value={profile.avatar_url}
                onChange={(e) => set('avatar_url', e.target.value)}
                placeholder="https://..."
                className={`${input} h-12 sm:h-auto`}
              />
            </Field>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">Active</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {profile.is_active ? 'Customers can book this staff member.' : 'Hidden from your booking page.'}
                </p>
              </div>
              <Switch checked={profile.is_active} onChange={() => set('is_active', !profile.is_active)} label="Active" />
            </div>

            {/* Desktop keeps the actions with the form; phones get the bottom bar below */}
            <div className="hidden items-center gap-3 md:flex">
              {isDirty && !saving && (
                <button type="button" onClick={() => setProfile(initialProfile)} className={`${btnGhost} flex items-center gap-1.5`}>
                  <RotateCcw size={14} strokeWidth={1.75} /> Discard
                </button>
              )}
              <button className={`${btn} flex items-center gap-1.5`} disabled={saving || !isDirty}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={15} strokeWidth={1.75} />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        {tab === 'services' && (
          <section className={`${panel} !p-3 sm:!p-5`}>
            <div className="px-1.5 sm:px-0">
              <SectionHeading
                icon={BriefcaseBusiness}
                tint="bg-blue-50 text-blue-600"
                hint={`${assigned.size} of ${services.length} service${services.length === 1 ? '' : 's'} assigned. Changes save immediately.`}
              >
                Services offered
              </SectionHeading>
            </div>

            {services.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
                No services yet. Create them under Services first.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {services.map((s) => {
                  const isAssigned = assigned.has(s.id)
                  const busy = busyService === s.id
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isAssigned}
                        disabled={busy}
                        onClick={() => toggleService(s.id, isAssigned)}
                        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-3 rounded-xl px-1.5 py-3 text-left outline-none transition-colors active:bg-neutral-50 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`truncate text-sm ${isAssigned ? 'font-semibold text-neutral-900' : 'text-neutral-600'}`}>
                              {s.name}
                            </span>
                            {!s.is_active && (
                              <span className="flex-none rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                Hidden
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            {fmtDuration(s.duration_minutes)}
                            {s.price !== null && ` · ${fmtPeso(s.price)}`}
                          </span>
                        </span>
                        <span
                          className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border transition-colors ${
                            isAssigned ? 'border-brand-600 bg-brand-600 text-white' : 'border-neutral-300'
                          }`}
                        >
                          {busy ? (
                            <Loader2 size={13} className="animate-spin text-neutral-400" />
                          ) : (
                            isAssigned && <Check size={14} strokeWidth={3} />
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {tab === 'availability' && (
          <>
            {!can.staffAvailability ? (
              <UpgradeBanner
                title="Individual schedules are part of Business"
                body={
                  schedules.length > 0
                    ? `${firstName}'s custom schedule below still applies. Remove it to follow your business hours, or upgrade to edit it.`
                    : `${firstName} is bookable during your business hours. Upgrade to give each person their own shifts and days off.`
                }
                action={
                  schedules.length > 0 && (
                    <button
                      type="button"
                      onClick={resetToBusinessHours}
                      className="inline-flex h-11 items-center rounded-xl border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-700 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9 sm:rounded-lg"
                    >
                      Use business hours
                    </button>
                  )
                }
              />
            ) : (
              schedules.length === 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm text-neutral-600">
                  <Clock3 size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-neutral-400" />
                  <p>
                    No custom schedule — {firstName} is bookable during your business hours. Add shifts below to set their own.
                  </p>
                </div>
              )
            )}

            <section className={`${panel} !p-3 sm:!p-5`}>
              <div className="px-1.5 sm:px-0">
                <SectionHeading icon={Clock3} tint="bg-violet-50 text-violet-600" hint="The hours this person works each week.">
                  Working schedule
                </SectionHeading>
              </div>

              <ul className="divide-y divide-neutral-100">
                {DAY_ORDER.map((d) => {
                  const shifts = schedules.filter((s) => s.day_of_week === d)
                  return (
                    <li key={d} className="flex items-start gap-3 py-2.5">
                      <span className="w-12 shrink-0 pt-1 text-sm font-semibold text-neutral-800 sm:w-24">
                        <span className="sm:hidden">{DAY_SHORT[d]}</span>
                        <span className="hidden sm:inline">{DAYS[d]}</span>
                      </span>
                      {shifts.length === 0 ? (
                        <span className="pt-1 text-sm text-neutral-400">Off</span>
                      ) : (
                        <div className="flex min-w-0 flex-wrap gap-2">
                          {shifts.map((s) => (
                            <Chip
                              key={s.id}
                              removeLabel={`Remove ${DAYS[d]} shift`}
                              onRemove={async () => {
                                const ok = await confirm({
                                  title: `Remove this ${DAYS[d]} shift?`,
                                  body: `${fmtClock(s.start_time)}–${fmtClock(s.end_time)} will no longer be bookable with ${staff.name.split(' ')[0]}. Existing bookings are kept.`,
                                  confirmLabel: 'Remove shift',
                                  tone: 'danger',
                                })
                                if (ok) run(supabase.from('staff_schedules').delete().eq('id', s.id), 'Shift removed')
                              }}
                            >
                              {fmtClock(s.start_time)}–{fmtClock(s.end_time)}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {can.staffAvailability && (
              <form onSubmit={addShift} className="mt-3 space-y-3 border-t border-neutral-100 pt-4">
                <Field label="Day">
                  <Select name="day" className={`${input} h-12 sm:h-auto`}>
                    {DAY_ORDER.map((d) => (
                      <option key={d} value={d}>
                        {DAYS[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Starts">
                    <input name="start" type="time" required defaultValue="09:00" className={`${input} h-12 sm:h-auto`} />
                  </Field>
                  <Field label="Ends">
                    <input name="end" type="time" required defaultValue="18:00" className={`${input} h-12 sm:h-auto`} />
                  </Field>
                </div>
                <button disabled={adding} className={`${btnGhost} flex h-11 w-full items-center justify-center gap-1.5 disabled:opacity-50 sm:h-auto sm:w-auto sm:px-4`}>
                  <Plus size={15} strokeWidth={1.75} /> Add shift
                </button>
              </form>
              )}
            </section>

            <section className={panel}>
              <SectionHeading icon={CalendarOff} tint="bg-amber-50 text-amber-600" hint="One-off days this person is unavailable.">
                Days off
              </SectionHeading>

              {daysOff.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-neutral-400">
                  None scheduled.
                </p>
              ) : (
                <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  {daysOff.map((d) => (
                    <Chip
                      key={d.id}
                      removeLabel={`Remove day off on ${fmtDay(d.date)}`}
                      onRemove={async () => {
                        const ok = await confirm({
                          title: `Remove the day off on ${fmtDay(d.date)}?`,
                          body: 'Customers will be able to book them that day again.',
                          confirmLabel: 'Remove day off',
                        })
                        if (ok) run(supabase.from('staff_days_off').delete().eq('id', d.id), 'Day off removed')
                      }}
                    >
                      <span className={d.date < today ? 'text-neutral-400' : undefined}>{fmtDay(d.date)}</span>
                      {d.reason && <span className="text-neutral-400"> · {d.reason}</span>}
                    </Chip>
                  ))}
                </div>
              )}

              {can.staffAvailability && (
              <form onSubmit={addDayOff} className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Date">
                    <input name="date" type="date" min={today} required className={`${input} h-12 sm:h-auto`} />
                  </Field>
                  <Field label="Reason" hint="Optional.">
                    <input name="reason" maxLength={500} placeholder="e.g. Holiday" className={`${input} h-12 sm:h-auto`} />
                  </Field>
                </div>
                <button disabled={adding} className={`${btnGhost} flex h-11 w-full items-center justify-center gap-1.5 disabled:opacity-50 sm:h-auto sm:w-auto sm:px-4`}>
                  <Plus size={15} strokeWidth={1.75} /> Add day off
                </button>
              </form>
              )}
            </section>
          </>
        )}

        {tab === 'bookings' && (
          <section className={`${panel} !p-0`}>
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <SectionHeading icon={CalendarCheck} tint="bg-green-50 text-green-600" hint="The next five pending or confirmed bookings.">
                Upcoming bookings
              </SectionHeading>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-6 text-center text-sm text-neutral-400 sm:px-5">No upcoming bookings for this staff member.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{b.services?.name ?? 'Service'}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {b.customers?.name ?? 'Customer'} · {fmtDateTime(b.start_at, timezone)}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Phones: the save bar slides up only on the Profile tab, and only when there is something to save */}
      <SaveBar
        show={tab === 'profile' && isDirty}
        saving={tab === 'profile' && saving}
        error={tab === 'profile' ? error : null}
        form="staff-profile-form"
        onDiscard={() => setProfile(initialProfile)}
        canSave={isDirty}
      />
    </div>
  )
}
