import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Logo from '../../components/Logo'

/** Last substantive revision of the Terms and the Privacy Policy. Bump it whenever the text changes. */
export const LEGAL_UPDATED = 'September 23, 2026'

/** A numbered clause. `id` lets other pages deep-link to it, e.g. /terms#subscription. */
export function Clause({ id, n, title, children }: { id?: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-base font-semibold text-slate-900">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

/** Shared chrome for the public legal pages, which sit outside both the app and the marketing site. */
export default function LegalLayout({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <Logo className="h-8 w-8" />
            Appointly
          </Link>
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-500 outline-none transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <ArrowLeft size={15} strokeWidth={1.75} /> Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{intro}</p>
        <div className="mt-8 space-y-7">{children}</div>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-slate-500 sm:px-6">
          <nav aria-label="Legal" className="flex items-center gap-4">
            <Link to="/terms" className="transition-colors hover:text-slate-900">
              Terms of Service
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-slate-900">
              Privacy Policy
            </Link>
          </nav>
          <p className="text-xs">© {new Date().getFullYear()} Appointly</p>
        </div>
      </footer>
    </div>
  )
}
