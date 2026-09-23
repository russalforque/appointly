import { Fragment, useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Clock3, Eye, EyeOff, ImagePlus, Layers, Pencil, Plus, Scissors, Search, Users, X, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formStr, unwrap, friendlyError } from '../../lib/db'
import { useLoad } from '../../lib/useLoad'
import { fmtDuration, fmtPeso } from '../../lib/format'
import { btn, btnGhost, input, panel } from '../../lib/ui'
import type { Service, Staff } from '../../lib/types'
import Field from '../../components/Field'
import Modal from '../../components/Modal'
import Switch from '../../components/Switch'
import { ErrorText, ListSkeleton, PageHeaderSkeleton, StatGridSkeleton } from '../../components/Status'
import { useBusiness } from './useBusiness'

type StatusFilter = 'all' | 'active' | 'inactive'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const DURATION_PRESETS = [15, 30, 45, 60, 90]
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function Stat({
  label,
  value,
  icon: Icon,
  tint,
  iconColor,
}: {
  label: string
  value: string | number
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

/** Square thumbnail, falling back to a tinted glyph when a service has no photo. */
function ServiceThumb({ service, className }: { service: Service; className: string }) {
  return service.image_url ? (
    <img src={service.image_url} alt="" className={`${className} shrink-0 object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center bg-indigo-50 text-indigo-600`}>
      <Scissors size={18} strokeWidth={1.75} />
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
 * Phone layout: the whole card opens the editor, so the primary action is the
 * full width of the row. Visibility is the one secondary action worth its own
 * 44px target; everything else lives in the editor.
 */
function ServiceCard({
  service,
  staffCount,
  onEdit,
  onToggle,
}: {
  service: Service
  staffCount: number
  onEdit: () => void
  onToggle: () => void
}) {
  return (
    <li className="relative sm:hidden">
      <button
        type="button"
        onClick={onEdit}
        className={`flex w-full items-center gap-3 py-3 pl-3 pr-13 text-left outline-none transition-colors active:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${
          service.is_active ? '' : 'opacity-60'
        }`}
      >
        <ServiceThumb service={service} className="h-14 w-14 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-neutral-900">{service.name}</span>
            {!service.is_active && (
              <span className="flex-none rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Hidden
              </span>
            )}
          </span>
          {service.description && <span className="mt-0.5 block truncate text-xs text-neutral-500">{service.description}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <span className="font-semibold text-neutral-900">{service.price !== null ? fmtPeso(service.price) : 'No price'}</span>
            <span className="text-neutral-300">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} strokeWidth={1.75} className="text-neutral-400" />
              {fmtDuration(service.duration_minutes)}
            </span>
            <span className="text-neutral-300">·</span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} strokeWidth={1.75} className="text-neutral-400" />
              {staffCount || 'No'} staff
            </span>
          </span>
        </span>
      </button>

      <button
        type="button"
        aria-label={service.is_active ? `Hide ${service.name} from booking page` : `Show ${service.name} on booking page`}
        onClick={onToggle}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-neutral-400 outline-none transition-colors active:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        {service.is_active ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
      </button>
    </li>
  )
}

/** Desktop layout: one scannable row per service, aligned to the column header. */
function ServiceRow({
  service,
  staffNames,
  onEdit,
  onToggle,
}: {
  service: Service
  staffNames: string[]
  onEdit: () => void
  onToggle: () => void
}) {
  return (
    <li className="hidden items-center gap-4 py-3 sm:flex">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ServiceThumb service={service} className="h-10 w-10 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{service.name}</p>
          {service.description && <p className="truncate text-xs text-neutral-500">{service.description}</p>}
        </div>
      </div>

      <span className="w-20 text-right text-sm font-semibold text-neutral-900">
        {service.price !== null ? fmtPeso(service.price) : '—'}
      </span>
      <span className="w-24 text-right text-sm text-neutral-700">{fmtDuration(service.duration_minutes)}</span>

      <span className="flex w-20 items-center justify-center gap-1 text-sm text-neutral-700" title={staffNames.join(', ')}>
        <Users size={13} strokeWidth={1.75} className="text-neutral-400" />
        {staffNames.length || '—'}
      </span>

      <span className="flex w-28 justify-center">
        <StatusPill active={service.is_active} />
      </span>

      <div className="flex w-16 shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          aria-label={`Edit ${service.name}`}
          onClick={onEdit}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <Pencil size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={service.is_active ? `Hide ${service.name} from booking page` : `Show ${service.name} on booking page`}
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          {service.is_active ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
        </button>
      </div>
    </li>
  )
}

function ServiceForm({ businessId, service, onDone }: { businessId: string; service: Service | null; onDone: (saved: boolean) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(service?.image_url ?? null)
  const [removeImage, setRemoveImage] = useState(false)
  const [duration, setDuration] = useState(service?.duration_minutes ?? 60)
  const [active, setActive] = useState(service?.is_active ?? true)

  function pickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image must be smaller than 5MB.')
      return
    }
    setError(null)
    setRemoveImage(false)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(true)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setSaving(true)
    let imageUrl = removeImage ? null : (service?.image_url ?? null)
    if (imageFile) {
      const ext = imageFile.name.split('.').pop()
      const path = `${businessId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('service-images').upload(path, imageFile)
      if (uploadError) {
        setError(friendlyError(uploadError.message))
        setSaving(false)
        return
      }
      imageUrl = supabase.storage.from('service-images').getPublicUrl(path).data.publicUrl
    }
    const row = {
      name: formStr(f, 'name'),
      description: formStr(f, 'description'),
      duration_minutes: duration,
      buffer_minutes: Number(f.get('buffer') || 0),
      price: formStr(f, 'price') === null ? null : Number(f.get('price')),
      is_active: active,
      image_url: imageUrl,
    }
    const { error } = service
      ? await supabase.from('services').update(row).eq('id', service.id)
      : await supabase.from('services').insert({ ...row, business_id: businessId })
    setSaving(false)
    if (error) setError(friendlyError(error.message))
    else onDone(true)
  }

  const durationOptions = DURATION_PRESETS.includes(duration) ? DURATION_PRESETS : [...DURATION_PRESETS, duration].sort((a, b) => a - b)

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Service name">
        <input name="name" required defaultValue={service?.name} placeholder="e.g. Haircut" className={`${input} h-12 sm:h-auto`} />
      </Field>

      <Field label="Description" hint="Shown to customers on your booking page.">
        <input
          name="description"
          defaultValue={service?.description ?? ''}
          placeholder="e.g. Wash, cut and style"
          className={`${input} h-12 sm:h-auto`}
        />
      </Field>

      <Field label="Photo" hint="Optional. JPG or PNG, up to 5MB.">
        <div className="flex items-center gap-3">
          {imagePreview ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-neutral-200">
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          ) : (
            <label className="flex h-20 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:bg-neutral-50">
              <ImagePlus size={18} strokeWidth={1.75} />
              Add a photo
              <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </label>
          )}
          {imagePreview && (
            <label className={`${btnGhost} flex h-11 cursor-pointer items-center px-4`}>
              Replace
              <input type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </label>
          )}
        </div>
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">How long does it take?</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duration in minutes">
          {durationOptions.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={duration === n}
              onClick={() => setDuration(n)}
              className={`h-11 min-w-16 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-10 ${
                duration === n ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {fmtDuration(n)}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={5}
          step={5}
          required
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          aria-label="Duration in minutes"
          className={`${input} mt-2 h-12 sm:h-auto`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₱)" hint="Leave blank to hide the price.">
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={service?.price ?? ''}
            placeholder="0.00"
            className={`${input} h-12 sm:h-auto`}
          />
        </Field>
        <Field label="Buffer (min)" hint="Clean-up time after each booking.">
          <input
            name="buffer"
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            defaultValue={service?.buffer_minutes ?? 0}
            className={`${input} h-12 sm:h-auto`}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800">Available for booking</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {active ? 'Customers can see and book this service.' : 'Hidden from your booking page.'}
          </p>
        </div>
        <Switch checked={active} onChange={() => setActive((v) => !v)} label="Available for booking" />
      </div>

      {service && (
        <p className="text-xs text-neutral-500">
          Staff assignment for this service is managed from each staff member's page under{' '}
          <span className="font-medium text-neutral-700">Staff → Services offered</span>.
        </p>
      )}

      <ErrorText message={error} />

      <div className="flex gap-2 pt-1">
        <button type="button" className={`${btnGhost} h-11 flex-none px-4`} onClick={() => onDone(false)}>
          Cancel
        </button>
        <button className={`${btn} h-11 flex-1`} disabled={saving}>
          {saving ? 'Saving…' : service ? 'Save changes' : 'Add service'}
        </button>
      </div>
    </form>
  )
}

export default function ServicesPage() {
  const { business } = useBusiness()
  const load = useCallback(async () => {
    const [services, staff, links] = await Promise.all([
      unwrap<Service[]>(supabase.from('services').select('*').eq('business_id', business.id).order('name')),
      unwrap<Staff[]>(supabase.from('staff').select('*').eq('business_id', business.id)),
      unwrap<{ staff_id: string; service_id: string }[]>(
        supabase.from('staff_services').select('staff_id, service_id').eq('business_id', business.id),
      ),
    ])
    const staffById = new Map(staff.map((m) => [m.id, m.name]))
    const staffByService = new Map<string, string[]>()
    for (const l of links) {
      const arr = staffByService.get(l.service_id) ?? []
      const name = staffById.get(l.staff_id)
      if (name) arr.push(name)
      staffByService.set(l.service_id, arr)
    }
    return { services, staffByService }
  }, [business.id])
  const { data, loading, error, reload } = useLoad(load)
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  async function toggle(s: Service) {
    const { error } = await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id)
    setActionError(error ? friendlyError(error.message) : null)
    reload()
  }

  const summary = useMemo(() => {
    const services = data?.services ?? []
    const active = services.filter((s) => s.is_active).length
    const avgDuration = services.length ? Math.round(services.reduce((sum, s) => sum + s.duration_minutes, 0) / services.length) : 0
    return { total: services.length, active, inactive: services.length - active, avgDuration }
  }, [data])

  const filtered = useMemo(() => {
    const services = data?.services ?? []
    const q = query.trim().toLowerCase()
    return services.filter((s) => {
      if (status === 'active' && !s.is_active) return false
      if (status === 'inactive' && s.is_active) return false
      if (q && !s.name.toLowerCase().includes(q) && !s.description?.toLowerCase().includes(q)) return false
      return true
    })
  }, [data, query, status])

  if (loading)
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeaderSkeleton withAction />
        <StatGridSkeleton />
        <ListSkeleton />
      </div>
    )

  const services = data?.services ?? []
  const hasServices = services.length > 0
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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Services</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage the services your customers can book.</p>
        </div>
        <button className={`${btn} hidden items-center gap-1.5 sm:inline-flex`} onClick={() => setEditing('new')}>
          <Plus size={16} strokeWidth={1.75} /> Add Service
        </button>
      </div>

      {hasServices && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <Stat label="Total services" value={summary.total} icon={Layers} tint="bg-indigo-50" iconColor="text-indigo-600" />
          <Stat label="Active" value={summary.active} icon={Eye} tint="bg-green-50" iconColor="text-green-600" />
          <Stat label="Inactive" value={summary.inactive} icon={EyeOff} tint="bg-neutral-100" iconColor="text-neutral-500" />
          <Stat label="Avg. duration" value={fmtDuration(summary.avgDuration)} icon={Clock3} tint="bg-blue-50" iconColor="text-blue-600" />
        </div>
      )}

      <ErrorText message={error ?? actionError} />

      {hasServices && (
        <div className="flex flex-col gap-2.5 sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-3">
          <div className="relative min-w-0 sm:w-64 sm:flex-none">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services…"
              aria-label="Search services"
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

      {!hasServices ? (
        <div className={`${panel} space-y-3 py-10 text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Scissors size={20} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-800">No services yet</p>
            <p className="mt-1 text-sm text-neutral-500">Add your first service so customers can start booking.</p>
          </div>
          <button className={`${btn} inline-flex h-11 items-center gap-1.5`} onClick={() => setEditing('new')}>
            <Plus size={16} strokeWidth={1.75} /> Add Service
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${panel} space-y-3 py-10 text-center`}>
          <div>
            <p className="text-sm font-medium text-neutral-800">No services match</p>
            <p className="mt-1 text-sm text-neutral-500">Try a different search term or filter.</p>
          </div>
          <button type="button" className={`${btnGhost} inline-flex h-11 items-center px-4`} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className={`${panel} !p-0`}>
          <div className="hidden items-center gap-4 border-b border-neutral-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400 sm:flex">
            <span className="flex-1">Service</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-24 text-right">Duration</span>
            <span className="w-20 text-center">Staff</span>
            <span className="w-28 text-center">Status</span>
            <span className="w-16 text-right">Actions</span>
          </div>
          <ul className="divide-y divide-neutral-100 sm:px-4">
            {filtered.map((s) => {
              const staffNames = data?.staffByService.get(s.id) ?? []
              const onEdit = () => setEditing(s)
              const onToggle = () => toggle(s)
              // Card and row are genuinely different layouts, so each breakpoint gets its own
              // markup rather than one row bent into both shapes. Only one is ever displayed.
              return (
                <Fragment key={s.id}>
                  <ServiceCard service={s} staffCount={staffNames.length} onEdit={onEdit} onToggle={onToggle} />
                  <ServiceRow service={s} staffNames={staffNames} onEdit={onEdit} onToggle={onToggle} />
                </Fragment>
              )
            })}
          </ul>
        </div>
      )}

      {isFiltering && filtered.length > 0 && (
        <p className="px-1 text-xs text-neutral-400">
          Showing {filtered.length} of {summary.total} services
        </p>
      )}

      {/* Mobile floating action button */}
      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Add service"
        className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:hidden"
      >
        <Plus size={24} strokeWidth={2} />
      </button>

      {/* The editor is a focus-trapped bottom sheet on phones, so it never pushes the list around */}
      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          titleId="service-form-title"
          title={editing === 'new' ? 'New service' : 'Edit service'}
          maxWidth="max-w-lg"
        >
          <ServiceForm
            key={editing === 'new' ? 'new' : editing.id}
            businessId={business.id}
            service={editing === 'new' ? null : editing}
            onDone={(saved) => {
              setEditing(null)
              if (saved) reload()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
