import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { getUser } from '../store'

const API_BASE = 'http://127.0.0.1:8000'

async function markAsRead(notifId, userId) {
  await fetch(`${API_BASE}/notifications/${notifId}/read?user_id=${userId}`, {
    method: 'PATCH',
  }).catch(console.error)
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
    return data.motivation || null
  } catch (e) {
    console.error('[LLM motivation error]', e)
    return null
  }
}

const NOTIF_CONFIG = {
  due_today:         { icon: '⏰', style: { background: '#FEF3C7', color: '#78350f' }, duration: 9000 },
  due_date_overdue:  { icon: '🔴', style: { background: '#FEE2E2', color: '#7f1d1d' }, duration: 10000 },
  subtask_completed: { icon: '✅', style: { background: '#DBEAFE', color: '#1e3a5f' }, duration: 6000 },
  task_done:         { icon: '🎉', style: { background: '#DCFCE7', color: '#14532d' }, duration: 7000 },
}

// Типы из БД которые показываем (до маппинга)
const ALLOWED_DB_TYPES = new Set([
  'due_today',
  'due_date_overdue',
  'subtask_completed',
  'status_changed', // маппится в task_done
])

function remapNotification(n) {
  if (n.type === 'status_changed' && n.message?.includes('→ Выполнено')) {
    return { ...n, type: 'task_done', title: 'Задача выполнена!' }
  }
  return n
}

async function showNotification(n, userId) {
  const mapped = remapNotification(n)
  const config = NOTIF_CONFIG[mapped.type]
  if (!config) return

  const motivation = await getMotivation(mapped)
  const detail = mapped.message
      ? `${config.icon} ${mapped.title}: ${mapped.message}`
      : `${config.icon} ${mapped.title}`
  const text = motivation ? `${detail}\n\n💬 ${motivation}` : detail

  toast(text, {
    duration: config.duration,
    position: 'top-right',
    style: { maxWidth: '420px', whiteSpace: 'pre-line', ...config.style },
  })

  // Помечаем прочитанным в БД через is_read
  if (mapped.id) markAsRead(mapped.id, userId)
}

export default function NotificationsListener() {
  const [userId, setUserId] = useState(() => getUser()?.id ?? null)
  const shownTaskDone = useState(() => new Set())[0]

  // Загружаем непрочитанные просроченные прямо из Supabase
  async function loadUnreadOverdue(userId) {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .in('type', ['due_today', 'due_date_overdue'])
        .gte('created_at', today + 'T00:00:00.000Z') // только за сегодня
        .order('created_at', { ascending: true })

    if (error) {
      console.error('[Overdue] ошибка:', error)
      return
    }

    // Записи за сегодня уже есть — показываем только непрочитанные
    if (data && data.length > 0) {
      const unread = data.filter(n => !n.is_read)

      if (unread.length > 0) {
        unread.forEach((n, i) => {
          setTimeout(() => showNotification(n, userId), i * 1500)
        })

        await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', unread.map(n => n.id))
            .eq('user_id', userId)
      }

      return // записи за сегодня есть — фолбэк не нужен
    }

    // Записей за сегодня нет совсем — запускаем фолбэк
    await checkOverdueTasks(userId)
  }

// Фолбэк — если кроны ещё не создали записи в notifications
  async function checkOverdueTasks(userId) {
    const today = new Date().toISOString().split('T')[0]

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, status:ref_task_status(code)')
        .eq('user_id', userId)
        .not('due_date', 'is', null)
        .lte('due_date', today)

    if (error) {
      console.error('[Overdue check] ошибка:', error)
      return
    }

    const active = (tasks || []).filter(t => t.status?.code !== 'done')
    if (active.length === 0) return

    // Вставляем уведомления в БД и сразу помечаем прочитанными
    const records = active.map(task => {
      const isToday = task.due_date === today
      return {
        user_id: userId,
        task_id: task.id,
        type: isToday ? 'due_today' : 'due_date_overdue',
        title: isToday ? 'Последний день!' : 'Задача просрочена!',
        message: isToday
            ? `«${task.title}» — срок истекает сегодня`
            : `«${task.title}» — срок истёк ${task.due_date}`,
        is_read: true, // ← сразу помечаем прочитанным
      }
    })

    const { error: insertError } = await supabase
        .from('notifications')
        .insert(records)

    if (insertError) {
      console.error('[Overdue insert] ошибка:', insertError)
    }

    // Показываем toast
    active.forEach((task, i) => {
      const isToday = task.due_date === today
      setTimeout(() => {
        showNotification({
          type: isToday ? 'due_today' : 'due_date_overdue',
          title: isToday ? 'Последний день!' : 'Задача просрочена!',
          message: isToday
              ? `«${task.title}» — срок истекает сегодня`
              : `«${task.title}» — срок истёк ${task.due_date}`,
        }, userId)
      }, i * 1500)
    })
  }

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

  // При входе: все непрочитанные из БД (is_read = false)
  // due_today и due_date_overdue тоже берём отсюда — крон их уже создал
  // При входе: просроченные
  useEffect(() => {
    if (!userId) return
    loadUnreadOverdue(userId) // вместо старого checkOverdueTasks
  }, [userId])

  // Realtime: только живые события (не due_today/overdue — их показал loadUnread)
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
              const n = payload.new

              // due_today / due_date_overdue создаёт крон — покажет loadUnread при следующем входе
              if (n.type === 'due_today' || n.type === 'due_date_overdue') return

              if (!ALLOWED_DB_TYPES.has(n.type)) return

              const mapped = remapNotification(n)

              // subtask_completed не показываем если та же задача уже стала done
              if (mapped.type === 'subtask_completed') {
                if (n.task_id && shownTaskDone.has(n.task_id)) return
              }

              if (mapped.type === 'task_done' && n.task_id) {
                shownTaskDone.add(n.task_id)
              }

              showNotification(n, userId)
            }
        )
        .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId])

  return null
}