import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowUpRight, Check, CheckCircle2, ChevronDown, Circle, CircleAlert, Clock3, Copy, Eye, EyeOff,
  Globe, Loader2, Mail, MapPinned, Phone, Settings2, Share,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { friendlyError, unwrap } from '../../lib/db'
import { contrastRatio, panel } from '../../lib/ui'
import { fmtClock } from '../../lib/format'
import { copyText, shareLink } from '../../lib/share'
import { useToast } from '../../lib/toast'
import { useConfirm } from '../../lib/confirm'
import { useLoad } from '../../lib/useLoad'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { useUnsavedChangesGuard } from '../../lib/useUnsavedChangesGuard'
import { bucketPathOf, removeObjects } from '../../lib/storage'
import { POLICY_FIELDS, type PolicyKey } from '../../lib/publicBusiness'
import type { BusinessSettings } from '../../lib/types'
import Select from '../../components/Select'
import Modal from '../../components/Modal'
import SettingsHeader from '../../components/SettingsHeader'
import { Bone } from '../../components/Status'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '../../components/SocialIcons'
import UpgradeNotice from '../../components/UpgradeNotice'
import { useBusiness } from './useBusiness'
import {
  ACCENT_PRESETS, CATEGORIES, DEFAULT_ACCENT, HEX, LIMITS, SLUG, SLUG_MAX, SLUG_MIN,
  changedRow, completeness, normalizeHex, normalizeUrl, sameValues, sanitizeSlug, validate, valuesOf,
  type Errors, type FieldKey, type FormValues,
} from './profile/profileModel'
import { FormField, IconInput, Section, VisibilityToggle } from './profile/FormControls'
import { areaCls, describe, fieldCls } from './profile/formStyles'
import ImageUpload, { BRANDING_BUCKET } from './profile/ImageUpload'
import ProfilePreview from './profile/ProfilePreview'

const fid = (k: FieldKey) => `pf-${k}`

const DAYS: [string, string][] = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
]

const NAV: [string, string][] = [
  ['profile', 'Profile'],
  ['branding', 'Branding'],
  ['contact', 'Contact'],
  ['social', 'Social'],
  ['booking-page', 'Booking page'],
  ['hours', 'Hours & rules'],
  ['policies', 'Policies'],
  ['messages', 'Messages'],
]

const POLICY_EXAMPLES: Record<PolicyKey, string> = {
  cancellation_policy: 'Please cancel at least 24 hours before your appointment so we can offer the time to someone else.',
  reschedule_policy: 'You can reschedule once, up to 24 hours before your appointment. Contact us to arrange a new time.',
  late_policy: 'If you arrive more than 15 minutes late, we may need to shorten or reschedule your appointment.',
  no_show_policy: 'Missed appointments without notice may require a deposit for future bookings.',
}

type SlugCheck = 'checking' | 'free' | 'taken' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

const hoursLabel = (h: number) => (h % 24 === 0 && h >= 24 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hr${h === 1 ? '' : 's'}`)

function SaveStatus({ state, dirty, invalid }: { state: SaveState; dirty: boolean; invalid: number }) {
  const pill = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'
  if (state === 'saving')
    return (
      <span className={`${pill} bg-neutral-100 text-neutral-600`} role="status">
        <Loader2 size={12} className="animate-spin" aria-hidden /> Saving…
      </span>
    )
  if (dirty && state === 'failed')
    return (
      <span className={`${pill} bg-red-50 text-red-700`} role="status">
        <CircleAlert size={12} aria-hidden /> Not saved
      </span>
    )
  if (dirty)
    return (
      <span className={`${pill} bg-amber-50 text-amber-700`} role="status">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        {invalid > 0 ? `${invalid} to fix` : 'Unsaved changes'}
      </span>
    )
  if (state === 'saved')
    return (
      <span className={`${pill} bg-emerald-50 text-emerald-700`} role="status">
        <Check size={12} strokeWidth={2.5} aria-hidden /> All changes saved
      </span>
    )
  return null
}

/** A read-only row in the hours/rules summary. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-800">{children}</dd>
    </div>
  )
}

export default function ProfilePage() {
  const { business: b, reload, can } = useBusiness()
  const policiesLocked = !can.bookingPolicies
  const toast = useToast()
  const confirm = useConfirm()
  const wide = useMediaQuery('(min-width: 1280px)')

  const loadSettings = useCallback(
    () => unwrap<BusinessSettings>(supabase.from('business_settings').select('*').eq('business_id', b.id).single()),
    [b.id],
  )
  const { data: settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useLoad(loadSettings)

  const [initial, setInitial] = useState<FormValues>(() => valuesOf(b))
  const [values, setValues] = useState<FormValues>(initial)
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Errors>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const [uploads, setUploads] = useState({ logo: false, cover: false })
  const [customCategory, setCustomCategory] = useState(() => !!initial.category && !CATEGORIES.includes(initial.category))
  const [openPolicies, setOpenPolicies] = useState<Partial<Record<PolicyKey, boolean>>>({})
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('mobile')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [slugCheck, setSlugCheck] = useState<{ slug: string; state: SlugCheck } | null>(null)
  // Files uploaded in this editing session but not yet saved; deleted again if the edit is discarded.
  const pendingUploads = useRef<string[]>([])

  const saving = saveState === 'saving'
  const uploading = uploads.logo || uploads.cover
  const isDirty = !sameValues(values, initial)
  useUnsavedChangesGuard(isDirty)

  const liveUrl = `${window.location.origin}/book/${initial.slug}`
  const slugChanged = values.slug !== initial.slug
  const slugShapeOk = values.slug.length >= SLUG_MIN && SLUG.test(values.slug)
  const slugState: SlugCheck | null = !slugChanged || !slugShapeOk ? null : slugCheck?.slug === values.slug ? slugCheck.state : 'checking'

  // Debounced availability lookup; the unique index is still the real guarantee on save.
  useEffect(() => {
    if (!slugChanged || !slugShapeOk) return
    let cancelled = false
    const slug = values.slug
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('is_slug_available', { p_slug: slug })
      if (!cancelled) setSlugCheck({ slug, state: error ? 'error' : data ? 'free' : 'taken' })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [values.slug, slugChanged, slugShapeOk])

  const errors = useMemo<Errors>(() => {
    const e = { ...validate(values), ...serverErrors }
    if (!e.slug && slugState === 'taken') e.slug = 'That link is already taken. Try adding your city or branch.'
    return e
  }, [values, serverErrors, slugState])
  const errorKeys = (Object.keys(errors) as FieldKey[]).filter((k) => errors[k])
  const shown = (k: FieldKey) => (showAllErrors || touched[k] ? errors[k] : undefined)

  function set<K extends FieldKey>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    if (serverErrors[key]) setServerErrors((e) => ({ ...e, [key]: undefined }))
    if (saveState !== 'saving') setSaveState('idle')
  }
  const touch = (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }))

  /** value/onChange/onBlur/aria for a plain text control. */
  function text(k: FieldKey, opts: { url?: boolean } = {}) {
    return {
      ...describe(fid(k), shown(k)),
      value: values[k] as string,
      onChange: (e: { target: { value: string } }) => set(k, e.target.value),
      onBlur: () => {
        if (opts.url && values[k]) set(k, normalizeUrl(values[k] as string))
        touch(k)
      },
    }
  }

  const accentOk = HEX.test(values.accent_color)
  const lowContrast = accentOk && contrastRatio(values.accent_color, '#ffffff') < 3
  const workingHours = settings?.working_hours ?? null
  const hasHours = !!workingHours && Object.values(workingHours).some((h) => h?.length)
  const progress = completeness(values, hasHours)

  async function cleanupAfterSave(saved: FormValues, previous: FormValues) {
    const keep = new Set([bucketPathOf(BRANDING_BUCKET, saved.logo_url), bucketPathOf(BRANDING_BUCKET, saved.cover_image_url)])
    const replaced = [previous.logo_url, previous.cover_image_url]
      .filter((url, i) => url !== [saved.logo_url, saved.cover_image_url][i])
      .map((url) => bucketPathOf(BRANDING_BUCKET, url))
    const orphans = [...pendingUploads.current, ...replaced].filter((p): p is string => !!p && !keep.has(p))
    pendingUploads.current = []
    await removeObjects(BRANDING_BUCKET, [...new Set(orphans)])
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving || !isDirty || uploading) return
    setShowAllErrors(true)
    if (errorKeys.length > 0) {
      setFormError(`Fix ${errorKeys.length === 1 ? 'the highlighted field' : `the ${errorKeys.length} highlighted fields`} before saving.`)
      setSaveState('failed')
      const first = document.getElementById(fid(errorKeys[0]))
      first?.focus({ preventScroll: true })
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (slugChanged) {
      const ok = await confirm({
        title: 'Change your booking link?',
        body: `Your page will move to /book/${values.slug}. The old link (/book/${initial.slug}) will stop working, so update it anywhere you've shared it.`,
        confirmLabel: 'Change link',
      })
      if (!ok) return
    }
    if (initial.is_active && !values.is_active) {
      const ok = await confirm({
        title: 'Hide your booking page?',
        body: 'Customers will no longer be able to open your page or make new bookings. Existing bookings are not affected.',
        confirmLabel: 'Hide page',
        tone: 'danger',
      })
      if (!ok) return
    }

    const snapshot = values
    const previous = initial
    setSaveState('saving')
    setFormError(null)
    const { error } = await supabase.from('businesses').update(changedRow(snapshot, previous)).eq('id', b.id)
    if (error) {
      const duplicateSlug = /duplicate key/i.test(error.message) && /slug/i.test(error.message)
      if (duplicateSlug) setServerErrors({ slug: 'That link is already taken. Try adding your city or branch.' })
      setFormError(duplicateSlug ? 'That booking link is already taken.' : friendlyError(error.message))
      setSaveState('failed')
      return
    }
    setInitial(snapshot)
    setTouched({})
    setShowAllErrors(false)
    setSaveState('saved')
    toast('Business profile saved')
    reload()
    cleanupAfterSave(snapshot, previous)
  }

  function discard() {
    const keep = new Set([bucketPathOf(BRANDING_BUCKET, initial.logo_url), bucketPathOf(BRANDING_BUCKET, initial.cover_image_url)])
    removeObjects(BRANDING_BUCKET, pendingUploads.current.filter((p) => !keep.has(p)))
    pendingUploads.current = []
    setValues(initial)
    setCustomCategory(!!initial.category && !CATEGORIES.includes(initial.category))
    setTouched({})
    setShowAllErrors(false)
    setServerErrors({})
    setFormError(null)
    setSaveState('idle')
  }

  const preview = (
    <ProfilePreview values={values} workingHours={workingHours} mode={previewMode} onModeChange={setPreviewMode} />
  )

  const contactIcons = { phone: Phone, email: Mail }

  return (
    <form id="profile-form" key={b.id} onSubmit={submit} noValidate className="mx-auto max-w-7xl">
      <SettingsHeader
        title="Business Profile"
        subtitle="Your business identity and what customers see on your booking page."
        form="profile-form"
        dirty={isDirty}
        saving={saving}
        error={formError}
        onDiscard={discard}
        canSave={!uploading}
        status={<SaveStatus state={saveState} dirty={isDirty} invalid={showAllErrors ? errorKeys.length : 0} />}
      />

      <div className="grid gap-8 pt-4 md:pt-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          {/* Booking link: the one thing owners come here to grab, so it leads the page */}
          <div className={`${panel} !p-4 sm:!p-5`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    initial.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {initial.is_active ? <Globe size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                    Booking page
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        initial.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${initial.is_active ? 'bg-emerald-500' : 'bg-neutral-400'}`} aria-hidden />
                      {initial.is_active ? 'Live' : 'Hidden'}
                    </span>
                  </p>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-neutral-500 underline-offset-2 hover:text-brand-700 hover:underline"
                  >
                    {liveUrl.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0 xl:grid-cols-2">
                <button
                  type="button"
                  onClick={() => copyText(liveUrl, toast)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
                >
                  <Copy size={14} aria-hidden /> Copy<span className="hidden sm:inline"> link</span>
                </button>
                <button
                  type="button"
                  onClick={() => shareLink(liveUrl, initial.name, toast)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 sm:hidden"
                >
                  <Share size={14} aria-hidden /> Share
                </button>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-brand-600 sm:h-9"
                >
                  <ArrowUpRight size={14} aria-hidden /> Open
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="col-span-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:h-9 xl:hidden"
                >
                  <Eye size={14} aria-hidden /> Preview
                </button>
              </div>
            </div>
            {isDirty && (
              <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                The live page shows your last saved version. Preview reflects your unsaved edits.
              </p>
            )}
          </div>

          {/* Jump links: the page is long on phones, and owners usually come back for one thing */}
          <nav aria-label="Profile sections" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="flex h-9 flex-none items-center rounded-full border border-neutral-200 bg-white px-3.5 text-xs font-medium text-neutral-600 outline-none transition-colors hover:border-neutral-300 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className={`${panel} divide-y divide-neutral-100 !py-0 sm:!px-8`}>
            {/* ------------------------------------------------------------- Profile */}
            <Section id="profile" title="Profile" description="Who you are. Your name, category and tagline lead your booking page.">
              <div>
                <span className="mb-2 block text-sm font-medium text-neutral-800">Logo</span>
                <ImageUpload
                  kind="logo"
                  value={values.logo_url}
                  businessId={b.id}
                  businessName={values.name}
                  onChange={(url) => set('logo_url', url)}
                  onUploaded={(p) => pendingUploads.current.push(p)}
                  onBusyChange={(busy) => setUploads((u) => ({ ...u, logo: busy }))}
                />
              </div>

              <FormField id={fid('name')} label="Business name" error={shown('name')} count={values.name.length} max={LIMITS.name}>
                <input
                  {...text('name')}
                  maxLength={LIMITS.name}
                  placeholder="e.g. Bright Smile Dental Clinic"
                  autoComplete="organization"
                  className={fieldCls(!!shown('name'))}
                />
              </FormField>

              <FormField
                id={fid('category')}
                label="Category"
                hint="Shown above your name and used to describe your business in search results."
                error={shown('category')}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    id={customCategory ? undefined : fid('category')}
                    aria-label={customCategory ? 'Category type' : undefined}
                    value={customCategory ? '__other' : values.category}
                    onChange={(e) => {
                      if (e.target.value === '__other') {
                        setCustomCategory(true)
                        set('category', '')
                      } else {
                        setCustomCategory(false)
                        set('category', e.target.value)
                      }
                    }}
                    className={fieldCls()}
                  >
                    <option value="">No category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__other">Other (type your own)</option>
                  </Select>
                  {customCategory && (
                    <input
                      {...text('category')}
                      maxLength={LIMITS.category}
                      placeholder="e.g. Orthodontics"
                      autoFocus
                      className={fieldCls(!!shown('category'))}
                    />
                  )}
                </div>
              </FormField>

              <FormField
                id={fid('tagline')}
                label="Tagline"
                optional
                hint="One short line under your name, e.g. “Gentle family dentistry in Makati”."
                error={shown('tagline')}
                count={values.tagline.length}
                max={LIMITS.tagline}
              >
                <input {...text('tagline')} maxLength={LIMITS.tagline} className={fieldCls(!!shown('tagline'))} />
              </FormField>

              <FormField
                id={fid('description')}
                label="Short description"
                optional
                hint="A sentence or two in your page header, and the summary shown when your link is shared."
                error={shown('description')}
                count={values.description.length}
                max={LIMITS.description}
              >
                <textarea
                  {...text('description')}
                  rows={3}
                  maxLength={LIMITS.description}
                  placeholder="Tell customers what makes your business worth booking."
                  className={areaCls(!!shown('description'))}
                />
              </FormField>

              <FormField
                id={fid('about')}
                label="About"
                optional
                hint="Your story, team or approach — its own section further down your page."
                error={shown('about')}
                count={values.about.length}
                max={LIMITS.about}
              >
                <textarea
                  {...text('about')}
                  rows={5}
                  maxLength={LIMITS.about}
                  placeholder="Share your business's story, mission, or what sets you apart."
                  className={areaCls(!!shown('about'))}
                />
              </FormField>
            </Section>

            {/* ------------------------------------------------------------- Branding */}
            <Section id="branding" title="Branding" description="The banner and colour that make your page look like yours.">
              <div>
                <span className="mb-2 block text-sm font-medium text-neutral-800">Cover image</span>
                <ImageUpload
                  kind="cover"
                  value={values.cover_image_url}
                  businessId={b.id}
                  businessName={values.name}
                  onChange={(url) => set('cover_image_url', url)}
                  onUploaded={(p) => pendingUploads.current.push(p)}
                  onBusyChange={(busy) => setUploads((u) => ({ ...u, cover: busy }))}
                />
              </div>

              <FormField
                id={fid('accent_color')}
                label="Accent color"
                hint={!shown('accent_color') && !lowContrast ? 'Used for buttons, highlights and the selected day on your page.' : undefined}
                error={shown('accent_color')}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentOk ? values.accent_color : DEFAULT_ACCENT}
                      onChange={(e) => set('accent_color', e.target.value)}
                      aria-label="Pick accent color"
                      className="h-11 w-12 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1 sm:h-10"
                    />
                    <input
                      {...describe(fid('accent_color'), shown('accent_color'))}
                      value={values.accent_color}
                      onChange={(e) => set('accent_color', e.target.value)}
                      onBlur={() => {
                        set('accent_color', normalizeHex(values.accent_color))
                        touch('accent_color')
                      }}
                      maxLength={7}
                      spellCheck={false}
                      autoCapitalize="none"
                      aria-label="Accent color hex code"
                      className={`${fieldCls(!!shown('accent_color'))} !w-28 font-mono uppercase`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Suggested colors">
                    {ACCENT_PRESETS.map((color) => {
                      const on = values.accent_color.toLowerCase() === color
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => set('accent_color', color)}
                          aria-label={`Use ${color}`}
                          aria-pressed={on}
                          title={color}
                          className={`grid h-9 w-9 place-items-center rounded-full outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:scale-95 sm:h-7 sm:w-7 ${
                            on ? 'ring-2 ring-neutral-900 ring-offset-2' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {on && <Check size={13} strokeWidth={3} className="text-white" aria-hidden />}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* What the colour actually does, at full size */}
                {accentOk && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3">
                    <span className="rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: values.accent_color }}>
                      Book Appointment
                    </span>
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ backgroundColor: `color-mix(in srgb, ${values.accent_color} 10%, white)`, color: values.accent_color }}
                    >
                      Today
                    </span>
                    <span className="text-sm font-semibold" style={{ color: values.accent_color }}>
                      Change
                    </span>
                  </div>
                )}
                {lowContrast && !shown('accent_color') && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle size={13} className="shrink-0" aria-hidden />
                    Low contrast with white button text — a darker shade will be easier to read.
                  </p>
                )}
              </FormField>
            </Section>

            {/* ------------------------------------------------------------- Contact */}
            <Section
              id="contact"
              title="Contact & location"
              description="How customers reach and find you. Switch off anything you'd rather keep off your public page."
            >
              <div className="grid gap-5 md:grid-cols-2">
                {(['phone', 'email'] as const).map((k) => {
                  const showKey = k === 'phone' ? 'show_phone' : 'show_email'
                  return (
                    <FormField
                      key={k}
                      id={fid(k)}
                      label={k === 'phone' ? 'Phone' : 'Email'}
                      optional
                      error={shown(k)}
                      hint={values[k] && !values[showKey] ? 'Hidden from customers.' : undefined}
                      aside={<VisibilityToggle visible={values[showKey]} onChange={(v) => set(showKey, v)} what={k === 'phone' ? 'phone number' : 'email'} />}
                    >
                      <IconInput
                        {...text(k)}
                        icon={contactIcons[k]}
                        invalid={!!shown(k)}
                        {...(k === 'phone'
                          ? { type: 'tel', inputMode: 'tel' as const, autoComplete: 'tel', maxLength: LIMITS.phone, placeholder: '+63 917 000 0000' }
                          : {
                              type: 'email',
                              inputMode: 'email' as const,
                              autoComplete: 'email',
                              autoCapitalize: 'none',
                              spellCheck: false,
                              maxLength: LIMITS.email,
                              placeholder: 'hello@yourbusiness.com',
                            })}
                      />
                    </FormField>
                  )
                })}
              </div>

              <FormField id={fid('website_url')} label="Website" optional error={shown('website_url')}>
                <IconInput
                  {...text('website_url', { url: true })}
                  icon={Globe}
                  invalid={!!shown('website_url')}
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="https://yourbusiness.com"
                />
              </FormField>

              <fieldset className="space-y-3 rounded-xl border border-neutral-200 p-3.5 sm:p-4">
                <legend className="sr-only">Address</legend>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-neutral-800">
                    Address <span className="font-normal text-neutral-400">(optional)</span>
                  </span>
                  <VisibilityToggle visible={values.show_address} onChange={(v) => set('show_address', v)} what="address" />
                </div>
                <FormField id={fid('address')} label="Street address" error={shown('address')}>
                  <input
                    {...text('address')}
                    maxLength={LIMITS.address}
                    autoComplete="street-address"
                    placeholder="Unit, building, street"
                    className={fieldCls(!!shown('address'))}
                  />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
                  <FormField id={fid('city')} label="City" error={shown('city')}>
                    <input {...text('city')} maxLength={LIMITS.city} autoComplete="address-level2" className={fieldCls(!!shown('city'))} />
                  </FormField>
                  <FormField id={fid('region')} label="Province / State" error={shown('region')}>
                    <input {...text('region')} maxLength={LIMITS.region} autoComplete="address-level1" className={fieldCls(!!shown('region'))} />
                  </FormField>
                  <FormField id={fid('postal_code')} label="Postal code" error={shown('postal_code')}>
                    <input
                      {...text('postal_code')}
                      maxLength={LIMITS.postal_code}
                      autoComplete="postal-code"
                      className={fieldCls(!!shown('postal_code'))}
                    />
                  </FormField>
                </div>
                <FormField
                  id={fid('maps_url')}
                  label="Map link"
                  optional
                  error={shown('maps_url')}
                  hint="Paste a Google Maps link for exact directions. Left blank, we'll search your address."
                >
                  <IconInput
                    {...text('maps_url', { url: true })}
                    icon={MapPinned}
                    invalid={!!shown('maps_url')}
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="https://maps.app.goo.gl/…"
                  />
                </FormField>
                {!values.show_address && (values.address || values.city) && (
                  <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <EyeOff size={13} aria-hidden /> Your address is hidden from customers, including on booking confirmations.
                  </p>
                )}
              </fieldset>
            </Section>

            {/* ------------------------------------------------------------- Social */}
            <Section id="social" title="Social links" description="Optional. Shown as icons in the contact section of your page.">
              {(
                [
                  ['facebook_url', 'Facebook', FacebookIcon, 'https://facebook.com/yourpage'],
                  ['instagram_url', 'Instagram', InstagramIcon, 'https://instagram.com/yourhandle'],
                  ['tiktok_url', 'TikTok', TikTokIcon, 'https://tiktok.com/@yourhandle'],
                ] as const
              ).map(([k, label, Icon, placeholder]) => (
                <FormField key={k} id={fid(k)} label={label} error={shown(k)}>
                  <IconInput
                    {...text(k, { url: true })}
                    icon={Icon}
                    invalid={!!shown(k)}
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={placeholder}
                  />
                </FormField>
              ))}
            </Section>

            {/* ------------------------------------------------------------- Booking page */}
            <Section id="booking-page" title="Booking page" description="Whether your page is open to customers, and the address it lives at.">
              <div role="radiogroup" aria-label="Booking page status" className="grid gap-2.5 sm:grid-cols-2">
                {(
                  [
                    [true, Globe, 'Live', 'Anyone with the link can view and book.'],
                    [false, EyeOff, 'Hidden', 'Only you can see it. No new bookings.'],
                  ] as const
                ).map(([active, Icon, title, body]) => {
                  const on = values.is_active === active
                  return (
                    <button
                      key={title}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set('is_active', active)}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                        on ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
                          on ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-900">{title}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500">{body}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <FormField
                id={fid('slug')}
                label="Booking link"
                error={shown('slug') ?? (slugState === 'taken' ? errors.slug : undefined)}
                hint={
                  slugState === 'checking' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" aria-hidden /> Checking availability…
                    </span>
                  ) : slugState === 'free' ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <Check size={12} strokeWidth={2.5} aria-hidden /> Available. Your old link stops working once you save.
                    </span>
                  ) : slugState === 'error' ? (
                    "Couldn't check availability — we'll confirm when you save."
                  ) : (
                    `Lowercase letters, numbers and dashes, ${SLUG_MIN}–${SLUG_MAX} characters.`
                  )
                }
              >
                <div
                  className={`flex h-11 items-stretch overflow-hidden rounded-md border bg-white text-sm transition-colors focus-within:ring-2 sm:h-10 ${
                    shown('slug') || slugState === 'taken'
                      ? 'border-red-400 focus-within:ring-red-500/15'
                      : 'border-slate-300 focus-within:border-brand-600 focus-within:ring-brand-600/15'
                  }`}
                >
                  <span className="hidden items-center border-r border-neutral-200 bg-neutral-50 px-3 text-neutral-500 sm:flex">
                    {window.location.host}/book/
                  </span>
                  <span className="flex items-center bg-neutral-50 pl-3 text-neutral-500 sm:hidden">/book/</span>
                  <input
                    {...describe(fid('slug'), shown('slug'))}
                    value={values.slug}
                    onChange={(e) => set('slug', sanitizeSlug(e.target.value))}
                    onBlur={() => {
                      set('slug', values.slug.replace(/-+$/, ''))
                      touch('slug')
                    }}
                    maxLength={SLUG_MAX}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent px-2 outline-none sm:px-3"
                  />
                  {slugChanged && (
                    <button
                      type="button"
                      onClick={() => set('slug', initial.slug)}
                      className="shrink-0 px-3 text-xs font-medium text-neutral-500 hover:text-neutral-900"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </FormField>
            </Section>

            {/* ------------------------------------------------------------- Hours & rules (read-only) */}
            <Section
              id="hours"
              title="Hours & booking rules"
              description="Shown on your page and used to offer times. Each has its own settings page, so they're summarized here."
            >
              {settingsLoading ? (
                <div className="space-y-2" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Bone key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : settingsError || !settings ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700">
                  Couldn't load your hours.
                  <button type="button" onClick={reloadSettings} className="font-medium underline underline-offset-2">
                    Try again
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        <Clock3 size={15} className="text-neutral-400" aria-hidden /> Business hours
                      </p>
                      <Link to="/dashboard/hours" className="text-sm font-medium text-brand-700 hover:underline">
                        Edit
                      </Link>
                    </div>
                    {hasHours ? (
                      <dl className="mt-2 divide-y divide-neutral-100">
                        {DAYS.map(([k, label]) => {
                          const h = settings.working_hours[k]
                          return (
                            <SummaryRow key={k} label={label}>
                              {h?.length ? (
                                h.map((r) => `${fmtClock(r.start)} – ${fmtClock(r.end)}`).join(', ')
                              ) : (
                                <span className="font-normal text-neutral-400">Closed</span>
                              )}
                            </SummaryRow>
                          )
                        })}
                      </dl>
                    ) : (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                        No hours set — customers can't book yet.{' '}
                        <Link to="/dashboard/hours" className="font-medium underline underline-offset-2">
                          Set your hours
                        </Link>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-neutral-500">Time zone: {settings.timezone}</p>
                  </div>

                  <div className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        <Settings2 size={15} className="text-neutral-400" aria-hidden /> Booking rules
                      </p>
                      <Link to="/dashboard/booking-settings" className="text-sm font-medium text-brand-700 hover:underline">
                        Edit
                      </Link>
                    </div>
                    <dl className="mt-2 divide-y divide-neutral-100">
                      <SummaryRow label="Time slots every">{settings.slot_interval_minutes} min</SummaryRow>
                      <SummaryRow label="Minimum notice">{hoursLabel(settings.min_notice_hours)}</SummaryRow>
                      <SummaryRow label="Book up to">{settings.max_advance_days} days ahead</SummaryRow>
                      <SummaryRow label="New bookings">{settings.auto_confirm ? 'Confirmed instantly' : 'Need your approval'}</SummaryRow>
                      <SummaryRow label="Online cancellation">
                        {settings.allow_customer_cancellation ? `Until ${hoursLabel(settings.cancellation_deadline_hours)} before` : 'Off'}
                      </SummaryRow>
                    </dl>
                    <p className="mt-2 text-xs text-neutral-500">
                      Slot interval and time zone are on{' '}
                      <Link to="/dashboard/hours" className="underline underline-offset-2 hover:text-neutral-700">
                        Business Hours
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              )}
            </Section>

            {/* ------------------------------------------------------------- Policies */}
            <Section
              id="policies"
              title="Booking policies"
              description="Optional. Shown under “Good to know” on your page, so customers agree to them before booking."
            >
              {policiesLocked && <UpgradeNotice feature="Booking policies" />}
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
                {POLICY_FIELDS.map(([k, label]) => {
                  const open = !!openPolicies[k] || !!shown(k)
                  const value = values[k]
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`${fid(k)}-panel`}
                        onClick={() => setOpenPolicies((p) => ({ ...p, [k]: !open }))}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-neutral-900">{label}</span>
                          <span className={`block truncate text-xs ${value.trim() ? 'text-neutral-500' : 'text-neutral-400'}`}>
                            {value.trim() || 'Not set'}
                          </span>
                        </span>
                        {shown(k) && <CircleAlert size={15} className="shrink-0 text-red-500" aria-label="Has an error" />}
                        <ChevronDown
                          size={16}
                          className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {open && (
                        <div id={`${fid(k)}-panel`} className="px-4 pb-4">
                          <FormField
                            id={fid(k)}
                            label={label}
                            error={shown(k)}
                            count={value.length}
                            max={LIMITS.policy}
                            hint={
                              // A policy kept from Business still shows publicly; it can be cleared but not rewritten.
                              policiesLocked
                                ? value.trim()
                                  ? 'Still shown on your booking page. You can remove it; editing it needs the Business plan.'
                                  : undefined
                                : k === 'cancellation_policy' && settings
                                  ? settings.allow_customer_cancellation
                                    ? `Customers can also cancel online until ${hoursLabel(settings.cancellation_deadline_hours)} before — keep these consistent.`
                                    : 'Online cancellation is off, so customers will need to contact you.'
                                  : undefined
                            }
                            aside={
                              policiesLocked ? (
                                value.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => set(k, '')}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Remove
                                  </button>
                                )
                              ) : (
                              !value.trim() && (
                                <button
                                  type="button"
                                  onClick={() => set(k, POLICY_EXAMPLES[k])}
                                  className="text-xs font-medium text-brand-700 hover:underline"
                                >
                                  Use example
                                </button>
                              )
                              )
                            }
                          >
                            <textarea
                              {...text(k)}
                              readOnly={policiesLocked}
                              rows={3}
                              maxLength={LIMITS.policy}
                              className={`${areaCls(!!shown(k))} ${policiesLocked ? 'bg-neutral-50 text-neutral-500' : ''}`}
                            />
                          </FormField>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Section>

            {/* ------------------------------------------------------------- Customer messages */}
            <Section id="messages" title="Customer messages" description="Short notes customers see while booking and once they're booked.">
              <FormField
                id={fid('booking_instructions')}
                label="Booking instructions"
                optional
                hint="Shown above the Confirm button, on the confirmation page, and in the confirmation email."
                error={shown('booking_instructions')}
                count={values.booking_instructions.length}
                max={LIMITS.booking_instructions}
              >
                <textarea
                  {...text('booking_instructions')}
                  rows={2}
                  maxLength={LIMITS.booking_instructions}
                  placeholder="Please arrive 10 minutes before your appointment."
                  className={areaCls(!!shown('booking_instructions'))}
                />
              </FormField>
              <FormField
                id={fid('confirmation_message')}
                label="Confirmation message"
                optional
                hint="A personal note on the confirmation page and in the confirmation email."
                error={shown('confirmation_message')}
                count={values.confirmation_message.length}
                max={LIMITS.confirmation_message}
              >
                <textarea
                  {...text('confirmation_message')}
                  rows={2}
                  maxLength={LIMITS.confirmation_message}
                  placeholder={`Thank you for booking with ${values.name.trim() || 'us'}. We look forward to seeing you.`}
                  className={areaCls(!!shown('confirmation_message'))}
                />
              </FormField>
            </Section>
          </div>
        </div>

        {/* Wide screens: preview and checklist stay beside the form while it scrolls */}
        <aside className="hidden xl:block" aria-label="Preview">
          <div className="sticky top-40 space-y-4">
            {wide && <div className={`${panel} !p-4`}>{preview}</div>}
            <div className={`${panel} !p-4`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Page checklist</p>
                <span className="text-xs font-medium tabular-nums text-neutral-500">
                  {progress.done}/{progress.items.length}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width]"
                  style={{ width: `${(progress.done / progress.items.length) * 100}%` }}
                />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {progress.items.map(([label, ok]) => (
                  <li key={label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    {ok ? (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-500" aria-label="Done" />
                    ) : (
                      <Circle size={13} className="shrink-0" aria-label="To do" />
                    )}
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>

      {previewOpen && !wide && (
        <Modal onClose={() => setPreviewOpen(false)} title="Booking page preview" titleId="profile-preview-title" maxWidth="max-w-xl">
          {preview}
          <p className="mt-3 text-center text-xs text-neutral-500">Includes your unsaved changes.</p>
        </Modal>
      )}
    </form>
  )
}

