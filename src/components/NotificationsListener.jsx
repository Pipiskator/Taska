import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { getUser } from '../store'

const API_BASE = 'http://127.0.0.1:8000'

async function markAsRead(notifId, userId) {
  await fetch(`${API_BASE}/notifications/${notifId}/read?user_id=${userId}`, {
    method: 'PATCH',
  })
}

async function getMotivation(notification) {
  try {
    const res = await fetch(`${API_BASE}/llm/encouragement-for-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification_type: notification.type,
        notification_title: notification.title,
        notification_message: notification.message,
        task_title: notification.message?.match(/«(.+?)»/)?.[1] || null,
        project_name: 'Проект',
      }),
    })
    const data = await res.json()
    console.log('[LLM motivation]', data)
    return data.motivation || null
  } catch (e) {
    console.error('[LLM motivation error]', e)
    return null
  }
}

async function showNotification(n, userId) {
  const motivation = await getMotivation(n)

  const detail = n.message ? `${n.title}: ${n.message}` : n.title
  const text = motivation ? `${detail}\n\n💬 ${motivation}` : detail

  toast.success(text, {
    duration: 7000,
    position: 'top-right',
    style: { maxWidth: '420px', whiteSpace: 'pre-line' },
  })

  markAsRead(n.id, userId).catch(console.error)
}

export default function NotificationsListener() {
  const [userId, setUserId] = useState(() => getUser()?.id ?? null)

  // Ждём появления userId после логина
  useEffect(() => {
    const interval = setInterval(() => {
      const id = getUser()?.id ?? null
      if (id) {
        setUserId(id)
        clearInterval(interval)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [])

  // Показываем непрочитанные уведомления при входе
  useEffect(() => {
    if (!userId) return

    const loadUnread = async () => {
      try {
        const res = await fetch(`${API_BASE}/notifications?user_id=${userId}&unread_only=true`)
        const data = await res.json()

        if (!Array.isArray(data) || data.length === 0) return

        data.forEach((n, i) => {
          setTimeout(() => showNotification(n, userId), i * 1500)
        })
      } catch (e) {
        console.error('[Notifications] ошибка загрузки непрочитанных:', e)
      }
    }

    loadUnread()
  }, [userId])

  // Realtime — мгновенные уведомления
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          showNotification(payload.new, userId)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId])

  return null
}