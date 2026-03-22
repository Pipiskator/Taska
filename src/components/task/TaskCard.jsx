import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PriorityBadge, StatusBadge, formatDue, Checkbox } from '../ui/index.jsx'
import { updateTask, toggleSubtask, humanizeApiError } from '../../store.js'

const RECURRING_LABEL = { daily: '🔁 Ежедневно', weekly: '🔁 Еженедельно', monthly: '🔁 Ежемесячно' }

export default function TaskCard({ task, onUpdate }) {
  const navigate = useNavigate()
  const [expanded, setExpanded]         = useState(false)
  const [localSubtasks, setLocalSubtasks] = useState(task.subtasks ?? [])
  const [pendingToggles, setPendingToggles] = useState(new Set()) // пока id есть в сете — чекбокс заблокирован
  const [error, setError]               = useState('')
  const due = task.dueDate ? formatDue(task.dueDate) : null
  const depsCount = task.dependsOn?.length ?? 0

  useEffect(() => {
    setLocalSubtasks(task.subtasks ?? [])
  }, [task.subtasks])

  async function toggleStatus(e) {
    e.stopPropagation()
    const next = task.status === 'done' ? 'todo' : 'done'
    try {
      await updateTask(task.id, { status: next })
      onUpdate?.()
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось изменить статус'))
    }
  }

  async function handleToggleSubtask(subtaskId) {
    // Если запрос уже летит — игнорируем клик. Никакой гонки запросов.
    if (pendingToggles.has(subtaskId)) return

    const previous = localSubtasks
    setLocalSubtasks(prev => prev.map(s =>
        s.id === subtaskId ? { ...s, done: !s.done } : s
    ))
    setPendingToggles(prev => new Set(prev).add(subtaskId))

    try {
      await toggleSubtask(task.id, subtaskId)
      onUpdate?.()
    } catch (err) {
      setLocalSubtasks(previous)
      setError(humanizeApiError(err, 'Не удалось обновить подзадачу'))
    } finally {
      // Снимаем блокировку всегда — даже если запрос упал
      setPendingToggles(prev => { const s = new Set(prev); s.delete(subtaskId); return s })
    }
  }

  const doneSubtasks  = localSubtasks.filter(s => s.done).length
  const totalSubtasks = localSubtasks.length

  return (
      <div
          onClick={() => navigate(`/tasks/${task.id}`)}
          className={`card px-4 py-3.5 mb-2 cursor-pointer hover:border-gray-200 hover:shadow-sm transition-all
        ${task.status === 'done' ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Checkbox checked={task.status === 'done'} onChange={toggleStatus} />
          </div>

          <div className="flex-1 min-w-0">
            <p className={`font-medium leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
            </p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PriorityBadge priority={task.priority} />
              <StatusBadge status={task.status} />

              {due && (
                  <span className={`text-xs ${due.cls}`}>📅 {due.label}</span>
              )}

              {task.recurring && (
                  <span className="text-xs text-gray-400">{RECURRING_LABEL[task.recurring]}</span>
              )}

              {depsCount > 0 && (
                  <span className="text-xs text-gray-400">🔗 зависит от {depsCount}</span>
              )}

              {totalSubtasks > 0 && (
                  <span className="text-xs text-gray-400">{doneSubtasks}/{totalSubtasks} подзадач</span>
              )}

              {totalSubtasks > 0 && (
                  <button
                      onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                      className="text-xs text-accent hover:text-accent-hover bg-transparent border-0 cursor-pointer p-0"
                  >
                    {expanded ? 'Скрыть подзадачи' : 'Показать подзадачи'}
                  </button>
              )}
            </div>

            {/* Subtask progress bar */}
            {totalSubtasks > 0 && (
                <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${(doneSubtasks / totalSubtasks) * 100}%` }}
                  />
                </div>
            )}

            {/* Subtask list */}
            {expanded && totalSubtasks > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {localSubtasks.map(subtask => (
                      <li
                          key={subtask.id}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-2.5"
                      >
                        <Checkbox
                            checked={subtask.done}
                            size={14}
                            onChange={() => handleToggleSubtask(subtask.id)}
                            disabled={pendingToggles.has(subtask.id)}
                        />
                        <span className={`text-xs ${subtask.done ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                    {subtask.title}
                  </span>
                      </li>
                  ))}
                </ul>
            )}

            {/* Inline error — без window.alert */}
            {error && (
                <p
                    onClick={e => e.stopPropagation()}
                    className="mt-2 text-xs text-red-500 cursor-default"
                >
                  {error}
                </p>
            )}
          </div>
        </div>
      </div>
  )
}