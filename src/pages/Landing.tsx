import { useCallback, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Users,
  Globe,
  Clock,
  Bell,
  ArrowRight,
  Check,
  Settings,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react'
import { fetchPlans, fmtMoney } from '../lib/billing'
import { useLoad } from '../lib/useLoad'
import { usePageMeta } from '../lib/usePageMeta'
import Logo from '../components/Logo'
import Reveal from '../components/Reveal'
import DashboardPreview from '../assets/dashboardpage-lgo.png'

/* Shared tokens — one container width, one section rhythm, one button set for the whole page.
   Breakpoints in use: xs = 360px (small phones), sm = 640px, md = 768px, lg = 1024px. */
const SECTION = 'px-5 py-14 sm:px-6 sm:py-20 md:py-24 lg:px-8 lg:py-28'
const CONTAINER = 'mx-auto w-full max-w-6xl'
const ANCHOR = 'scroll-mt-20' // clears the sticky header when jumping to a section
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2'
const BTN_BASE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium transition-colors sm:px-6'
const BTN_PRIMARY = `${BTN_BASE} bg-slate-900 text-white hover:bg-slate-700 ${FOCUS}`
const BTN_SECONDARY = `${BTN_BASE} border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 ${FOCUS}`
const EYEBROW = 'text-xs font-semibold uppercase tracking-widest text-brand-600'
const H2 = 'font-display text-[1.75rem] font-medium leading-tight tracking-tight text-slate-900 wrap-break-word xs:text-3xl sm:text-4xl'
const CARD_TITLE = 'mt-4 text-[15px] font-semibold text-slate-900 wrap-break-word'
const CARD_BODY = 'mt-2 text-[15px] leading-relaxed text-slate-600'

const BENEFITS = [
  [
    'Stop losing bookings to missed calls',
    'Your booking page is open around the clock, so customers book while you are with someone else — or asleep.',
  ],
  [
    'Cut out the back-and-forth',
    'Customers pick a service, a staff member, and a time that is genuinely free. No messages to reconcile.',
  ],
  [
    'Keep the admin in one place',
    'Staff, services, hours, and customer history live in one system instead of a notebook or a group chat.',
  ],
]

const FEATURES = [
  { icon: CalendarDays, title: 'Online booking', body: 'Customers book themselves into your open slots, and it lands straight on your calendar.' },
  { icon: Globe, title: 'Your own booking page', body: 'A public page with your services, staff, and a booking button — share the link anywhere.' },
  { icon: Clock, title: 'One shared calendar', body: 'Every staff member and appointment in a single view, so nothing gets double-booked.' },
  { icon: Users, title: 'Services and staff', body: 'Assign services to the people who perform them and control who can be booked.' },
  { icon: Settings, title: 'Availability you control', body: 'Set business hours, lead time, buffers, and how far ahead customers can book.' },
  { icon: Bell, title: 'Customers and updates', body: 'Booking history for every customer, plus automatic updates when a booking changes.' },
]

const BUSINESS_TYPES = [
  'Salons', 'Barbershops', 'Nail salons', 'Spas', 'Massage therapists', 'Pet groomers',
  'Car detailers', 'Clinics', 'Tutors', 'Personal trainers',
]

const STEPS = [
  { n: '1', title: 'Create your account', body: 'Sign up and start your 14-day free trial — no card required.' },
  { n: '2', title: 'Set up your business', body: 'Add services, staff, business hours, and booking rules.' },
  { n: '3', title: 'Share your link', body: 'Send customers your booking page, or add it to your site and socials.' },
  { n: '4', title: 'Manage bookings', body: 'Every booking, customer, and schedule change in one dashboard.' },
]

const FAQS = [
  { q: 'Is there a free trial?', a: 'Yes. Every new business gets a 14-day free trial with full access to the product. No card is required to start.' },
  { q: 'What happens when the trial ends?', a: 'Your data stays exactly where it is. You pick a plan and pay for it to keep using the dashboard and your booking page.' },
  { q: 'How does online booking work?', a: 'You get a public booking page listing your services and staff. Customers pick a service, a staff member, and a time that is genuinely free, and it lands directly on your calendar.' },
  { q: 'Can customers book from their phones?', a: 'Yes. Your booking page and your dashboard both work on any device, with no app to install.' },
  { q: 'Can I manage multiple staff?', a: 'Yes. Add as many staff members as you need, each with their own services and schedule, all on one shared calendar.' },
  { q: 'How do I pay for a plan?', a: 'Transfer the plan amount to our GoTyme Bank account — by bank transfer or by scanning the QR Ph code — then upload your receipt and the reference number from your bank app.' },
  { q: 'How long before my plan is active?', a: 'Our team checks every transfer by hand, so activation is not instant. You can follow the status on your billing page, and we notify you in the dashboard the moment the plan is live.' },
  { q: 'Does my subscription renew automatically?', a: 'No. Each plan is prepaid for a single billing period and never renews on its own, so nothing is charged without you choosing to pay again. Once a period is activated it is non-refundable.' },
]

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`flex w-full items-center justify-between gap-4 py-4 text-left sm:gap-6 sm:py-5 text-[15px] font-medium text-slate-900 transition-colors hover:text-slate-600 ${FOCUS}`}
        >
          {q}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr] pb-4 sm:pb-5' : 'grid-rows-[0fr]'}`}
      >
        <p className="overflow-hidden text-[15px] leading-relaxed text-slate-600 sm:pr-10">{a}</p>
      </div>
    </div>
  )
}

export default function Landing() {
  const { data: plans } = useLoad(useCallback(() => fetchPlans(), []))
  const [mobileOpen, setMobileOpen] = useState(false)

  usePageMeta({
    title: 'Appointly — Online Booking & Scheduling for Service Businesses',
    description:
      'An online booking platform for service businesses to manage appointments, services, staff, schedules, and customers in one place.',
  })

  const popularPlanId = plans && plans.length > 1 ? plans[1].id : null

  return (
    <div className="font-site min-h-screen bg-white text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav aria-label="Main" className={`${CONTAINER} flex items-center justify-between gap-4 px-5 py-3 sm:gap-6 sm:px-6 sm:py-3.5 lg:px-8`}>
          <Link to="/" className={`-my-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg py-1 text-base font-semibold tracking-tight sm:text-[17px] ${FOCUS}`}>
            <Logo className="h-7 w-7" />
            Appointly
          </Link>

          <ul className="hidden items-center gap-6 whitespace-nowrap text-sm text-slate-600 md:flex lg:gap-8">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                {/* Vertical padding is cancelled by the negative margin: bigger tap target on
                    tablets without making the header any taller. */}
                <a href={l.href} className={`-my-2.5 block rounded py-2.5 transition-colors hover:text-slate-900 ${FOCUS}`}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Link to="/login" className={`rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 ${FOCUS}`}>
              Log in
            </Link>
            <Link to="/register" className={`whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 ${FOCUS}`}>
              Start free trial
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className={`-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden ${FOCUS}`}
          >
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </nav>

        {mobileOpen && (
          <div className="max-h-[calc(100dvh-3.25rem)] overflow-y-auto overscroll-contain border-t border-slate-200 bg-white px-5 pb-5 pt-2 sm:px-6 md:hidden">
            <ul className="flex flex-col text-[15px] font-medium text-slate-700">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block rounded-lg px-2 py-3 hover:bg-slate-50 ${FOCUS}`}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-4">
              <Link to="/register" onClick={() => setMobileOpen(false)} className={`${BTN_PRIMARY} w-full`}>
                Start free trial
              </Link>
              <Link to="/login" onClick={() => setMobileOpen(false)} className={`${BTN_SECONDARY} w-full`}>
                Log in
              </Link>
            </div>
          </div>
        )}
      </header>

      <main id="main">
        {/* Hero */}
        <section className="px-5 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pt-24">
          <Reveal className={`${CONTAINER} max-w-3xl text-center`}>
            <p className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 xs:text-xs">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              14-day free trial · No card required
            </p>
            <h1 className="font-display mt-5 text-[1.875rem] font-medium leading-[1.12] tracking-tight text-slate-900 wrap-break-word xs:text-[2.125rem] sm:mt-6 sm:text-5xl sm:leading-[1.1] lg:text-6xl">
              Let customers book you online
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 xs:text-base sm:mt-5 sm:text-lg">
              Appointly is booking and scheduling software for service businesses — one place for your
              appointments, staff, services, and customers.
            </p>
            <div className="mx-auto mt-7 flex w-full max-w-xs flex-col gap-3 sm:mt-8 sm:max-w-none sm:flex-row sm:justify-center">
              <Link to="/register" className={`group ${BTN_PRIMARY}`}>
                Start free trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className={BTN_SECONDARY}>
                See how it works
              </a>
            </div>
          </Reveal>

          {/* Product preview */}
          <Reveal delay={120} className={`${CONTAINER} mt-12 max-w-4xl sm:mt-16`}>
            <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4 sm:py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                <span className="ml-2 min-w-0 truncate rounded bg-white px-2 py-1 text-[10px] text-slate-400 ring-1 ring-slate-200 sm:ml-3 sm:px-2.5 sm:text-[11px]">
                  app.appointly.io/dashboard
                </span>
              </div>
              <img
                src={DashboardPreview}
                alt="The Appointly dashboard, showing upcoming appointments and the booking calendar"
                width={1672}
                height={940}
                // Below the fold and the single heaviest asset on the page, so it must not
                // compete with the hero for bandwidth.
                loading="lazy"
                decoding="async"
                className="block h-auto w-full max-w-full"
              />
            </figure>
          </Reveal>
        </section>

        {/* Why online booking */}
        <section className={`border-t border-slate-200 ${SECTION}`}>
          <div className={CONTAINER}>
            <Reveal className="max-w-2xl">
              <p className={EYEBROW}>Why online booking</p>
              <h2 className={`${H2} mt-3`}>Phone tag and DMs don't scale</h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 sm:text-base">
                Every missed call and unanswered message is a customer who might book somewhere else.
                Appointly turns that into a booking page that works without you.
              </p>
            </Reveal>

            <Reveal delay={100} className="mt-10 grid gap-7 sm:mt-12 sm:grid-cols-2 sm:gap-8 md:grid-cols-3 md:gap-10 lg:mt-14">
              {BENEFITS.map(([title, body]) => (
                <div key={title}>
                  <Check className="h-5 w-5 text-brand-600" strokeWidth={2.25} aria-hidden="true" />
                  <h3 className={CARD_TITLE}>{title}</h3>
                  <p className={CARD_BODY}>{body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className={`${ANCHOR} border-t border-slate-200 bg-slate-50 ${SECTION}`}>
          <div className={CONTAINER}>
            <Reveal className="max-w-2xl">
              <p className={EYEBROW}>How it works</p>
              <h2 className={`${H2} mt-3`}>From sign-up to your first booking</h2>
            </Reveal>

            <Reveal delay={100} className="mt-10 grid gap-7 sm:mt-12 sm:grid-cols-2 sm:gap-10 lg:mt-14 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.n}>
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-slate-300 text-sm font-semibold text-slate-700">
                    {s.n}
                  </span>
                  <h3 className={CARD_TITLE}>{s.title}</h3>
                  <p className={CARD_BODY}>{s.body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className={`${ANCHOR} border-t border-slate-200 ${SECTION}`}>
          <div className={CONTAINER}>
            <Reveal className="max-w-2xl">
              <p className={EYEBROW}>Features</p>
              <h2 className={`${H2} mt-3`}>Everything you need to run bookings</h2>
            </Reveal>

            <Reveal
              delay={100}
              className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:mt-12 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3"
            >
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="bg-white p-5 sm:p-6 lg:p-7">
                  <Icon className="h-5 w-5 text-brand-600" strokeWidth={1.75} aria-hidden="true" />
                  <h3 className={CARD_TITLE}>{title}</h3>
                  <p className={CARD_BODY}>{body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Who it's for */}
        <section className={`border-t border-slate-200 bg-slate-50 ${SECTION}`}>
          <Reveal className={`${CONTAINER} max-w-3xl text-center`}>
            <p className={EYEBROW}>Built for</p>
            <h2 className={`${H2} mt-3`}>Service businesses that run on appointments</h2>
            <ul className="mt-7 flex flex-wrap justify-center gap-2 sm:mt-8">
              {BUSINESS_TYPES.map((label) => (
                <li key={label} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-700 sm:px-3.5 sm:text-sm">
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-slate-500">…and anyone else who books time with customers.</p>
          </Reveal>
        </section>

        {/* Pricing */}
        <section id="pricing" className={`${ANCHOR} border-t border-slate-200 ${SECTION}`}>
          <div className={CONTAINER}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className={EYEBROW}>Pricing</p>
              <h2 className={`${H2} mt-3`}>Simple plans for growing businesses</h2>
              <p className="mt-4 text-[15px] text-slate-600 sm:text-base">
                Start with a 14-day free trial. Upgrade when you're ready.
              </p>
            </Reveal>

            {plans && (
              <Reveal delay={100} className="mx-auto mt-10 grid max-w-3xl gap-5 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:mt-14">
                {plans.map((plan) => {
                  const popular = plan.id === popularPlanId
                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col rounded-2xl border bg-white p-5 sm:p-6 lg:p-8 ${
                        popular ? 'border-slate-900' : 'border-slate-200'
                      }`}
                    >
                      {popular && (
                        <span className="absolute -top-2.5 left-5 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white sm:left-6 lg:left-8">
                          Most popular
                        </span>
                      )}
                      <h3 className="text-[15px] font-semibold text-slate-900">{plan.name}</h3>
                      <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                        <span className="text-3xl font-semibold tracking-tight text-slate-900 wrap-break-word sm:text-4xl">
                          {fmtMoney(plan.price_cents, plan.currency)}
                        </span>
                        <span className="text-sm text-slate-500">/ {plan.interval}</span>
                      </p>
                      <ul className="mt-6 flex-1 space-y-3 text-[15px] text-slate-600">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                            <span className="min-w-0 wrap-break-word">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        to="/register"
                        className={`mt-7 w-full sm:mt-8 ${popular ? BTN_PRIMARY : BTN_SECONDARY}`}
                        aria-label={`Start your free trial on the ${plan.name} plan`}
                      >
                        Start free trial
                      </Link>
                    </div>
                  )
                })}
              </Reveal>
            )}

            <p className="mx-auto mt-8 max-w-lg text-center text-xs leading-relaxed text-slate-500">
              Paid plans are settled by GoTyme Bank transfer or QR Ph. You upload your receipt, our team verifies it, and your
              plan is activated — prepaid for one period, with no automatic renewal.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${ANCHOR} border-t border-slate-200 bg-slate-50 ${SECTION}`}>
          <div className={`${CONTAINER} max-w-3xl`}>
            <Reveal className="text-center">
              <p className={EYEBROW}>FAQ</p>
              <h2 className={`${H2} mt-3`}>Frequently asked questions</h2>
            </Reveal>
            <Reveal delay={100} className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
              {FAQS.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className={`border-t border-slate-200 ${SECTION}`}>
          <Reveal className={`${CONTAINER} max-w-4xl rounded-2xl bg-slate-900 px-5 py-12 text-center sm:px-12 sm:py-16`}>
            <h2 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-white wrap-break-word xs:text-3xl sm:text-4xl">
              Ready to take bookings online?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-300 sm:text-base">
              Start your 14-day free trial and give customers an easier way to book. No card required.
            </p>
            <Link
              to="/register"
              className="group mx-auto mt-7 inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-medium text-slate-900 outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:mt-8 sm:w-auto"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className={`${CONTAINER} flex flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:gap-6 sm:px-6 lg:px-8`}>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
            <Logo className="h-6 w-6" />
            Appointly
          </div>
          <nav
            aria-label="Footer"
            className="-my-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-0 text-sm text-slate-600 sm:gap-x-1"
          >
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`rounded px-2.5 py-2.5 transition-colors hover:text-slate-900 ${FOCUS}`}
              >
                {l.label}
              </a>
            ))}
            <Link to="/terms" className={`rounded px-2.5 py-2.5 transition-colors hover:text-slate-900 ${FOCUS}`}>
              Terms
            </Link>
            <Link to="/privacy" className={`rounded px-2.5 py-2.5 transition-colors hover:text-slate-900 ${FOCUS}`}>
              Privacy
            </Link>
            <Link to="/login" className={`rounded px-2.5 py-2.5 transition-colors hover:text-slate-900 ${FOCUS}`}>
              Log in
            </Link>
          </nav>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Appointly</p>
        </div>
      </footer>
    </div>
  )
}
