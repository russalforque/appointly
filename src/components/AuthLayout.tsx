import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import Logo from './Logo'

const HIGHLIGHTS = [
  'Online booking page customers can use 24/7',
  'One calendar for every staff member',
  'Automatic booking confirmations & reminders',
]

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-neutral-950 p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(600px circle at 15% 10%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(500px circle at 85% 85%, rgba(79,70,229,0.3), transparent 60%)',
          }}
        />
        <Link to="/" className="relative z-10 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Logo className="h-8 w-8" />
          Appointly
        </Link>

        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300">
            14-day free trial · No card required
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">
            Run your bookings like a real business.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400">
            Appointly gives service businesses a booking page, calendar, and customer list that just works —
            so you can stop chasing appointments over DMs and calls.
          </p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-sm text-neutral-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-neutral-500">© {new Date().getFullYear()} Appointly. All rights reserved.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-5 py-10 sm:px-10 sm:py-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-500 outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>

          <Link to="/" className="mt-6 flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 lg:hidden">
            <Logo className="h-8 w-8" />
            Appointly
          </Link>

          <div className="mt-8 lg:mt-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          </div>

          <div className="mt-8">{children}</div>

          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        </div>
      </div>
    </div>
  )
}
