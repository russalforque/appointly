import { useCallback, useState, type FormEvent } from 'react'
import { AtSign, KeyRound, Loader2, ShieldCheck, ShieldX, UserPlus } from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { adminListAdmins, adminSetPlatformAdmin, adminSetUsername, myUsername } from '../../lib/admin'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/billing'
import { useLoad } from '../../lib/useLoad'
import { btnGhost, btnPrimary, input, panel } from '../../lib/ui'
import Field from '../../components/Field'
import { ErrorText, ListSkeleton, PageHeaderSkeleton, Saved } from '../../components/Status'

const USERNAME_HINT = '3–30 characters: lower-case letters, numbers, dot, dash or underscore.'

/** Your own sign-in name and password. Everything else on this page is about other people. */
function MySignIn({ username }: { username: string | null }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setPassword('')
    setConfirm('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <section className={`${panel} space-y-4`}>
      <div className="flex items-center gap-2">
        <KeyRound size={16} strokeWidth={1.75} className="text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-900">Your sign-in</h2>
      </div>

      <p className="text-sm text-neutral-600">
        You sign in as{' '}
        <span className="font-mono font-semibold text-neutral-900">{username ?? 'your email address'}</span>. Change
        the seeded password the first time you sign in.
      </p>

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" hint="At least 8 characters.">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            className={input}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            className={input}
          />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy || password.length < 8} className={`${btnPrimary} h-11 sm:h-10`}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            Change password
          </button>
          <Saved show={saved} />
        </div>
      </form>

      <ErrorText message={error} />
    </section>
  )
}

/**
 * Who holds platform-admin access. Granting it turns an ordinary account into Appointly staff:
 * with a username and no business of its own, that account only ever sees the admin area.
 * Every change here is re-authorized in the database.
 */
export default function AdminAdminsPage() {
  const { session } = useAuth()
  const load = useCallback(async () => {
    const [admins, username] = await Promise.all([adminListAdmins(), myUsername()])
    return { admins, username }
  }, [])
  const { data, loading, error, reload } = useLoad(load)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy('grant')
    setFormError(null)
    try {
      await adminSetPlatformAdmin(email.trim(), true)
      // The username is optional: without one the account signs in with its email as before.
      if (username.trim()) await adminSetUsername(email.trim(), username.trim().toLowerCase())
      setEmail('')
      setUsername('')
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not grant admin access.')
    }
    setBusy(null)
  }

  async function revoke(userEmail: string) {
    setBusy(userEmail)
    setFormError(null)
    try {
      await adminSetPlatformAdmin(userEmail, false)
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not remove admin access.')
    }
    setBusy(null)
  }

  if (loading)
    return (
      <div className="space-y-5">
        <PageHeaderSkeleton />
        <ListSkeleton rows={4} />
      </div>
    )
  if (error || !data) return <ErrorText message={error} />

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[28px]">Admins</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Accounts that can verify payments and change plans. An admin account with no business of its own
          never sees the business dashboard.
        </p>
      </div>

      <MySignIn username={data.username} />

      <form onSubmit={grant} className={`${panel} space-y-4`}>
        <div className="flex items-center gap-2">
          <UserPlus size={16} strokeWidth={1.75} className="text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-900">Grant admin access</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account email" hint="They sign up at /register first, then you promote that email here.">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="staff@appointly.ph"
              autoComplete="off"
              className={input}
            />
          </Field>
          <Field label="Username (optional)" hint={USERNAME_HINT}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-z0-9][a-z0-9_.\-]{2,29}"
              placeholder="staff.juan"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              className={input}
            />
          </Field>
        </div>

        <ErrorText message={formError} />

        <button type="submit" disabled={busy === 'grant' || !email.trim()} className={`${btnPrimary} h-11 sm:h-10`}>
          {busy === 'grant' ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} strokeWidth={1.75} />}
          Make admin
        </button>
      </form>

      <ul className="space-y-3">
        {data.admins.map((a) => {
          const isSelf = a.user_id === session?.user.id
          return (
            <li key={a.user_id} className={`${panel} flex flex-wrap items-center gap-3`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <ShieldCheck size={17} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
                  {a.full_name ?? a.email ?? 'Admin'}
                  {isSelf && (
                    <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
                      You
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-2 truncate text-xs text-neutral-500">
                  {a.username && (
                    <span className="inline-flex items-center gap-0.5 font-mono text-neutral-600">
                      <AtSign size={11} strokeWidth={2} />
                      {a.username}
                    </span>
                  )}
                  <span className="truncate">{a.email ?? '—'}</span>
                </p>
              </div>
              <p className="hidden text-xs text-neutral-500 sm:block">Since {fmtDate(a.created_at)}</p>
              <button
                onClick={() => a.email && revoke(a.email)}
                disabled={isSelf || busy === a.email || !a.email}
                title={isSelf ? 'You cannot remove your own admin access' : undefined}
                className={`${btnGhost} inline-flex items-center gap-1.5 disabled:opacity-40`}
              >
                {busy === a.email ? <Loader2 size={14} className="animate-spin" /> : <ShieldX size={14} strokeWidth={1.75} />}
                Remove
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
