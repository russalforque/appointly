import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Calendar, Clock, EyeOff, Globe, Info, Mail, MapPin, Monitor, Phone, Smartphone } from 'lucide-react'
import { fmtClock } from '../../../lib/format'
import { displayUrl, fullAddress, POLICY_FIELDS } from '../../../lib/publicBusiness'
import type { WorkingHours } from '../../../lib/types'
import { FacebookIcon, InstagramIcon, TikTokIcon } from '../../../components/SocialIcons'
import { HEX, type FormValues } from './profileModel'

const DAYS: [string, string][] = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
]

const VIRTUAL_WIDTH = { desktop: 1180, mobile: 390 } as const
const SITE_FONT = { fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }

/**
 * Lays the page out at a real device width, then scales it down to fit the column, so the
 * preview wraps and breaks exactly where the booking page will.
 */
function ScaledFrame({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ scale: 0, height: 0 })

  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const measure = () => setBox({ scale: o.clientWidth / width, height: i.offsetHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(o)
    ro.observe(i)
    return () => ro.disconnect()
  }, [width])

  return (
    <div ref={outer} className="relative w-full overflow-hidden" style={{ height: box.height * box.scale }}>
      <div
        ref={inner}
        inert
        className="absolute left-0 top-0 origin-top-left select-none"
        style={{ width, transform: `scale(${box.scale})`, ...SITE_FONT }}
      >
        {children}
      </div>
    </div>
  )
}

function Site({ v, mode, workingHours }: { v: FormValues; mode: 'desktop' | 'mobile'; workingHours: WorkingHours | null }) {
  const d = mode === 'desktop'
  const accent = HEX.test(v.accent_color) ? v.accent_color : '#0f172a'
  const tint = { backgroundColor: `color-mix(in srgb, ${accent} 10%, white)`, color: accent }
  const name = v.name.trim() || 'Your business'
  const address = v.show_address ? fullAddress(v) : ''
  const phone = v.show_phone ? v.phone.trim() : ''
  const email = v.show_email ? v.email.trim() : ''
  const socials = [
    [v.facebook_url, FacebookIcon],
    [v.instagram_url, InstagramIcon],
    [v.tiktok_url, TikTokIcon],
  ].filter(([url]) => (url as string).trim()) as [string, typeof FacebookIcon][]
  const policies = POLICY_FIELDS.filter(([k]) => v[k].trim())
  const hasHours = !!workingHours && Object.values(workingHours).some((h) => h?.length)
  const bookBtn = (
    <span style={{ backgroundColor: accent }} className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white">
      <Calendar size={16} /> Book Appointment
    </span>
  )

  return (
    <div className="bg-white text-slate-900">
      {!v.is_active && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
          <EyeOff size={15} /> Hidden — customers can't open this page
        </div>
      )}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {v.logo_url ? (
            <img src={v.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-display truncate text-lg font-semibold">{name}</span>
        </div>
        {d && (
          <span style={{ backgroundColor: accent }} className="rounded-full px-5 py-2.5 text-sm font-semibold text-white">
            Book Appointment
          </span>
        )}
      </div>

      <div className={`relative isolate flex items-center justify-center overflow-hidden bg-slate-900 px-6 text-center ${d ? 'min-h-[30rem] py-20' : 'min-h-[24rem] py-14'}`}>
        {v.cover_image_url && <img src={v.cover_image_url} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />}
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/55 to-black/30" />
        <div className="mx-auto max-w-2xl space-y-5">
          {v.category.trim() && <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/75">{v.category}</p>}
          <h1 className={`font-display font-medium leading-[1.08] tracking-tight text-white wrap-break-word ${d ? 'text-6xl' : 'text-4xl'}`}>{name}</h1>
          {v.tagline.trim() && <p className={`font-medium text-white/95 ${d ? 'text-xl' : 'text-lg'}`}>{v.tagline}</p>}
          {v.description.trim() && <p className={`mx-auto max-w-xl leading-relaxed text-white/80 ${d ? 'text-lg' : 'text-base'}`}>{v.description}</p>}
          <div className="pt-2">{bookBtn}</div>
        </div>
      </div>

      <div className={`mx-auto max-w-6xl px-6 ${d ? 'py-20' : 'py-12'}`}>
        <h2 className={`font-display text-center font-medium tracking-tight ${d ? 'text-4xl' : 'text-3xl'}`}>Our Services</h2>
        <p className="mt-2 text-center text-sm text-slate-400">Your active services appear here</p>
        <div className={`mt-8 grid gap-5 ${d ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {Array.from({ length: d ? 3 : 2 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-slate-200 p-6">
              <div className="h-4 w-1/2 rounded bg-slate-200" />
              <div className="h-3 w-5/6 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
              <div style={{ backgroundColor: accent }} className="mt-4 h-8 w-24 rounded-full opacity-90" />
            </div>
          ))}
        </div>
      </div>

      {v.about.trim() && (
        <div className={`mx-auto max-w-3xl px-6 text-center ${d ? 'py-16' : 'py-12'}`}>
          <h2 className={`font-display font-medium tracking-tight ${d ? 'text-4xl' : 'text-3xl'}`}>About {name}</h2>
          <p className="mt-5 line-clamp-6 whitespace-pre-line text-base leading-relaxed text-slate-600">{v.about}</p>
        </div>
      )}

      {(v.booking_instructions.trim() || policies.length > 0) && (
        <div className={`mx-auto max-w-3xl px-6 ${d ? 'pb-16' : 'pb-12'}`}>
          <div className="rounded-2xl border border-slate-200 p-6">
            <h2 className="font-display text-2xl font-medium">Good to know</h2>
            {v.booking_instructions.trim() && (
              <p className="mt-4 flex gap-3 rounded-xl p-3 text-sm" style={tint}>
                <Info size={16} className="mt-0.5 shrink-0" />
                <span className="text-slate-700">{v.booking_instructions}</span>
              </p>
            )}
            {policies.map(([k, label]) => (
              <div key={k} className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-medium text-slate-700">
                {label}
                <span className="text-slate-400">+</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`border-t border-slate-200 bg-slate-50 px-6 ${d ? 'py-20' : 'py-12'}`}>
        <div className={`mx-auto grid max-w-5xl gap-10 ${d ? 'grid-cols-2 gap-16' : 'grid-cols-1'}`}>
          <div>
            <h2 className="font-display text-2xl font-medium tracking-tight">Contact</h2>
            <ul className="mt-6 space-y-4 text-sm text-slate-600">
              {[
                [MapPin, address],
                [Phone, phone],
                [Mail, email],
                [Globe, v.website_url.trim() ? displayUrl(v.website_url.trim()) : ''],
              ]
                .filter(([, text]) => text)
                .map(([Icon, text]) => {
                  const I = Icon as typeof MapPin
                  return (
                    <li key={text as string} className="flex items-start gap-3">
                      <span style={tint} className="grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <I size={16} />
                      </span>
                      <span className="min-w-0 pt-2 wrap-anywhere">{text as string}</span>
                    </li>
                  )
                })}
              {!address && !phone && !email && !v.website_url.trim() && (
                <li className="text-slate-400">No public contact details</li>
              )}
            </ul>
            {socials.length > 0 && (
              <div className="mt-6 flex gap-2">
                {socials.map(([url, Icon]) => (
                  <span key={url} style={tint} className="grid h-10 w-10 place-items-center rounded-full">
                    <Icon size={17} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="font-display text-2xl font-medium tracking-tight">Business Hours</h2>
            {hasHours ? (
              <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
                {DAYS.map(([k, label]) => {
                  const h = workingHours?.[k]
                  return (
                    <li key={k} className="flex justify-between px-4 py-3">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className={h?.length ? 'text-slate-600' : 'text-slate-400'}>
                        {h?.length ? h.map((r) => `${fmtClock(r.start)} – ${fmtClock(r.end)}`).join(', ') : 'Closed'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                <Clock size={15} /> No hours set yet
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 py-14 text-center text-white" style={{ backgroundColor: accent }}>
        <h2 className="font-display text-3xl font-medium">Ready to book?</h2>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold" style={{ color: accent }}>
          <Calendar size={16} /> Book Appointment
        </span>
      </div>
    </div>
  )
}

/**
 * Live preview of the public booking page, fed straight from the unsaved form. Desktop renders
 * the full-width layout scaled down; mobile renders a phone-width page inside a device outline.
 */
export default function ProfilePreview({
  values,
  workingHours,
  mode,
  onModeChange,
}: {
  values: FormValues
  workingHours: WorkingHours | null
  mode: 'desktop' | 'mobile'
  onModeChange: (m: 'desktop' | 'mobile') => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Live preview</p>
        <div role="tablist" aria-label="Preview size" className="inline-flex rounded-lg bg-neutral-100 p-0.5">
          {(
            [
              ['desktop', Monitor, 'Desktop'],
              ['mobile', Smartphone, 'Mobile'],
            ] as const
          ).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => onModeChange(m)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 ${
                mode === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3" aria-label="Booking page preview" role="img">
        {mode === 'desktop' ? (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-neutral-100 bg-neutral-50 px-3 py-2">
              {['bg-red-300', 'bg-amber-300', 'bg-emerald-300'].map((c) => (
                <span key={c} className={`h-2 w-2 rounded-full ${c}`} />
              ))}
            </div>
            <div className="no-scrollbar max-h-[min(40rem,calc(100dvh-15rem))] overflow-y-auto overscroll-contain">
            <ScaledFrame width={VIRTUAL_WIDTH.desktop}>
              <Site v={values} mode="desktop" workingHours={workingHours} />
            </ScaledFrame>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[16.5rem] rounded-[2rem] border-[6px] border-neutral-900 bg-neutral-900 shadow-lg">
            <div className="overflow-hidden rounded-[1.6rem] bg-white">
              <div className="no-scrollbar max-h-[min(34rem,calc(100dvh-15rem))] overflow-y-auto overscroll-contain">
              <ScaledFrame width={VIRTUAL_WIDTH.mobile}>
                <Site v={values} mode="mobile" workingHours={workingHours} />
              </ScaledFrame>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
