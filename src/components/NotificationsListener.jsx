import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast, { useToasterStore } from 'react-hot-toast'
import { getUser } from '../store'
import { useLocation } from 'react-router-dom'

const API_BASE = '/llm'
const NOTIFICATION_TOAST_PREFIX = 'notification-'
const MOBILE_BREAKPOINT = 640
const motivationControllers = new Map()
const closedNotificationToasts = new Set()

function shouldSkipMotivation(notification) {
  if (!notification) return true
  if (notification.type === 'task_created') return true

  const title = String(notification.title ?? '').toLowerCase()
  if (notification.type === 'subtask_completed' && title.includes('добавлена')) {
    return true
  }

  return false
}

async function markAsRead(notifId, userId) {
  await fetch(`${API_BASE}/notifications/${notifId}/read?user_id=${userId}`, {
    method: 'PATCH',
  }).catch(console.error)
}

async function getMotivation(notification, signal) {
  try {
    const res = await fetch(`${API_BASE}/encouragement-for-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
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
    if (e?.name === 'AbortError') return null
    console.error('[LLM motivation error]', e)
    return null
  }
}

function closeNotificationToast(toastId) {
  if (!toastId) return
  closedNotificationToasts.add(toastId)
  const controller = motivationControllers.get(toastId)
  if (controller) {
    controller.abort()
    motivationControllers.delete(toastId)
  }
  toast.dismiss(toastId)
}

const NOTIF_CONFIG = {
  due_today:         { icon: '⏰', style: { background: '#FEF3C7', color: '#78350f' }, duration: 20000 },
  due_date_overdue:  { icon: '🔴', style: { background: '#FEE2E2', color: '#7f1d1d' }, duration: 22000 },
  subtask_completed: { icon: '✅', style: { background: '#DBEAFE', color: '#1e3a5f' }, duration: 18000 },
  task_done:         { icon: '🎉', style: { background: '#DCFCE7', color: '#14532d' }, duration: 18000 },
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

function makeNotificationKey(notification) {
  const taskPart = notification.task_id ?? 'no-task'
  const msgPart = notification.message ?? ''
  return `${notification.type}|${taskPart}|${msgPart}`
}

function uniqueByTaskAndMessage(notifications) {
  const unique = []
  const seen = new Set()

  for (const notification of notifications) {
    const key = makeNotificationKey(notification)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(notification)
  }

  return unique
}

function extractDatePart(value) {
  if (!value) return ''
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ''
}

function showOrUpdateNotificationToast({ toastId, detail, config, isMobile }) {
  toast.custom(
    (toastData) => (
      <div
        className="w-[420px] max-w-[calc(100vw-24px)] rounded-xl border border-black/10 shadow-sm px-3 py-2.5"
        style={{ whiteSpace: 'pre-line', ...config.style }}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 text-sm leading-relaxed">{detail}</div>
          <button
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => closeNotificationToast(toastData.id)}
            className="w-5 h-5 rounded-md border border-black/20 text-xs leading-none bg-white/30 hover:bg-white/50 cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>
    ),
    {
      id: toastId,
      duration: config.duration,
      position: isMobile ? 'bottom-right' : 'top-right',
    },
  )
}

function showNotification(n, userId, isMobile) {
  const mapped = remapNotification(n)
  const config = NOTIF_CONFIG[mapped.type]
  if (!config) return

  const detail = mapped.message
      ? `${config.icon} ${mapped.title}: ${mapped.message}`
      : `${config.icon} ${mapped.title}`
  const toastId = mapped.id
    ? `notification-${mapped.id}`
    : `notification-${mapped.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  closedNotificationToasts.delete(toastId)

  showOrUpdateNotificationToast({ toastId, detail, config, isMobile })

  // Помечаем прочитанным в БД через is_read
  if (mapped.id) markAsRead(mapped.id, userId)

  if (shouldSkipMotivation(mapped)) return

  const controller = new AbortController()
  motivationControllers.set(toastId, controller)

  getMotivation(mapped, controller.signal)
    .then((motivation) => {
      if (controller.signal.aborted) return
      if (closedNotificationToasts.has(toastId)) return
      if (!motivation) return
      showOrUpdateNotificationToast({
        toastId,
        detail: `${detail}\n\n💬 ${motivation}`,
        config,
        isMobile,
      })
    })
    .finally(() => {
      if (motivationControllers.get(toastId) === controller) {
        motivationControllers.delete(toastId)
      }
    })
    .catch((error) => {
      console.error('[LLM motivation error]', error)
    })
}

export default function NotificationsListener() {
  const location = useLocation()
  const [userId, setUserId] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)
  const shownTaskDone = useState(() => new Set())[0]
  const { toasts } = useToasterStore()

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const visibleNotificationToasts = toasts.filter(
    (t) => t.visible && String(t.id ?? '').startsWith(NOTIFICATION_TOAST_PREFIX),
  )
  const hasNotificationToasts = visibleNotificationToasts.length > 0

  function clearAllNotificationToasts() {
    visibleNotificationToasts.forEach((t) => closeNotificationToast(t.id))
    setTimeout(() => {
      visibleNotificationToasts.forEach((t) => toast.remove(t.id))
    }, 250)
  }

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
      const uniqueUnread = uniqueByTaskAndMessage(unread)

      if (uniqueUnread.length > 0) {
        uniqueUnread.forEach((n, i) => {
          setTimeout(() => showNotification(n, userId, isMobile), i * 1500)
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
    const endOfToday = `${today}T23:59:59.999`

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, status:ref_task_status(code)')
        .eq('user_id', userId)
        .not('due_date', 'is', null)
        .lte('due_date', endOfToday)

    if (error) {
      console.error('[Overdue check] ошибка:', error)
      return
    }

    const active = (tasks || []).filter(t => t.status?.code !== 'done')
    if (active.length === 0) return

    const activeTaskIds = active.map(task => task.id)
    const { data: existingNotifications, error: existingError } = await supabase
      .from('notifications')
      .select('task_id,type,message')
      .eq('user_id', userId)
      .in('type', ['due_today', 'due_date_overdue'])
      .in('task_id', activeTaskIds)
      .gte('created_at', `${today}T00:00:00.000Z`)

    if (existingError) {
      console.error('[Overdue existing] ошибка:', existingError)
    }

    const existingKeys = new Set(
      (existingNotifications ?? []).map(notification => makeNotificationKey(notification))
    )

    // Вставляем только отсутствующие уведомления
    const records = active
      .map(task => {
      const taskDueDate = extractDatePart(task.due_date)
      const isToday = taskDueDate === today
      const notification = {
        user_id: userId,
        task_id: task.id,
        type: isToday ? 'due_today' : 'due_date_overdue',
        title: isToday ? 'Последний день!' : 'Задача просрочена!',
        message: isToday
            ? `«${task.title}» — срок истекает сегодня`
            : `«${task.title}» — срок истёк ${taskDueDate || task.due_date}`,
        is_read: true, // ← сразу помечаем прочитанным
      }
      if (existingKeys.has(makeNotificationKey(notification))) return null
      return notification
    })
      .filter(Boolean)

    if (records.length > 0) {
      const { error: insertError } = await supabase
          .from('notifications')
          .insert(records)

      if (insertError) {
        console.error('[Overdue insert] ошибка:', insertError)
      }
    }

    // Показываем toast
    active.forEach((task, i) => {
      const taskDueDate = extractDatePart(task.due_date)
      const isToday = taskDueDate === today
      setTimeout(() => {
        showNotification({
          type: isToday ? 'due_today' : 'due_date_overdue',
          title: isToday ? 'Последний день!' : 'Задача просрочена!',
          message: isToday
              ? `«${task.title}» — срок истекает сегодня`
              : `«${task.title}» — срок истёк ${taskDueDate || task.due_date}`,
        }, userId, isMobile)
      }, i * 1500)
    })
  }

  useEffect(() => {
    getUser().then(user => {
      const nextUserId = user?.id ?? null
      setUserId(prev => (prev === nextUserId ? prev : nextUserId))
    })
  }, [location.pathname])

  useEffect(() => {
    // Загружаем сразу при монтировании
    getUser().then(user => setUserId(user?.id ?? null))

    // Подписываемся на события авторизации (логин/логаут)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    shownTaskDone.clear()
  }, [userId, shownTaskDone])

  // При входе: все непрочитанные из БД (is_read = false)
  // due_today и due_date_overdue тоже берём отсюда — крон их уже создал
  // При входе: просроченные
  useEffect(() => {
    if (!userId) return
    loadUnreadOverdue(userId) // вместо старого checkOverdueTasks
  }, [userId, isMobile])

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

              showNotification(n, userId, isMobile)
            }
        )
        .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId, isMobile])

  return (
    <>
      {hasNotificationToasts && (
        <div className={`fixed right-3 z-[10009] w-[420px] max-w-[calc(100vw-24px)] pointer-events-none ${isMobile ? 'bottom-3' : 'top-3'}`}>
          <button
            type="button"
            onClick={clearAllNotificationToasts}
            className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm hover:bg-red-100 pointer-events-auto"
          >
            Очистить все
          </button>
        </div>
      )}
    </>
  )
}
