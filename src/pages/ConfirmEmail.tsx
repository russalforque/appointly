import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { supabase } from '../lib/supabase'
import { btn } from '../lib/ui'
import AuthLayout from '../components/AuthLayout'

/** Supabase reports a dead confirmation link in the URL rather than as a thrown error. */
function linkErrorFromUrl(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const code = hash.get('error_code') ?? query.get('error_code')
  const description = hash.get('error_description') ?? query.get('error_description')
  if (!code && !description) return null
  if (code === 'otp_expired' || /expired/i.test(description ?? ''))
    return 'That confirmation link has expired. Confirmation links are single-use and short-lived — sign up again, or ask for a new link from the sign-in page.'
  return 'That confirmation link is not valid any more. Sign up again, or ask for a new link from the sign-in page.'
}

/** How long the thank-you stays on screen before the redirect. */
const REDIRECT_SECONDS = 4

/**
 * Landing page for the confirmation email. Opening the link signs the browser in with the session
 * carried in the URL, which is how we know the address was confirmed. The session is then dropped
 * again so the account starts from a deliberate sign-in rather than a link in an inbox.
 */
export default function ConfirmEmail() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [linkError] = useState(linkErrorFromUrl)
  // Held in a ref as well: the sign-out below clears the session, and without this the page would
  // fall straight back to its "we couldn't confirm" state.
  const confirmedRef = useRef(false)
  const [confirmed, setConfirmed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS)

  // The confirmation session exists only to prove the click; signing out stops the link working
  // as a back-door login from browser history.
  useEffect(() => {
    if (linkError || confirmedRef.current || !session) return
    confirmedRef.current = true
    setConfirmed(true)
    void supabase.auth.signOut()
  }, [session, linkError])

  // A link that carries no session and no error (hand-edited, or already consumed in another tab)
  // would otherwise leave the page spinning for ever.
  useEffect(() => {
    if (linkError || loading || confirmedRef.current) return
    const id = setTimeout(() => {
      if (!confirmedRef.current) setTimedOut(true)
    }, 8000)
    return () => clearTimeout(id)
  }, [loading, linkError])

  useEffect(() => {
    if (!confirmed) return
    const tick = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000)
    const go = setTimeout(
      () => navigate('/login', { replace: true, state: { confirmed: true } }),
      REDIRECT_SECONDS * 1000,
    )
    return () => {
      clearInterval(tick)
      clearTimeout(go)
    }
  }, [confirmed, navigate])

  const footer = (
    <>
      Need a hand?{' '}
      <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
        Create an account
      </Link>
    </>
  )

  if (confirmed) {
    return (
      <AuthLayout
        title="Thank you for confirming"
        subtitle="Your email address is verified."
        footer={footer}
      >
        <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-green-700" />
          </div>
          <p className="mt-3 text-sm text-green-800">
            Your account is active. Taking you to sign in
            {seconds > 0 ? ` in ${seconds} second${seconds === 1 ? '' : 's'}` : ''}…
          </p>
        </div>
        <Link to="/login" className={`${btn} mt-4 block w-full py-2.5 text-center`}>
          Go to sign in now
        </Link>
      </AuthLayout>
    )
  }

  if (linkError || timedOut) {
    return (
      <AuthLayout
        title="Link no longer works"
        subtitle="Confirmation links are single-use and short-lived."
        footer={footer}
      >
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {linkError ??
              'We could not confirm your email from this link. Try signing in — if it still asks you to confirm, sign up again to get a fresh link.'}
          </p>
        </div>
        <Link to="/login" className={`${btn} mt-4 block w-full py-2.5 text-center`}>
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Confirming your email" subtitle="This only takes a moment." footer={footer}>
      <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-brand-600" />
        <p>Checking your confirmation link…</p>
      </div>
    </AuthLayout>
  )
}
