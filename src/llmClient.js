const RAW_LLM_BASE_URL = import.meta.env.VITE_LLM_API_BASE_URL ?? ''
const LLM_BASE_URL = RAW_LLM_BASE_URL.trim().replace(/\/$/, '')

const STATUS_TO_COLUMN = {
  todo: 'Todo',
  inprogress: 'In Progress',
  done: 'Done',
}

const DEFAULT_CONTEXT = {
  project: {
    project_id: '00000000-0000-0000-0000-000000000001',
    project_name: 'Taska',
  },
  columns: [
    { id: '00000000-0000-0000-0000-000000000101', name: 'Todo', sort_order: 1 },
    { id: '00000000-0000-0000-0000-000000000102', name: 'In Progress', sort_order: 2 },
    { id: '00000000-0000-0000-0000-000000000103', name: 'Done', sort_order: 3 },
  ],
  task_types: [
    { id: '00000000-0000-0000-0000-000000000201', name: 'Task' },
  ],
}

function buildUrl(path) {
  return LLM_BASE_URL ? `${LLM_BASE_URL}${path}` : path
}

function normalizeDate(dateValue) {
  if (!dateValue) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : null
}

function taskIdToUuid(taskId, fallbackIndex = 0) {
  const numeric = Number(taskId)
  if (Number.isFinite(numeric) && numeric > 0) {
    return `00000000-0000-0000-0000-${Math.trunc(numeric).toString(16).padStart(12, '0').slice(-12)}`
  }

  const source = `${taskId ?? ''}:${fallbackIndex}`
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0
  }
  return `00000000-0000-0000-0000-${hash.toString(16).padStart(12, '0').slice(-12)}`
}

function mapTasksForContext(tasks = []) {
  return tasks.map((task, index) => ({
    id: taskIdToUuid(task.id, index),
    title: task.title ?? 'Без названия',
    description: task.description || null,
    column_name: STATUS_TO_COLUMN[task.status] ?? 'Todo',
    due_date: normalizeDate(task.dueDate),
    priority: task.priority ?? null,
    task_type_name: 'Task',
  }))
}

function dedupeTasks(tasks = []) {
  const unique = new Map()
  tasks.forEach(task => {
    if (!task?.id) return
    unique.set(String(task.id), task)
  })
  return [...unique.values()]
}

function buildContext(tasks = [], chatHistory = []) {
  return {
    ...DEFAULT_CONTEXT,
    chat_history: chatHistory.slice(-5),
    project_tasks: mapTasksForContext(tasks),
    current_date: new Date().toISOString().slice(0, 10),
  }
}

async function callLlm(path, payload) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (response.ok) {
        throw new Error('LLM вернул невалидный JSON')
      }
    }
  }

  if (!response.ok) {
    const detail = data?.detail
    const message =
      detail?.error ||
      detail?.message ||
      data?.error ||
      data?.message ||
      text ||
      `HTTP ${response.status}`
    throw new Error(message)
  }

  return data ?? {}
}

function extractMessage(result) {
  if (result?.message_to_user?.trim()) return result.message_to_user.trim()

  if (Array.isArray(result?.add_tasks) && result.add_tasks.length > 0) {
    return result.add_tasks
      .map((task, index) => `${index + 1}. ${task.title}`)
      .join('\n')
  }

  return ''
}

function parseSubtaskTitlesFromText(text) {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return []

  const numbered = cleaned.match(/\d+[.)]\s*[^]+?(?=(?:\s+\d+[.)]\s)|$)/g) ?? []
  if (numbered.length > 0) {
    return numbered
      .map(item => item.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }

  return cleaned
    .split(/[;•\-]\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export async function generateTaskDecomposition({ task, tasks = [] }) {
  const contextTasks = dedupeTasks([...tasks, task])
  const userMessage = [
    `Разбей задачу "${task.title}" на 4-6 конкретных подзадач.`,
    'Верни в message_to_user нумерованный список.',
    'Без вводных фраз и без markdown.',
  ].join(' ')

  const result = await callLlm('/llm/chat', {
    user_message: userMessage,
    context: buildContext(contextTasks, [{ role: 'user', content: userMessage }]),
  })

  const text = extractMessage(result)
  if (!text) throw new Error('LLM не вернул текст декомпозиции')

  const subtasksFromModel = (result?.add_tasks ?? [])
    .map(item => item?.title?.trim())
    .filter(Boolean)

  const subtasks = subtasksFromModel.length > 0
    ? subtasksFromModel
    : parseSubtaskTitlesFromText(text)

  return { text, subtasks }
}

export async function generateTaskDescription({ title, tasks = [] }) {
  const userMessage = [
    `Напиши краткое описание задачи "${title}" (2-3 предложения).`,
    'Верни только итоговое описание в message_to_user без вводных фраз.',
  ].join(' ')

  const result = await callLlm('/llm/chat', {
    user_message: userMessage,
    context: buildContext(tasks, [{ role: 'user', content: userMessage }]),
  })

  const text = extractMessage(result)
  if (!text) throw new Error('LLM не вернул текст описания')
  return text
}

export async function generateTaskEncouragement({ task, tasks = [] }) {
  const contextTasks = dedupeTasks([...tasks, task])
  const userHint = `Подбодри пользователя по задаче "${task.title}" коротко и дружелюбно.`

  const result = await callLlm('/llm/encouragement', {
    context: buildContext(contextTasks, [{ role: 'user', content: userHint }]),
  })

  const text = extractMessage(result)
  if (!text) throw new Error('LLM не вернул подбадривающее сообщение')
  return text
}

export function humanizeLlmError(error, fallback = 'Ошибка ИИ') {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return `${fallback}: LLM-сервис недоступен. Запустите модуль на http://127.0.0.1:8000.`
  }

  if (message.includes('Incorrect API key') || message.includes('Authentication')) {
    return `${fallback}: проверьте ключ DeepSeek в переменной LLM_API_KEY.`
  }

  return `${fallback}: ${message}`
}
