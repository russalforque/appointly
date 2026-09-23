// One place to turn a Supabase Auth error into something a person can act on.
//
// Supabase returns gateway and GoTrue internals verbatim ("AuthApiError: ...", "Database error
// saving new user"), which tell a business owner nothing and leak how the backend is put
// together. Anything not recognised here falls back to a generic line for the action in hand.

export type AuthAction = 'signin' | 'signup' | 'reset' | 'update'

const GENERIC: Record<AuthAction, string> = {
  signin: 'Something went wrong while signing you in. Please try again.',
  signup: 'We could not create your account. Please try again in a moment.',
  reset: 'We could not send the reset link. Please try again in a moment.',
  update: 'We could not update your password. Please try again.',
}

export function authErrorMessage(message: string, action: AuthAction): string {
  const m = message.toLowerCase()

  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return "That email and password don't match an account. Check them and try again."
  if (m.includes('email not confirmed'))
    return 'Confirm your email first — open the link we sent you, then sign in.'
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user_already_exists'))
    return 'An account already uses that email address. Sign in instead, or reset your password.'
  if (m.includes('password should be') || m.includes('weak_password') || m.includes('at least 6'))
    return 'Choose a password with at least 6 characters.'
  if (m.includes('same password') || m.includes('should be different'))
    return 'Choose a password you have not used on this account before.'
  if (m.includes('invalid email') || m.includes('email_address_invalid'))
    return 'Enter a valid email address, like you@example.com.'
  if (m.includes('token has expired') || m.includes('otp_expired') || m.includes('invalid or has expired'))
    return 'That link has expired. Request a new one and try again.'
  if (m.includes('too many') || m.includes('rate limit') || m.includes('for security purposes'))
    return 'Too many attempts. Wait a moment, then try again.'
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return "We couldn't reach Appointly. Check your connection and try again."

  return GENERIC[action]
}
