import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { supabase } from '../lib/supabase'
import { formStr } from '../lib/db'
import { authErrorMessage } from '../lib/authErrors'
import { btn, input } from '../lib/ui'
import Field from '../components/Field'
import { ErrorText } from '../components/Status'
import AuthLayout from '../components/AuthLayout'
import HomeRedirect from '../components/HomeRedirect'
import { LEGAL_UPDATED } from './legal/LegalLayout'

export default function Register() {
  const { session } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)

  // Resolves per account: an Appointly staff account belongs in /admin, not the dashboard.
  if (session) return <HomeRedirect />

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email'))
    const password = String(f.get('password'))
    if (!accepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Stamped so we can show when — and to which version — this account agreed.
      options: {
        data: { full_name: formStr(f, 'name'), terms_accepted_at: new Date().toISOString(), terms_version: LEGAL_UPDATED },
        // Built from the current origin so the same build works on a preview deployment and on
        // the production domain. Every origin used here must be listed under Supabase
        // Auth -> URL Configuration -> Redirect URLs, or the link lands on the Site URL instead.
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    setBusy(false)
    if (error) setError(authErrorMessage(error.message, 'signup'))
    else if (!data.session) setSent(email)
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="One more step before you're in."
        footer={
          <>
            Already confirmed?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </>
        }
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <MailCheck className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            We sent a confirmation link to <span className="font-medium text-slate-900">{sent}</span>.
            Click it to activate your account, then sign in.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your 14-day free trial — no card required."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input name="name" autoComplete="name" required className={input} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className={input} />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <div className="relative">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              className={`${input} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            type="checkbox"
            name="accept_terms"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span className="text-xs leading-relaxed text-slate-600">
            I have read and agree to Appointly&apos;s{' '}
            <Link to="/terms" target="_blank" className="font-medium text-brand-600 hover:text-brand-700">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="font-medium text-brand-600 hover:text-brand-700">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <ErrorText message={error} />
        <button
          className={`${btn} flex w-full items-center justify-center gap-2 py-2.5`}
          disabled={busy || !accepted}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>
    </AuthLayout>
  )
}
