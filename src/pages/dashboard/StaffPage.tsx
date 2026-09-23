import { Fragment, useCallback, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarOff, ChevronRight, Clock3, Eye, EyeOff, Plus, Search, Users, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formStr, unwrap, friendlyError } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { btn, btnGhost, input, panel } from '../../lib/ui'
import { fmtClock, initials } from '../../lib/format'
import type { Schedule, Service, Staff } from '../../lib/types'
import Field from '../../components/Field'
import Modal from '../../components/Modal'
import { ErrorText, ListSkeleton, PageHeaderSkeleton, StatGridSkeleton } from '../../components/Status'
import { useBusiness } from './useBusiness'

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
type StatusFilter = 'all' | 'active' | 'inactive'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function Stat({
  label,
  value,
  icon: Icon,
  tint,
  iconColor,
}: {
  label: string
  value: number
  icon: LucideIcon
  tint: string
  iconColor: string
}) {
  return (
    <div className={`${panel} !p-3 sm:!p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xl font-bold leading-none text-neutral-900 sm:text-2xl">{value}</p>
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full sm:h-9 sm:w-9 ${tint}`}>
          <Icon size={15} strokeWidth={2} className={iconColor} />
        </span>
      </div>
      <p className="mt-2 text-xs font-medium text-neutral-500">{label}</p>
    </div>
  )
}

/** Groups a staff member's weekly shifts into concise ranges, e.g. "Mon–Fri · 9:00 AM–6:00 PM". */
function summarizeSchedule(schedules: Schedule[]) {
  const byDay = new Map<number, Schedule[]>()
  for (const s of schedules) byDay.set(s.day_of_week, [...(byDay.get(s.day_of_week) ?? []), s])
  const days = DAY_ORDER.map((d) => {
    const shifts = (byDay.get(d) ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time))
    if (shifts.length === 0) return { open: false, start: '', end: '' }
    return { open: true, start: shifts[0].start_time.slice(0, 5), end: shifts[shifts.length - 1].end_time.slice(0, 5) }
  })
  const groups: { label: string; text: string }[] = []
  let i = 0
  while (i < DAY_ORDER.length) {
    let j = i
    while (j + 1 < DAY_ORDER.length && days[j + 1].open === days[i].open && days[j + 1].start === days[i].start && days[j + 1].end === days[i].end) j++
    const startLabel = DAY_LABEL[DAY_ORDER[i]]
    const endLabel = DAY_LABEL[DAY_ORDER[j]]
    groups.push({
      label: i === j ? startLabel : `${startLabel}–${endLabel}`,
      text: days[i].open ? `${fmtClock(days[i].start)}–${fmtClock(days[i].end)}` : 'Off',
    })
    i = j + 1
  }
  return groups.filter((g) => g.text !== 'Off')
}

/** Photo when there is one, initials otherwise — a row without a face is hard to scan. */
function Avatar({ staff, className }: { staff: Staff; className: string }) {
  return staff.avatar_url ? (
    <img src={staff.avatar_url} alt="" className={`${className} shrink-0 object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center bg-brand-50 font-semibold text-brand-700`}>
      {initials(staff.name)}
    </span>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        active ? 'border-green-200 bg-green-50 text-green-700' : 'border-neutral-200 bg-neutral-50 text-neutral-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-600' : 'bg-neutral-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

/**
 * Phone layout: the whole card navigates to the member's page, which is where
 * services and availability are actually edited. Only the visibility toggle
 * earns a second target on the row.
 */
function StaffCard({
  staff,
  services,
  groups,
  onToggle,
}: {
  staff: Staff
  services: string[]
  groups: { label: string; text: string }[]
  onToggle: () => void
}) {
  return (
    <li className="relative sm:hidden">
      <Link
        to={staff.id}
        className={`flex w-full items-center gap-3 py-3 pl-3 pr-13 text-left outline-none transition-colors active:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
          staff.is_active ? '' : 'opacity-60'
        }`}
      >
        <Avatar staff={staff} className="h-14 w-14 rounded-full text-base" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-neutral-900">{staff.name}</span>
            {!staff.is_active && (
              <span className="flex-none rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Inactive
              </span>
            )}
          </span>
          {staff.position && <span className="mt-0.5 block truncate text-xs text-neutral-600">{staff.position}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Users size={12} strokeWidth={1.75} className="text-neutral-400" />
              {services.length || 'No'} service{services.length === 1 ? '' : 's'}
            </span>
            <span className="text-neutral-300">·</span>
            {groups.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <CalendarOff size={12} strokeWidth={1.75} />
                No schedule
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Clock3 size={12} strokeWidth={1.75} className="text-neutral-400" />
                {groups[0].label} {groups[0].text}
                {groups.length > 1 && <span className="text-neutral-400">+{groups.length - 1}</span>}
              </span>
            )}
          </span>
        </span>
      </Link>

      <button
        type="button"
        aria-label={staff.is_active ? `Deactivate ${staff.name}` : `Activate ${staff.name}`}
        onClick={onToggle}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-neutral-400 outline-none transition-colors active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        {staff.is_active ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
      </button>
    </li>
  )
}

/** Desktop layout: one scannable row per member, aligned to the column header. */
function StaffRow({
  staff,
  services,
  groups,
  onToggle,
}: {
  staff: Staff
  services: string[]
  groups: { label: string; text: string }[]
  onToggle: () => void
}) {
  return (
    <li className="hidden items-center gap-4 py-3 sm:flex">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar staff={staff} className="h-10 w-10 rounded-full text-sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{staff.name}</p>
          {staff.position && <p className="truncate text-xs text-neutral-600">{staff.position}</p>}
          <p className="truncate text-xs text-neutral-500">{[staff.email, staff.phone].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      </div>

      <div className="w-40 text-sm">
        {services.length === 0 ? (
          <span className="text-neutral-400">None assigned</span>
        ) : services.length <= 2 ? (
          <span className="text-neutral-700">{services.join(', ')}</span>
        ) : (
          <span className="text-neutral-700" title={services.join(', ')}>
            {services[0]}, {services[1]} +{services.length - 2}
          </span>
        )}
      </div>

      <div className="w-44 text-sm">
        {groups.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-amber-600">
            <CalendarOff size={13} strokeWidth={1.75} />
            No schedule set
          </span>
        ) : (
          <span className="text-neutral-700">
            {groups[0].label} <span className="text-neutral-400">·</span> {groups[0].text}
            {groups.length > 1 && <span className="text-neutral-400"> +{groups.length - 1} more</span>}
          </span>
        )}
      </div>

      <span className="flex w-20 justify-center">
        <StatusPill active={staff.is_active} />
      </span>

      <div className="flex w-24 shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          aria-label={staff.is_active ? `Deactivate ${staff.name}` : `Activate ${staff.name}`}
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          {staff.is_active ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
        </button>
        <Link to={staff.id} className={`${btnGhost} inline-flex items-center gap-1 !px-2.5 !py-1.5 text-xs`}>
          Manage <ChevronRight size={13} />
        </Link>
      </div>
    </li>
  )
}

function StaffForm({ businessId, onDone }: { businessId: string; onDone: (saved: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setSaving(true)
    const { error } = await supabase.from('staff').insert({
      business_id: businessId,
      name: formStr(f, 'name'),
      email: formStr(f, 'email'),
      phone: formStr(f, 'phone'),
      avatar_url: formStr(f, 'avatar_url'),
      position: formStr(f, 'position'),
    })
    setSaving(false)
    if (error) setError(friendlyError(error.message))
    else onDone(true)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name">
        <input name="name" required placeholder="e.g. Jane Santos" className={`${input} h-12 sm:h-auto`} />
      </Field>

      <Field label="Position / Role" hint="Optional — shown next to their name.">
        <input name="position" placeholder="e.g. Dentist, Barber, Receptionist" className={`${input} h-12 sm:h-auto`} />
      </Field>

      <Field label="Email">
        <input name="email" type="email" inputMode="email" autoComplete="email" placeholder="jane@example.com" className={`${input} h-12 sm:h-auto`} />
      </Field>

      <Field label="Phone">
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXXX" className={`${input} h-12 sm:h-auto`} />
      </Field>

      <Field label="Photo URL" hint="Optional. Paste a hosted image link — initials are used otherwise.">
        <input name="avatar_url" type="url" inputMode="url" placeholder="https://..." className={`${input} h-12 sm:h-auto`} />
      </Field>

      <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
        You can assign services and set their weekly availability once they are added.
      </p>

      <ErrorText message={error} />

      <div className="flex gap-2 pt-1">
        <button type="button" className={`${btnGhost} h-11 flex-none px-4`} onClick={() => onDone(false)}>
          Cancel
        </button>
        <button className={`${btn} h-11 flex-1`} disabled={saving}>
          {saving ? 'Saving…' : 'Add staff member'}
        </button>
      </div>
    </form>
  )
}

export default function StaffPage() {
  const { business } = useBusiness()
  const load = useCallback(async () => {
    const staff = await unwrap<Staff[]>(supabase.from('staff').select('*').eq('business_id', business.id).order('name'))
    const ids = staff.map((s) => s.id)
    const [links, services, schedules] = await Promise.all([
      unwrap<{ staff_id: string; service_id: string }[]>(
        supabase.from('staff_services').select('staff_id, service_id').eq('business_id', business.id),
      ),
      unwrap<Service[]>(supabase.from('services').select('*').eq('business_id', business.id)),
      ids.length
        ? unwrap<Schedule[]>(supabase.from('staff_schedules').select('*').in('staff_id', ids))
        : Promise.resolve([] as Schedule[]),
    ])
    return { staff, links, services, schedules }
  }, [business.id])
  const { data, loading, error, reload } = useLoad(load)
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  async function toggle(s: Staff) {
    const { error } = await supabase.from('staff').update({ is_active: !s.is_active }).eq('id', s.id)
    setActionError(error ? friendlyError(error.message) : null)
    reload()
  }

  const serviceById = useMemo(() => new Map((data?.services ?? []).map((s) => [s.id, s.name])), [data])
  const servicesByStaff = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const l of data?.links ?? []) {
      const name = serviceById.get(l.service_id)
      if (name) m.set(l.staff_id, [...(m.get(l.staff_id) ?? []), name])
    }
    return m
  }, [data, serviceById])
  const scheduleByStaff = useMemo(() => {
    const m = new Map<string, Schedule[]>()
    for (const s of data?.schedules ?? []) m.set(s.staff_id, [...(m.get(s.staff_id) ?? []), s])
    return m
  }, [data])

  const filtered = useMemo(() => {
    const staff = data?.staff ?? []
    const q = query.trim().toLowerCase()
    return staff.filter((s) => {
      if (status === 'active' && !s.is_active) return false
      if (status === 'inactive' && s.is_active) return false
      if (q && !s.name.toLowerCase().includes(q) && !s.email?.toLowerCase().includes(q) && !s.position?.toLowerCase().includes(q))
        return false
      return true
    })
  }, [data, query, status])

  const summary = useMemo(() => {
    const staff = data?.staff ?? []
    const active = staff.filter((s) => s.is_active).length
    const scheduled = staff.filter((s) => (scheduleByStaff.get(s.id)?.length ?? 0) > 0).length
    return { total: staff.length, active, inactive: staff.length - active, scheduled }
  }, [data, scheduleByStaff])

  if (loading)
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeaderSkeleton withAction />
        <StatGridSkeleton />
        <ListSkeleton />
      </div>
    )

  const staff = data?.staff ?? []
  const hasStaff = staff.length > 0
  const isFiltering = status !== 'all' || query.trim() !== ''
  const tabCounts: Record<StatusFilter, number> = { all: summary.total, active: summary.active, inactive: summary.inactive }

  function clearFilters() {
    setStatus('all')
    setQuery('')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Staff</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage your team, services, and availability.</p>
        </div>
        <button className={`${btn} hidden items-center gap-1.5 sm:inline-flex`} onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={1.75} /> Add Staff
        </button>
      </div>

      {hasStaff && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <Stat label="Total staff" value={summary.total} icon={Users} tint="bg-indigo-50" iconColor="text-indigo-600" />
          <Stat label="Active" value={summary.active} icon={Eye} tint="bg-green-50" iconColor="text-green-600" />
          <Stat label="Inactive" value={summary.inactive} icon={EyeOff} tint="bg-neutral-100" iconColor="text-neutral-500" />
          <Stat label="With schedule" value={summary.scheduled} icon={Clock3} tint="bg-blue-50" iconColor="text-blue-600" />
        </div>
      )}

      <ErrorText message={error ?? actionError} />

      {/* Nobody can be booked without a schedule, so surface the gap instead of burying it per-row */}
      {hasStaff && summary.scheduled < summary.active && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
          <CalendarOff size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <p>
            {summary.active - summary.scheduled} active staff member{summary.active - summary.scheduled === 1 ? ' has' : 's have'} no
            weekly schedule, so customers cannot book them yet.
          </p>
        </div>
      )}

      {hasStaff && (
        <div className="flex flex-col gap-2.5 sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-3">
          <div className="relative min-w-0 sm:w-64 sm:flex-none">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, role or email…"
              aria-label="Search staff"
              className={`${input} !h-11 !rounded-full !border-neutral-300 !pl-10 sm:!h-9 sm:!pl-9`}
            />
          </div>

          {/* Counts on the tabs make the filter's effect predictable before tapping it */}
          <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex flex-none items-center gap-1 rounded-full bg-neutral-100 p-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatus(tab.value)}
                  aria-pressed={status === tab.value}
                  className={`flex-none whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:py-1.5 ${
                    status === tab.value ? 'bg-white text-brand-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs ${status === tab.value ? 'text-brand-500' : 'text-neutral-400'}`}>
                    {tabCounts[tab.value]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!hasStaff ? (
        <div className={`${panel} space-y-3 py-10 text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Users size={20} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-800">No staff yet</p>
            <p className="mt-1 text-sm text-neutral-500">Add your team so you can assign services and manage their availability.</p>
          </div>
          <button className={`${btn} inline-flex h-11 items-center gap-1.5`} onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={1.75} /> Add Staff
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${panel} space-y-3 py-10 text-center`}>
          <div>
            <p className="text-sm font-medium text-neutral-800">No staff match</p>
            <p className="mt-1 text-sm text-neutral-500">Try a different search term or filter.</p>
          </div>
          <button type="button" className={`${btnGhost} inline-flex h-11 items-center px-4`} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className={`${panel} !p-0`}>
          <div className="hidden items-center gap-4 border-b border-neutral-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400 sm:flex">
            <span className="flex-1">Staff</span>
            <span className="w-40">Assigned Services</span>
            <span className="w-44">Availability</span>
            <span className="w-20 text-center">Status</span>
            <span className="w-24 text-right">Actions</span>
          </div>
          <ul className="divide-y divide-neutral-100 sm:px-4">
            {filtered.map((s) => {
              const services = servicesByStaff.get(s.id) ?? []
              const groups = summarizeSchedule(scheduleByStaff.get(s.id) ?? [])
              const onToggle = () => toggle(s)
              // Card and row are genuinely different layouts, so each breakpoint gets its own
              // markup rather than one row bent into both shapes. Only one is ever displayed.
              return (
                <Fragment key={s.id}>
                  <StaffCard staff={s} services={services} groups={groups} onToggle={onToggle} />
                  <StaffRow staff={s} services={services} groups={groups} onToggle={onToggle} />
                </Fragment>
              )
            })}
          </ul>
        </div>
      )}

      {isFiltering && filtered.length > 0 && (
        <p className="px-1 text-xs text-neutral-400">
          Showing {filtered.length} of {summary.total} staff
        </p>
      )}

      {/* Mobile floating action button */}
      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="Add staff"
        className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:hidden"
      >
        <Plus size={24} strokeWidth={2} />
      </button>

      {/* The form is a focus-trapped bottom sheet on phones, so it never pushes the list around */}
      {adding && (
        <Modal onClose={() => setAdding(false)} titleId="staff-form-title" title="New staff member" maxWidth="max-w-lg">
          <StaffForm
            businessId={business.id}
            onDone={(saved) => {
              setAdding(false)
              if (saved) reload()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
