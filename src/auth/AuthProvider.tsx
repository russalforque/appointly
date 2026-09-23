import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    // The listener is attached first so a session restored from the URL (the email-confirmation
    // and password-recovery links both arrive that way) cannot land between the getSession()
    // call and the subscription.
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return
      setSession(s)
      // A refresh that fails, or a sign-out, still has to release the app from its loading state.
      setLoading(false)
    })

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      // A network failure here means "not signed in", not "wait forever": without this the whole
      // app sits on its skeleton until the tab is reloaded.
      .catch(() => {
        if (active) setSession(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}
