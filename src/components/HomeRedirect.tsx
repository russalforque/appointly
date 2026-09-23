import { useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import { homePathFor } from '../lib/login'
import { useLoad } from '../lib/useLoad'
import { Loading } from './Status'

/**
 * Sends a signed-in account to where it belongs: the admin area for Appointly staff, the
 * dashboard for everyone else. Used wherever "go to the app" is meant, so a staff account
 * never passes through the business dashboard on its way in.
 */
export default function HomeRedirect() {
  const { session, loading: authLoading } = useAuth()
  const load = useCallback(async () => (session ? homePathFor() : '/login'), [session])
  const { data: path, loading } = useLoad(load)

  if (authLoading || loading || !path) return <Loading />
  return <Navigate to={path} replace />
}
