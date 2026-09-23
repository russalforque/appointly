import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AlertCircle, Loader2, MailCheck } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { supabase } from '../lib/supabase'
import { authErrorMessage } from '../lib/authErrors'
import { btn, input } from '../lib/ui'
import Field from '../components/Field'
import AuthLayout from '../components/AuthLayout'

/**
 * Sends the Supabase recovery email. The redirect is built from the current origin rather than
 * a constant, so the same build works on a preview deployment and on the production domain —
 * every origin used this way has to be listed under Auth -> URL Configuration.
 */
export default function ForgotPassword() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address, like you@example.com.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    // Deliberately identical either way: whether an address has an account is not ours to tell.
    if (error && /rate limit|too many|for security purposes/i.test(error.message)) {
      setError(authErrorMessage(error.message, 'reset'))
      return
    }
    setSent(true)
  }

  const footer = (
    <>
      Remembered it?{' '}
      <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
        Back to sign in
      </Link>
    </>
  )

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle="A reset link is on its way." footer={footer}>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-50">
            <MailCheck aria-hidden="true" className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            If an Appointly account uses <span className="font-medium text-slate-900">{email.trim()}</span>, we have
            sent it a link to set a new password. The link expires after a short while — request another if it does.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={footer}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError(null)
            }}
            className={input}
          />
        </Field>
        <button className={`${btn} flex w-full items-center justify-center gap-2 py-2.5`} disabled={busy} aria-busy={busy}>
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
        <p className="text-xs text-slate-500">
          Staff accounts sign in with a username and no email address — ask an Appointly admin to reset those.
        </p>
      </form>
    </AuthLayout>
  )
}
