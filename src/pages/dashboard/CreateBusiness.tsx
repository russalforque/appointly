import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Brush,
  Car,
  Check,
  CircleAlert,
  Dog,
  Flower2,
  HandHeart,
  Loader2,
  LogOut,
  Scissors,
  Shapes,
  SprayCan,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { friendlyError, slugify } from '../../lib/db'
import { btn, input } from '../../lib/ui'
import { ErrorText } from '../../components/Status'
import Logo from '../../components/Logo'

const CATEGORIES: { label: string; icon: LucideIcon }[] = [
  { label: 'Salon', icon: Scissors },
  { label: 'Barbershop', icon: Brush },
  { label: 'Spa', icon: Flower2 },
  { label: 'Massage', icon: HandHeart },
  { label: 'Dental clinic', icon: Stethoscope },
  { label: 'Car detailing', icon: Car },
  { label: 'Cleaning', icon: SprayCan },
  { label: 'Pet grooming', icon: Dog },
  { label: 'Repair', icon: Wrench },
  { label: 'Other', icon: Shapes },
]

const NAME_MAX = 60
const SLUG_MIN = 3
const SLUG_MAX = 40

/** What happens after this form — shown so setup reads as step 1 of 4, not a dead end. */
const NEXT_STEPS = ['Add the services you offer', 'Set your opening hours', 'Share your booking link']

type SlugState =
  | { kind: 'empty' }
  | { kind: 'short' }
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'taken' }
  | { kind: 'unknown' }

/**
 * Looks up one slug. Authenticated users may read active businesses (businesses_public_read), so
 * this catches the common collision before the owner commits. It is a courtesy check, not the
 * guarantee — the unique index is, and a 23505 on submit is still handled.
 */
async function checkSlug(slug: string): Promise<SlugState> {
  const { count, error } = await supabase
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .eq('slug', slug)
  if (error) return { kind: 'unknown' }
  return count ? { kind: 'taken' } : { kind: 'free' }
}

const SLUG_COPY: Record<SlugState['kind'], { text: string; tone: string; icon: LucideIcon | null }> = {
  empty: { text: 'Letters, numbers and dashes — at least 3 characters.', tone: 'text-neutral-500', icon: null },
  short: { text: 'A little longer, please — at least 3 characters.', tone: 'text-neutral-500', icon: null },
  checking: { text: 'Checking availability…', tone: 'text-neutral-500', icon: Loader2 },
  free: { text: 'This link is available.', tone: 'text-green-700', icon: Check },
  taken: { text: 'That link is taken. Try adding your city or branch.', tone: 'text-red-600', icon: CircleAlert },
  unknown: { text: "We'll confirm this link when you create the business.", tone: 'text-neutral-500', icon: null },
}

function SlugStatus({ state }: { state: SlugState }) {
  const { text, tone, icon: Icon } = SLUG_COPY[state.kind]
  return (
    <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${tone}`} aria-live="polite">
      {Icon && <Icon size={13} aria-hidden className={state.kind === 'checking' ? 'animate-spin' : ''} />}
      {text}
    </p>
  )
}

export default function CreateBusiness({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  // Until the owner edits the link themselves, it tracks the name — one decision instead of two.
  const [slugTouched, setSlugTouched] = useState(false)
  const [category, setCategory] = useState(CATEGORIES[0].label)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The last lookup we finished, tagged with the slug it answered for. Anything newer than that
  // tag is still in flight, so the status derives from the current slug rather than a stale reply.
  const [checked, setChecked] = useState<{ slug: string; state: SlugState } | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const effectiveSlug = slugTouched ? slug : slugify(name).slice(0, SLUG_MAX)
  const bookingHost = useMemo(() => `${window.location.host}/book/`, [])

  const slugState: SlugState = !effectiveSlug
    ? { kind: 'empty' }
    : effectiveSlug.length < SLUG_MIN
      ? { kind: 'short' }
      : checked?.slug === effectiveSlug
        ? checked.state
        : { kind: 'checking' }

  // Debounced so a fast typist triggers one lookup, not one per keystroke.
  useEffect(() => {
    if (effectiveSlug.length < SLUG_MIN) return
    let cancelled = false
    const t = setTimeout(() => {
      checkSlug(effectiveSlug).then((state) => {
        if (!cancelled) setChecked({ slug: effectiveSlug, state })
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [effectiveSlug])

  // A submit error can land off-screen on a short viewport; bring it into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  const canSubmit = name.trim().length > 0 && effectiveSlug.length >= SLUG_MIN && slugState.kind !== 'taken' && !busy

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_business', {
      p_name: name.trim(),
      p_slug: effectiveSlug,
      p_category: category,
    })
    setBusy(false)
    if (error) {
      if (error.code === '23505') {
        setChecked({ slug: effectiveSlug, state: { kind: 'taken' } })
        setError('That booking link was just taken. Please choose another one.')
      } else {
        setError(friendlyError(error.message))
      }
      return
    }
    onCreated()
  }

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Context panel: why this screen exists and what follows it. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-neutral-950 p-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(600px circle at 15% 10%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(500px circle at 85% 85%, rgba(79,70,229,0.3), transparent 60%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Logo className="h-8 w-8" />
          Appointly
        </div>

        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300">
            Step 1 of 4 · About a minute
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">Let&apos;s put your business online.</h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400">
            Three details are all we need to open your dashboard and reserve your booking page. Your free trial
            starts the moment it&apos;s created.
          </p>
          <ol className="mt-8 space-y-3">
            {NEXT_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-sm text-neutral-400">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-xs font-medium text-neutral-300">
                  {i + 2}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <p className="relative z-10 text-xs text-neutral-500">
          © {new Date().getFullYear()} Appointly. All rights reserved.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col px-5 py-8 sm:px-10 sm:py-10 lg:px-16 lg:py-12">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 lg:hidden">
              <Logo className="h-7 w-7" />
              Appointly
            </div>
            {/* Escape hatch: without it, someone signed in to the wrong account is stuck here. */}
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-slate-500 outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </div>

          <header className="mt-8 lg:mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-brand-600 lg:hidden">Step 1 of 4</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Set up your business
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              This is what customers see when they book with you. You can rename your business or change its
              category later.
            </p>
          </header>

          <form onSubmit={submit} className="mt-8 space-y-7" noValidate>
            {/* 1 — Name */}
            <div>
              <label htmlFor="biz-name" className="block text-sm font-medium text-slate-700">
                Business name
              </label>
              <p className="mt-0.5 text-xs text-slate-500">Shown at the top of your booking page and on receipts.</p>
              <input
                id="biz-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="organization"
                required
                maxLength={NAME_MAX}
                placeholder="e.g. Bloom Hair Studio"
                className={`${input} mt-2 py-2.5`}
              />
            </div>

            {/* 2 — Booking link. Permanent once created, so it gets full weight, not a hint. */}
            <div>
              <label htmlFor="biz-slug" className="block text-sm font-medium text-slate-700">
                Your booking link
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Choose carefully — this address can&apos;t be changed once your business is created.
              </p>
              <div
                className={`mt-2 flex items-stretch overflow-hidden rounded-md border bg-white transition-colors focus-within:ring-2 ${
                  slugState.kind === 'taken'
                    ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/15'
                    : 'border-slate-300 focus-within:border-brand-600 focus-within:ring-brand-600/15'
                }`}
              >
                <span
                  aria-hidden
                  className="hidden shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 sm:flex"
                >
                  {bookingHost}
                </span>
                <input
                  id="biz-slug"
                  name="slug"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(slugify(e.target.value).slice(0, SLUG_MAX))
                  }}
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={SLUG_MAX}
                  placeholder="bloom-hair-studio"
                  aria-describedby="biz-slug-help"
                  aria-invalid={slugState.kind === 'taken'}
                  className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <span className="sr-only" id="biz-slug-help">
                Your public booking address: {bookingHost}
                {effectiveSlug}
              </span>
              {/* The prefix is hidden on narrow screens, so echo the full address below instead. */}
              <p className="mt-1.5 break-all text-xs text-slate-500 sm:hidden">
                {bookingHost}
                <span className="font-medium text-slate-900">{effectiveSlug || '…'}</span>
              </p>
              <SlugStatus state={slugState} />
            </div>

            {/* 3 — Category. Ten options: a visible group beats a dropdown you must open to compare. */}
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">What kind of business is it?</legend>
              <p className="mt-0.5 text-xs text-slate-500">Helps us tailor your services and reminders.</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map(({ label, icon: Icon }) => (
                  <label
                    key={label}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-brand-600 has-focus-visible:ring-offset-1 ${
                      category === label
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={label}
                      checked={category === label}
                      onChange={() => setCategory(label)}
                      className="sr-only"
                    />
                    <Icon
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden
                      className={`shrink-0 ${category === label ? 'text-brand-600' : 'text-slate-400'}`}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && (
              <div
                ref={errorRef}
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3"
              >
                <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
                <ErrorText message={error} />
              </div>
            )}

            <div className="space-y-3 border-t border-slate-100 pt-6">
              <button className={`${btn} flex w-full items-center justify-center gap-2 py-3`} disabled={!canSubmit}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {busy ? 'Creating your business…' : 'Create business'}
                {!busy && <ArrowRight size={16} aria-hidden />}
              </button>
              <p className="text-center text-xs text-slate-500">
                Your 14-day free trial starts now. No card required.
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
