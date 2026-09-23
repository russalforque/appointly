import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { supabase } from '../lib/supabase'
import { authErrorMessage } from '../lib/authErrors'
import { btn, input } from '../lib/ui'
import Field from '../components/Field'
import AuthLayout from '../components/AuthLayout'

/** Supabase reports a dead link in the URL rather than as a thrown error. */
function linkErrorFromUrl(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const code = hash.get('error_code') ?? query.get('error_code')
  const description = hash.get('error_description') ?? query.get('error_description')
  if (!code && !description) return null
  if (code === 'otp_expired' || /expired/i.test(description ?? ''))
    return 'That reset link has expired. Request a new one below.'
  return 'That reset link is not valid any more. Request a new one below.'
}

/**
 * Landing page for the recovery email. Opening the link signs the browser in with a short-lived
 * recovery session, so the new password is set with updateUser() against that session — there is
 * no token to handle here by hand.
 */
export default function ResetPassword() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [linkError] = useState(linkErrorFromUrl)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Signing out drops the recovery session so the link cannot be reused from browser history.
  useEffect(() => {
    if (!done) return
    const id = setTimeout(async () => {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    }, 2000)
    return () => clearTimeout(id)
  }, [done, navigate])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    if (password.length < 6) {
      setError('Choose a password with at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(authErrorMessage(error.message, 'update'))
    else setDone(true)
  }

  const footer = (
    <>
      Know your password?{' '}
      <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
        Sign in
      </Link>
    </>
  )

  if (authLoading) {
    return (
      <AuthLayout title="Set a new password" subtitle="Checking your link…" footer={footer}>
        <p className="text-sm text-slate-500">One moment…</p>
      </AuthLayout>
    )
  }

  if (linkError || !session) {
    return (
      <AuthLayout title="Link no longer works" subtitle="Reset links are single-use and short-lived." footer={footer}>
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{linkError ?? 'Open the reset link from your email, or request a new one.'}</p>
        </div>
        <Link to="/forgot-password" className={`${btn} mt-4 block w-full py-2.5 text-center`}>
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can sign in with it now." footer={footer}>
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Your password has been changed. Taking you to sign in…
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose something you don't use elsewhere." footer={footer}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        <Field label="New password" hint="At least 6 characters">
          <div className="relative">
            <input
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              className={`${input} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
            </button>
          </div>
        </Field>
        <Field label="Confirm new password">
          <input
            name="confirm"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              if (error) setError(null)
            }}
            className={input}
          />
        </Field>
        <button className={`${btn} flex w-full items-center justify-center gap-2 py-2.5`} disabled={busy} aria-busy={busy}>
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  )
}
