import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { supabase } from '../lib/supabase'
import { emailForLogin } from '../lib/login'
import { authErrorMessage } from '../lib/authErrors'
import HomeRedirect from '../components/HomeRedirect'
import AuthLayout from '../components/AuthLayout'

const field =
  'block h-11 w-full rounded-lg border bg-white px-3.5 text-base text-slate-900 outline-none transition-colors placeholder:text-slate-400 sm:text-sm'
const fieldOk = 'border-slate-300 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15'
const fieldBad = 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/15'

export default function Login() {
  const { session } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [identifierError, setIdentifierError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const identifierRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Staff and business owners land in different places, so the redirect resolves the account first.
  if (session) return <HomeRedirect />

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return

    // Business owners sign in with their email; staff accounts have a username instead.
    const trimmed = identifier.trim()
    const badIdentifier = !trimmed
      ? 'Enter your email address or username.'
      : trimmed.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
        ? 'Enter a valid email address, like you@example.com.'
        : null
    const badPassword = password ? null : 'Enter your password.'

    setIdentifierError(badIdentifier)
    setPasswordError(badPassword)
    setFormError(null)
    if (badIdentifier || badPassword) {
      ;(badIdentifier ? identifierRef : passwordRef).current?.focus()
      return
    }

    setBusy(true)
    const lookup = await emailForLogin(trimmed)
    if (!lookup.ok) {
      setBusy(false)
      setFormError(
        lookup.reason === 'unknown'
          ? "No account uses that username. Check it, or sign in with your email address."
          : `Usernames can't be checked right now (${lookup.detail}). Sign in with your email address instead.`,
      )
      identifierRef.current?.focus()
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: lookup.email, password })
    setBusy(false)
    if (error) {
      setFormError(authErrorMessage(error.message, 'signin'))
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
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-slate-700">
            Email or username
          </label>
          <input
            id="identifier"
            ref={identifierRef}
            name="identifier"
            // Not type="email": a staff username is not an email address and the browser
            // would refuse to submit it.
            type="text"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              if (identifierError) setIdentifierError(null)
            }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            aria-invalid={Boolean(identifierError)}
            aria-describedby={identifierError ? 'identifier-error' : undefined}
            className={`${field} ${identifierError ? fieldBad : fieldOk}`}
          />
          {identifierError && (
            <p id="identifier-error" className="mt-1.5 text-sm text-red-600">
              {identifierError}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="rounded text-sm font-medium text-brand-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Forgot password?
            </Link>
          </div>
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
