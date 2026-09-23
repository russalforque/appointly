import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Image,
  Link as LinkIcon,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/db'
import { btn, btnGhost, contrastRatio, input, panel } from '../../lib/ui'
import { initials } from '../../lib/format'
import Field from '../../components/Field'
import { ErrorText, Saved } from '../../components/Status'
import type { Business } from '../../lib/types'
import { useBusiness } from './useBusiness'

const DESCRIPTION_MAX = 500
const ABOUT_MAX = 2000

const ACCENT_PRESETS = ['#18257d', '#4f46e5', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777', '#171717']

/** Single-line inputs get a 44px touch target on phones, desktop sizing from sm up. */
const field = `${input} !h-11 sm:!h-auto`

type FormValues = {
  name: string
  category: string
  description: string
  about: string
  phone: string
  email: string
  address: string
  logo_url: string
  cover_image_url: string
  accent_color: string
}

function valuesOf(b: Business): FormValues {
  return {
    name: b.name ?? '',
    category: b.category ?? '',
    description: b.description ?? '',
    about: b.about ?? '',
    phone: b.phone ?? '',
    email: b.email ?? '',
    address: b.address ?? '',
    logo_url: b.logo_url ?? '',
    cover_image_url: b.cover_image_url ?? '',
    accent_color: b.accent_color ?? '#18257d',
  }
}

export default function ProfilePage() {
  const { business: b, reload } = useBusiness()
  const [initial, setInitial] = useState<FormValues>(() => valuesOf(b))
  const [values, setValues] = useState<FormValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const siteUrl = `${window.location.origin}/book/${b.slug}`

  const isDirty = useMemo(
    () => (Object.keys(values) as (keyof FormValues)[]).some((k) => values[k] !== initial[k]),
    [values, initial],
  )

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setSaved(false)
  }

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(timer)
  }, [saved])

  const accentContrast = contrastRatio(values.accent_color || '#18257d', '#ffffff')
  const lowContrast = accentContrast < 3

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving || !isDirty) return
    setSaving(true)
    setSaved(false)
    const { error } = await supabase.from('businesses').update(values).eq('id', b.id)
    setSaving(false)
    setError(error ? friendlyError(error.message) : null)
    if (!error) {
      setSaved(true)
      setInitial(values)
      reload()
    }
  }

  function discard() {
    setValues(initial)
    setError(null)
    setSaved(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(siteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <form key={b.id} onSubmit={submit} className="mx-auto max-w-5xl">
      {/* Desktop: sticky action bar keeps Save/Discard reachable down the whole form */}
      <div className="sticky top-0 z-10 -mx-8 hidden flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 bg-neutral-50/95 px-8 py-4 backdrop-blur md:flex">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">Business Profile</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage the information customers see on your booking page.</p>
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
          <button className={`${btn} flex items-center gap-1.5`} disabled={saving || !isDirty}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={1.75} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Mobile: plain header that scrolls away — actions live in the bottom bar, within thumb reach */}
      <div className="flex items-start justify-between gap-3 pt-1 md:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Business Profile</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage what customers see on your booking page.</p>
        </div>
        {isDirty && (
          <span className="mt-1 flex flex-none items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
        )}
      </div>

      <div className="space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:space-y-6 md:pb-6 md:pt-6">
        {/* Hero: one live preview of how customers see the business, doubling as the public-link card */}
        <div className={`${panel} overflow-hidden !p-0`}>
          <div
            className="h-24 bg-neutral-100 bg-cover bg-center sm:h-36"
            style={values.cover_image_url ? { backgroundImage: `url(${values.cover_image_url})` } : undefined}
          />
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="-mt-9 flex items-end gap-3 sm:-mt-12 sm:gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-900 text-lg font-semibold text-white ring-4 ring-white sm:h-20 sm:w-20 sm:text-xl">
                {values.logo_url ? (
                  <img
                    src={values.logo_url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => set('logo_url', '')}
                  />
                ) : (
                  initials(values.name || 'B')
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-[17px] font-semibold text-neutral-900 sm:text-[19px]">
                    {values.name || 'Your business'}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                </div>
                <p className="truncate text-sm text-neutral-500">{values.category || 'No category set'}</p>
              </div>
              <span
                className="hidden shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm sm:inline-block"
                style={{ backgroundColor: values.accent_color }}
              >
                Book now
              </span>
            </div>

            {/* Accent preview reads as a real button at phone width instead of a wrapped chip */}
            <span
              className="mt-3 flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-white shadow-sm sm:hidden"
              style={{ backgroundColor: values.accent_color }}
            >
              Book now
            </span>

            <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-sm text-neutral-600 sm:mt-4 sm:flex sm:items-center sm:gap-2 sm:px-3 sm:py-2">
              <div className="flex min-w-0 items-center gap-2 sm:flex-1">
                <LinkIcon size={14} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate">{siteUrl}</span>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0 sm:items-center sm:gap-1.5">
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnGhost} flex h-10 items-center justify-center gap-1.5 sm:h-auto sm:!py-1`}
                >
                  <ExternalLink size={13} strokeWidth={1.75} />
                  Preview
                </a>
                <button
                  type="button"
                  onClick={copyLink}
                  className={`${btnGhost} flex h-10 items-center justify-center gap-1.5 sm:h-auto sm:!py-1`}
                >
                  {copied ? <Check size={13} strokeWidth={1.75} /> : <Copy size={13} strokeWidth={1.75} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="space-y-4 sm:space-y-6 lg:col-span-2">
            {/* Business information */}
            <section className={`${panel} space-y-4`}>
              <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <Building2 size={14} strokeWidth={2} />
                </span>
                Business Information
              </h2>
              <Field label="Business name">
                <input
                  required
                  value={values.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Bright Smile Dental Clinic"
                  autoComplete="organization"
                  className={field}
                />
              </Field>
              <Field label="Category">
                <input
                  value={values.category}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="e.g. Salon, Spa, Clinic, Barbershop"
                  className={field}
                />
              </Field>
              <Field label="Description" hint="This description may appear on your public booking page.">
                <div>
                  <textarea
                    rows={3}
                    maxLength={DESCRIPTION_MAX}
                    value={values.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Tell customers what makes your business worth booking."
                    className={input}
                  />
                  <p
                    className={`mt-1 text-right text-xs ${
                      values.description.length >= DESCRIPTION_MAX ? 'text-amber-600' : 'text-neutral-400'
                    }`}
                  >
                    {values.description.length}/{DESCRIPTION_MAX}
                  </p>
                </div>
              </Field>
              <Field label="About" hint="A longer story about your business, shown in the About section of your booking page.">
                <div>
                  <textarea
                    rows={6}
                    maxLength={ABOUT_MAX}
                    value={values.about}
                    onChange={(e) => set('about', e.target.value)}
                    placeholder="Share your business's story, mission, or what sets you apart."
                    className={input}
                  />
                  <p
                    className={`mt-1 text-right text-xs ${
                      values.about.length >= ABOUT_MAX ? 'text-amber-600' : 'text-neutral-400'
                    }`}
                  >
                    {values.about.length}/{ABOUT_MAX}
                  </p>
                </div>
              </Field>
            </section>

            {/* Contact information */}
            <section className={`${panel} space-y-4`}>
              <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Phone size={14} strokeWidth={2} />
                </span>
                Contact Information
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Phone">
                  <div className="relative">
                    <Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={values.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className={`${field} !pl-9`}
                    />
                  </div>
                </Field>
                <Field label="Email">
                  <div className="relative">
                    <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={values.email}
                      onChange={(e) => set('email', e.target.value)}
                      placeholder="hello@yourbusiness.com"
                      className={`${field} !pl-9`}
                    />
                  </div>
                </Field>
              </div>
              <Field label="Address">
                <div className="relative">
                  <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    autoComplete="street-address"
                    value={values.address}
                    onChange={(e) => set('address', e.target.value)}
                    placeholder="Street, city, state"
                    className={`${field} !pl-9`}
                  />
                </div>
              </Field>
            </section>
          </div>

          {/* Branding — the only controls that feed the hero preview above */}
          <div className="space-y-4 sm:space-y-6">
            <section className={`${panel} space-y-4`}>
              <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-neutral-900">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-violet-50 text-violet-600">
                  <Image size={14} strokeWidth={2} />
                </span>
                Branding
              </h2>
              <Field label="Logo URL" hint="Paste a hosted image link to use as your logo.">
                <div className="flex gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={values.logo_url}
                    onChange={(e) => set('logo_url', e.target.value)}
                    placeholder="https://..."
                    className={field}
                  />
                  {values.logo_url && (
                    <button
                      type="button"
                      onClick={() => set('logo_url', '')}
                      className={`${btnGhost} h-11 shrink-0 sm:h-auto`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Cover image URL" hint="Shown as the banner on your public booking page.">
                <input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={values.cover_image_url}
                  onChange={(e) => set('cover_image_url', e.target.value)}
                  placeholder="https://..."
                  className={field}
                />
              </Field>
              <Field label="Accent color" hint="Used for buttons and highlights on your booking page.">
                <div className="flex items-center gap-2.5">
                  <input
                    type="color"
                    value={values.accent_color}
                    onChange={(e) => set('accent_color', e.target.value)}
                    className="h-11 w-16 rounded-md border border-neutral-300 sm:h-10"
                  />
                  <span className="font-mono text-sm uppercase text-neutral-500">{values.accent_color}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => set('accent_color', color)}
                      aria-label={`Use ${color} as accent color`}
                      aria-pressed={values.accent_color.toLowerCase() === color}
                      title={color}
                      className={`h-9 w-9 rounded-full outline-none transition-transform active:scale-95 hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:h-6 sm:w-6 ${
                        values.accent_color.toLowerCase() === color ? 'ring-2 ring-neutral-900 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                {lowContrast && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                    <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0" />
                    Low contrast against white button text — customers may struggle to read it.
                  </p>
                )}
              </Field>
            </section>
          </div>
        </div>
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
          <button className={`${btn} flex h-11 flex-1 items-center justify-center gap-1.5`} disabled={saving || !isDirty}>
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
            Profile saved
          </span>
        </div>
      )}
    </form>
  )
}
