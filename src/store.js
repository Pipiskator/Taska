import {createClient} from "@supabase/supabase-js";

export const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
)
const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY
const USER_KEY = 'taska_user'
const TASK_SELECT = `
  id,user_id,title,description,due_date,created_at,status_id,priority_id,
  ref_task_status(code),ref_priority(code),
  subtasks(id,title,done,position),
  task_dependencies!fk_dep_task(depends_on_id)
`.replace(/\s+/g, '')

let refsPromise = null
const PASSWORD_ITERATIONS = 120000

async function getUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

function mapTask(row) {
  return {
    id: String(row.id),
    title: row.title ?? '',
    description: row.description ?? '',
    status: row.ref_task_status?.code ?? 'todo',
    priority: row.ref_priority?.code ?? 'med',
    createdAt: row.created_at ?? new Date().toISOString(),
    dueDate: row.due_date ?? '',
    dependsOn: (row.task_dependencies ?? []).map(d => String(d.depends_on_id)),
    subtasks: (row.subtasks ?? [])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(s => ({
        id: String(s.id),
        title: s.title,
        done: Boolean(s.done),
      })),
  }
}

async function hashPassword(password, email) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable')
  }

  const normalizedEmail = email.trim().toLowerCase()
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(`taska:${normalizedEmail}`),
      iterations: PASSWORD_ITERATIONS,
    },
    keyMaterial,
    256,
  )

  const hex = [...new Uint8Array(bits)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')

  return `pbkdf2$${PASSWORD_ITERATIONS}$${hex}`
}

function makeUrl(path, query = {}) {
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL)
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  })
  return url.toString()
}

function extractErrorText(text) {
  try {
    const parsed = JSON.parse(text)
    if (parsed.message) return parsed.message
    if (parsed.details) return parsed.details
    if (parsed.code) return parsed.code
  } catch {
    return text
  }
  return text
}

async function request(path, { method = 'GET', query, body, prefer } = {}) {
  const { data: { session } } = await supabase.auth.getSession()

  const token = session?.access_token

  const res = await fetch(makeUrl(path, query), {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase ${method} ${path}: ${extractErrorText(text || String(res.status))}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  return res.json()
}

async function getRefMaps() {
  if (!refsPromise) {
    refsPromise = (async () => {
      const [statuses, priorities] = await Promise.all([
        request('ref_task_status', { query: { select: 'id,code' } }),
        request('ref_priority', { query: { select: 'id,code' } }),
      ])

      const statusByCode = new Map(statuses.map(s => [s.code, s.id]))
      const priorityByCode = new Map(priorities.map(p => [p.code, p.id]))

      return {
        statusByCode,
        priorityByCode,
        defaultStatusId: statusByCode.get('todo') ?? statuses[0]?.id,
        defaultPriorityId: priorityByCode.get('med') ?? priorities[0]?.id,
      }
    })()
  }
  return refsPromise
}

async function upsertDependencies(taskId, dependsOn) {
  await request('task_dependencies', {
    method: 'DELETE',
    query: { task_id: `eq.${taskId}` },
    prefer: 'return=minimal',
  })

  if (!Array.isArray(dependsOn) || dependsOn.length === 0) return

  const rows = dependsOn
    .map(depId => Number(depId))
    .filter(Number.isFinite)
    .map(depends_on_id => ({ task_id: taskId, depends_on_id }))

  if (rows.length === 0) return

  await request('task_dependencies', {
    method: 'POST',
    body: rows,
    prefer: 'return=minimal',
  })
}

async function syncTaskStatusWithSubtasks(taskId) {
  const userId = await getUserId()
  if (!userId) return

  const subtasks = await request('subtasks', {
    query: {
      select: 'done',
      task_id: `eq.${taskId}`,
    },
  })

  if (!subtasks || subtasks.length === 0) return

  const doneCount = subtasks.filter(s => Boolean(s.done)).length
  let nextStatusCode = 'todo'

  if (doneCount === subtasks.length) {
    nextStatusCode = 'done'
  } else if (doneCount > 0) {
    nextStatusCode = 'inprogress'
  }

  const refs = await getRefMaps()
  const statusId = refs.statusByCode.get(nextStatusCode) ?? refs.defaultStatusId

  await request('tasks', {
    method: 'PATCH',
    query: {
      id: `eq.${taskId}`,
      user_id: `eq.${userId}`,
    },
    body: { status_id: statusId },
    prefer: 'return=minimal',
  })
}

export async function getTasks() {
  const userId = await getUserId()
  if (!userId) return []

  const rows = await request('tasks', {
    query: {
      select: TASK_SELECT,
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
    },
  })

  return rows.map(mapTask)
}

export async function getTask(id) {
  const userId = await getUserId()
  if (!userId) return null

  const taskId = Number(id)
  if (!Number.isFinite(taskId)) return null

  const rows = await request('tasks', {
    query: {
      select: TASK_SELECT,
      id: `eq.${taskId}`,
      user_id: `eq.${userId}`,
      limit: 1,
    },
  })

  return rows[0] ? mapTask(rows[0]) : null
}

export async function createTask(data) {
  const userId = await getUserId()
  if (!userId) throw new Error('User is not logged in')

  const refs = await getRefMaps()

  const payload = {
    user_id: userId,
    title: data.title?.trim() ?? '',
    description: data.description?.trim() || null,
    due_date: data.dueDate || null,
    status_id: refs.statusByCode.get(data.status) ?? refs.defaultStatusId,
    priority_id: refs.priorityByCode.get(data.priority) ?? refs.defaultPriorityId,
  }

  const rows = await request('tasks', {
    method: 'POST',
    query: { select: 'id' },
    body: payload,
    prefer: 'return=representation',
  })

  const createdId = rows?.[0]?.id
  if (!createdId) throw new Error('Task was not created')

  await upsertDependencies(createdId, data.dependsOn)
  return getTask(String(createdId))
}

export async function updateTask(id, data) {
  const userId = await getUserId()
  if (!userId) throw new Error('User is not logged in')

  const taskId = Number(id)
  if (!Number.isFinite(taskId)) return null

  const payload = {}

  if ('title' in data) payload.title = data.title?.trim() ?? ''
  if ('description' in data) payload.description = data.description?.trim() || null
  if ('dueDate' in data) payload.due_date = data.dueDate || null

  if ('status' in data || 'priority' in data) {
    const refs = await getRefMaps()
    if ('status' in data) {
      payload.status_id = refs.statusByCode.get(data.status) ?? refs.defaultStatusId
    }
    if ('priority' in data) {
      payload.priority_id = refs.priorityByCode.get(data.priority) ?? refs.defaultPriorityId
    }
  }

  if (Object.keys(payload).length > 0) {
    await request('tasks', {
      method: 'PATCH',
      query: {
        id: `eq.${taskId}`,
        user_id: `eq.${userId}`,
      },
      body: payload,
      prefer: 'return=minimal',
    })
  }

  if ('dependsOn' in data) {
    await upsertDependencies(taskId, data.dependsOn)
  }

  return getTask(String(taskId))
}

export async function deleteTask(id) {
  const userId = await getUserId()
  if (!userId) return

  const taskId = Number(id)
  if (!Number.isFinite(taskId)) return

  await request('tasks', {
    method: 'DELETE',
    query: {
      id: `eq.${taskId}`,
      user_id: `eq.${userId}`,
    },
    prefer: 'return=minimal',
  })
}

export async function addSubtask(taskId, title) {
  const parsedTaskId = Number(taskId)
  if (!Number.isFinite(parsedTaskId)) return

  const existing = await request('subtasks', {
    query: {
      select: 'position',
      task_id: `eq.${parsedTaskId}`,
      order: 'position.desc',
      limit: 1,
    },
  })
  const nextPosition = (existing[0]?.position ?? 0) + 1

  await request('subtasks', {
    method: 'POST',
    body: {
      task_id: parsedTaskId,
      title: title.trim(),
      done: false,
      position: nextPosition,
    },
    prefer: 'return=minimal',
  })

  await syncTaskStatusWithSubtasks(parsedTaskId)
}

export async function toggleSubtask(taskId, subtaskId) {
  const parsedTaskId = Number(taskId)
  const parsedSubtaskId = Number(subtaskId)
  if (!Number.isFinite(parsedTaskId) || !Number.isFinite(parsedSubtaskId)) return

  const rows = await request('subtasks', {
    query: {
      select: 'id,done',
      id: `eq.${parsedSubtaskId}`,
      task_id: `eq.${parsedTaskId}`,
      limit: 1,
    },
  })
  const item = rows[0]
  if (!item) return

  await request('subtasks', {
    method: 'PATCH',
    query: { id: `eq.${parsedSubtaskId}` },
    body: { done: !item.done },
    prefer: 'return=minimal',
  })

  await syncTaskStatusWithSubtasks(parsedTaskId)
}

export async function deleteSubtask(taskId, subtaskId) {
  const parsedTaskId = Number(taskId)
  const parsedSubtaskId = Number(subtaskId)
  if (!Number.isFinite(parsedTaskId) || !Number.isFinite(parsedSubtaskId)) return

  await request('subtasks', {
    method: 'DELETE',
    query: {
      id: `eq.${parsedSubtaskId}`,
      task_id: `eq.${parsedTaskId}`,
    },
    prefer: 'return=minimal',
  })

  await syncTaskStatusWithSubtasks(parsedTaskId)
}

export async function replaceSubtasks(taskId, subtasks) {
  const parsedTaskId = Number(taskId)
  if (!Number.isFinite(parsedTaskId)) return

  const existingRows = await request('subtasks', {
    query: {
      select: 'id,title,done,position',
      task_id: `eq.${parsedTaskId}`,
      order: 'position.asc',
    },
  })

  const existingById = new Map(existingRows.map(row => [String(row.id), row]))

  const desiredRows = (subtasks ?? [])
    .map((subtask, index) => ({
      id: String(subtask?.id ?? ''),
      title: (subtask?.title ?? '').trim(),
      done: Boolean(subtask?.done),
      position: index + 1,
    }))
    .filter(row => row.title.length > 0)

  const keptIds = new Set()
  let hasMutations = false

  for (const row of desiredRows) {
    const existing = existingById.get(row.id)

    if (existing) {
      keptIds.add(String(existing.id))

      const payload = {}
      if ((existing.title ?? '') !== row.title) payload.title = row.title
      if (Boolean(existing.done) !== row.done) payload.done = row.done
      if ((existing.position ?? 0) !== row.position) payload.position = row.position

      if (Object.keys(payload).length > 0) {
        hasMutations = true
        await request('subtasks', {
          method: 'PATCH',
          query: {
            id: `eq.${existing.id}`,
            task_id: `eq.${parsedTaskId}`,
          },
          body: payload,
          prefer: 'return=minimal',
        })
      }

      continue
    }

    hasMutations = true
    await request('subtasks', {
      method: 'POST',
      body: {
        task_id: parsedTaskId,
        title: row.title,
        done: row.done,
        position: row.position,
      },
      prefer: 'return=minimal',
    })
  }

  const idsToDelete = existingRows
    .filter(row => !keptIds.has(String(row.id)))
    .map(row => row.id)

  if (idsToDelete.length > 0) {
    hasMutations = true
    await request('subtasks', {
      method: 'DELETE',
      query: {
        task_id: `eq.${parsedTaskId}`,
        id: `in.(${idsToDelete.join(',')})`,
      },
      prefer: 'return=minimal',
    })
  }

  if (hasMutations) {
    await syncTaskStatusWithSubtasks(parsedTaskId)
  }
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) return false
  return true
}

export async function register({ email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  if (error) throw error
  return true
}

export function humanizeApiError(error, fallback = 'Ошибка запроса') {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('row-level security policy')) {
    return `${fallback}: нет прав (RLS). Передайте это бэкенд/DB разработчику.`
  }
  if (message.includes('violates foreign key constraint')) {
    return `${fallback}: проблема внешнего ключа. Проверьте справочники/связи в БД.`
  }
  if (message.includes('duplicate key value')) {
    return `${fallback}: запись с такими данными уже существует.`
  }
  return `${fallback}: ${message}`
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}
