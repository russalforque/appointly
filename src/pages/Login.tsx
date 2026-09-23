import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { supabase } from '../lib/supabase'
import AuthLayout from '../components/AuthLayout'

const field =
  'block h-11 w-full rounded-lg border bg-white px-3.5 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 sm:text-sm'
const fieldOk = 'border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15'
const fieldBad = 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/15'

/** Turn a Supabase auth error into something a person can act on. */
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return "That email and password don't match an account. Check them and try again."
  if (m.includes('email not confirmed'))
    return 'Confirm your email first — open the link we sent you, then sign in.'
  if (m.includes('too many') || m.includes('rate limit'))
    return 'Too many sign-in attempts. Wait a moment, then try again.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return "We couldn't reach Appointly. Check your connection and try again."
  return 'Something went wrong while signing you in. Please try again.'
}

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  if (session) return <Navigate to="/dashboard" replace />

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return

    const trimmed = email.trim()
    const badEmail = !trimmed
      ? 'Enter your email address.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
        ? 'Enter a valid email address, like you@example.com.'
        : null
    const badPassword = password ? null : 'Enter your password.'

    setEmailError(badEmail)
    setPasswordError(badPassword)
    setFormError(null)
    if (badEmail || badPassword) {
      ;(badEmail ? emailRef : passwordRef).current?.focus()
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password })
    setBusy(false)
    if (error) {
      setFormError(friendlyError(error.message))
      passwordRef.current?.focus()
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Manage your bookings and calendar."
      footer={
        <>
          New to Appointly?{' '}
          <Link
            to="/register"
            className="rounded font-medium text-brand-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{formError}</p>
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            ref={emailRef}
            name="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError(null)
            }}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'email-error' : undefined}
            className={`${field} ${emailError ? fieldBad : fieldOk}`}
          />
          {emailError && (
            <p id="email-error" className="mt-1.5 text-sm text-red-600">
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              ref={passwordRef}
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? 'password-error' : undefined}
              className={`${field} pr-12 ${passwordError ? fieldBad : fieldOk}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-controls="password"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 outline-none transition-colors hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-inset"
            >
              {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
            </button>
          </div>
          {passwordError && (
            <p id="password-error" className="mt-1.5 text-sm text-red-600">
              {passwordError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-brand-600/60"
        >
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
