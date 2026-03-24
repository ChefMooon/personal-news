import { useState, useEffect, useCallback } from 'react'
import { IPC } from '../../../shared/ipc-types'
import type { ScriptNotification } from '../../../shared/ipc-types'

interface UseScriptNotificationsReturn {
  notifications: ScriptNotification[]
  unreadCount: number
  loading: boolean
  markAllRead: () => Promise<void>
  markRead: (id: number) => Promise<void>
}

export function useScriptNotifications(): UseScriptNotificationsReturn {
  const [notifications, setNotifications] = useState<ScriptNotification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await window.api.invoke(IPC.SCRIPTS_GET_NOTIFICATIONS, 100)
      setNotifications(data as ScriptNotification[])
    } catch {
      // Non-critical data for UI chrome; keep sidebar usable on failures.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const unsub = window.api.on(IPC.SCRIPTS_UPDATED, () => {
      void fetchNotifications()
    })
    return unsub
  }, [fetchNotifications])

  const unreadCount = notifications.filter((notification) => notification.is_read === 0).length

  const markAllRead = useCallback(async (): Promise<void> => {
    await window.api.invoke(IPC.SCRIPTS_MARK_NOTIFICATIONS_READ)
    const now = Math.floor(Date.now() / 1000)
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.is_read === 0 ? { ...notification, is_read: 1, read_at: now } : notification
      )
    )
  }, [])

  const markRead = useCallback(async (id: number): Promise<void> => {
    await window.api.invoke(IPC.SCRIPTS_MARK_NOTIFICATIONS_READ, [id])
    const now = Math.floor(Date.now() / 1000)
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id ? { ...notification, is_read: 1, read_at: now } : notification
      )
    )
  }, [])

  return { notifications, unreadCount, loading, markAllRead, markRead }
}
