import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout.jsx'
import { PriorityBadge, StatusBadge, Checkbox, AiBubble, formatDate, formatDue } from '../components/ui/index.jsx'
import { getTask, getTasks, updateTask, deleteTask, addSubtask, toggleSubtask, deleteSubtask, humanizeApiError } from '../store.js'
import { generateTaskDecomposition, generateTaskDescription, generateTaskEncouragement, humanizeLlmError } from '../llmClient.js'

const RECURRING_LABEL = { daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно' }

export default function TaskPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [task, setTask]         = useState(null)
  const [allTasks, setAllTasks] = useState([])
  const [localSubtasks, setLocalSubtasks] = useState([])
  const [newSub, setNewSub]     = useState('')
  const [aiText, setAiText]     = useState('')
  const [aiSubtasks, setAiSubtasks] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiApplying, setAiApplying] = useState(false)
  const [error, setError]       = useState('')

  async function refresh() {
    try {
      const [taskData, tasksData] = await Promise.all([getTask(id), getTasks()])
      setTask(taskData)
      setAllTasks(tasksData)
      setError('')
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось загрузить задачу'))
    }
  }

  useEffect(() => {
    refresh()
  }, [id])

  useEffect(() => {
    setLocalSubtasks(task?.subtasks ?? [])
  }, [task])

  if (!task) {
    return (
      <Layout title="Задача" back="/tasks">
        <div className="card px-4 py-3 text-sm text-gray-500">{error || 'Загрузка...'}</div>
      </Layout>
    )
  }

  const deps = task.dependsOn?.map(i => allTasks.find(t => t.id === i)).filter(Boolean)
  const due  = task.dueDate ? formatDue(task.dueDate) : null

  async function handleToggleSubtask(subtaskId) {
    const previous = localSubtasks
    const next = previous.map(subtask => (
      subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
    ))
    setLocalSubtasks(next)

    try {
      await toggleSubtask(id, subtaskId)
      await refresh()
    } catch (err) {
      setLocalSubtasks(previous)
      setError(humanizeApiError(err, 'Не удалось обновить подзадачу'))
    }
  }

  async function handleDelete() {
    if (window.confirm('Удалить задачу?')) {
      try {
        await deleteTask(id)
        navigate('/tasks')
      } catch (err) {
        setError(humanizeApiError(err, 'Не удалось удалить задачу'))
      }
    }
  }

  async function handleStatusChange(e) {
    try {
      await updateTask(id, { status: e.target.value })
      await refresh()
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось обновить статус'))
    }
  }

  async function handleAddSubtask(e) {
    e.preventDefault()
    if (!newSub.trim()) return
    try {
      await addSubtask(id, newSub.trim())
      setNewSub('')
      await refresh()
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось добавить подзадачу'))
    }
  }

  // AI: decompose
  async function handleDecompose() {
    setAiLoading(true)
    setAiText('')
    setAiSubtasks([])
    try {
      const result = await generateTaskDecomposition({ task, tasks: allTasks })
      setAiText(result.text)
      setAiSubtasks(result.subtasks ?? [])
    } catch (err) {
      setError(humanizeLlmError(err, 'Не удалось разложить задачу'))
    } finally {
      setAiLoading(false)
    }
  }

  // AI: motivational message
  async function handleMotivate() {
    setAiLoading(true)
    setAiText('')
    setAiSubtasks([])
    try {
      const text = await generateTaskEncouragement({ task, tasks: allTasks })
      setAiText(text)
    } catch (err) {
      setError(humanizeLlmError(err, 'Не удалось получить поддержку'))
    } finally {
      setAiLoading(false)
    }
  }

  // AI: generate description
  async function handleGenDesc() {
    setAiLoading(true)
    setAiText('')
    setAiSubtasks([])
    try {
      const text = await generateTaskDescription({ title: task.title, tasks: allTasks })
      setAiText(text)
    } catch (err) {
      setError(humanizeLlmError(err, 'Не удалось сгенерировать описание'))
    } finally {
      setAiLoading(false)
    }
  }

  async function handleApplySubtasks() {
    if (aiSubtasks.length === 0) return

    setAiApplying(true)
    try {
      for (const title of aiSubtasks) {
        await addSubtask(id, title)
      }
      setAiSubtasks([])
      await refresh()
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось применить подзадачи'))
    } finally {
      setAiApplying(false)
    }
  }

  return (
    <Layout title={task.title} back="/tasks" actions={
      <button onClick={() => navigate(`/tasks/${id}/edit`)} className="btn btn-secondary btn-sm">
        Редактировать
      </button>
    }>

      {/* Meta */}
      {error && (
        <div className="card px-3 py-2 mb-3 text-xs text-red-500">{error}</div>
      )}

      <div className="card px-4 py-4 mb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-900 leading-snug">{task.title}</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
          {due && <span className={`badge ${due.cls} bg-transparent px-0`}>📅 {due.label}</span>}
          {task.recurring && <span className="badge text-gray-500 bg-gray-100">🔁 {RECURRING_LABEL[task.recurring]}</span>}
        </div>

        {/* Change status inline */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Статус:</span>
          <select
            value={task.status}
            onChange={handleStatusChange}
            className="input py-1 text-xs w-auto"
          >
            <option value="todo">К выполнению</option>
            <option value="inprogress">В процессе</option>
            <option value="done">Выполнено</option>
          </select>
        </div>

        {/* Meta rows */}
        <div className="mt-3 space-y-1 text-xs text-gray-400 border-t border-gray-50 pt-3">
          <div>Создана: {formatDate(task.createdAt)}</div>
          {task.dueDate && <div>Срок: {task.dueDate}</div>}
          {deps.length > 0 && (
            <div>Зависит от: {deps.map(d => d.title).join(', ')}</div>
          )}
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <div className="card px-4 py-3.5 mb-3">
          <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Описание</p>
          <p className="text-sm text-gray-700 leading-relaxed">{task.description}</p>
        </div>
      )}

      {/* Subtasks */}
      <div className="card px-4 py-3.5 mb-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Подзадачи
            {localSubtasks.length > 0 && (
              <span className="ml-1 text-accent">
                {localSubtasks.filter(s => s.done).length}/{localSubtasks.length}
              </span>
            )}
          </p>
        </div>

        {localSubtasks.length > 0 && (
          <>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${(localSubtasks.filter(s => s.done).length / localSubtasks.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-1.5 mb-3">
              {localSubtasks.map(s => (
                <li key={s.id} className="flex items-center gap-2.5 group">
                  <Checkbox
                    checked={s.done}
                    onChange={() => { handleToggleSubtask(s.id) }}
                    size={16}
                  />
                  <span className={`flex-1 text-sm ${s.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {s.title}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await deleteSubtask(id, s.id)
                        await refresh()
                      } catch (err) {
                        setError(humanizeApiError(err, 'Не удалось удалить подзадачу'))
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs transition-opacity bg-transparent border-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <form onSubmit={handleAddSubtask} className="flex gap-2">
          <input
            className="input flex-1 py-1.5 text-xs"
            placeholder="Добавить подзадачу..."
            value={newSub}
            onChange={e => setNewSub(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">+</button>
        </form>
      </div>

      {/* AI tools */}
      <div className="card px-4 py-3.5 mb-3">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">ИИ-помощник</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleDecompose} disabled={aiLoading} className="btn btn-secondary btn-sm">
            ✦ Разбить на подзадачи
          </button>
          <button onClick={handleMotivate} disabled={aiLoading} className="btn btn-secondary btn-sm">
            ✦ Поддержать
          </button>
          <button onClick={handleGenDesc} disabled={aiLoading} className="btn btn-secondary btn-sm">
            ✦ Сгенерировать описание
          </button>
        </div>

        {(aiLoading || aiText) && (
          <>
            <AiBubble loading={aiLoading}>{aiText}</AiBubble>
            {!aiLoading && aiSubtasks.length > 0 && (
              <button
                onClick={handleApplySubtasks}
                disabled={aiApplying}
                className="btn btn-secondary btn-sm mt-2"
              >
                {aiApplying ? 'Применяю...' : 'Применить как подзадачи'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Delete */}
      <button onClick={handleDelete} className="btn btn-danger w-full justify-center">
        Удалить задачу
      </button>
    </Layout>
  )
}
