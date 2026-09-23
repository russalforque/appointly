import { supabase } from './supabase'
import { unwrap } from './db'
import type { AppNotification } from './types'

export const fetchNotifications = (businessId: string, limit = 20) =>
  unwrap<AppNotification[]>(
    supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),
  )

export const markNotificationRead = (id: string) =>
  unwrap<null>(supabase.from('notifications').update({ is_read: true }).eq('id', id))

export const markAllNotificationsRead = (businessId: string) =>
  unwrap<null>(supabase.from('notifications').update({ is_read: true }).eq('business_id', businessId).eq('is_read', false))
