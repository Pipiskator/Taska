import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout.jsx'
import TaskCard from '../components/task/TaskCard.jsx'
import { Empty } from '../components/ui/index.jsx'
import { getTasks, getUser, humanizeApiError } from '../store.js'

const STATUS_FILTERS = [
  { value: 'all',        label: 'Все' },
  { value: 'todo',       label: 'К выполнению' },
  { value: 'inprogress', label: 'В процессе' },
  { value: 'done',       label: 'Выполнено' },
]

const PRIORITY_FILTERS = [
  { value: 'all',  label: 'Любой' },
  { value: 'high', label: 'Высокий' },
  { value: 'med',  label: 'Средний' },
  { value: 'low',  label: 'Низкий' },
]

export default function TasksPage() {
  const navigate = useNavigate()
  const [tasks, setTasks]       = useState([])
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('all')
  const [priority, setPriority] = useState('all')
  const [tick, setTick]         = useState(0)
  const [error, setError]       = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        if (!getUser()) { navigate('/login'); return }
        const list = await getTasks()
        if (!cancelled) {
          setTasks(list)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(humanizeApiError(err, 'Не удалось загрузить задачи'))
      }
    }

    load()
    return () => { cancelled = true }
  }, [navigate, tick])

  const filtered = tasks.filter(t => {
    const matchSearch   = t.title.toLowerCase().includes(search.toLowerCase()) ||
                          t.description?.toLowerCase().includes(search.toLowerCase())
    const matchStatus   = status   === 'all' || t.status   === status
    const matchPriority = priority === 'all' || t.priority === priority
    return matchSearch && matchStatus && matchPriority
  })

  // Group: active first, done last
  const active = filtered.filter(t => t.status !== 'done')
  const done   = filtered.filter(t => t.status === 'done')

  const refresh = () => setTick(t => t + 1)

  return (
    <Layout
      title="Мои задачи"
      actions={
        <button onClick={() => navigate('/tasks/new')} className="btn btn-primary btn-sm">
          + Задача
        </button>
      }
    >
      {/* Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className="input pl-8"
          placeholder="Поиск по задачам..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 transition-colors cursor-pointer border-0
                ${status === f.value ? 'bg-accent text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="input py-1.5 w-auto text-xs"
        >
          {PRIORITY_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label} приоритет</option>
          ))}
        </select>
      </div>

      {/* Stats row */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Всего',      val: tasks.length },
            { label: 'В процессе', val: tasks.filter(t => t.status === 'inprogress').length },
            { label: 'Выполнено',  val: tasks.filter(t => t.status === 'done').length },
          ].map(s => (
            <div key={s.label} className="card px-3 py-2.5 text-center">
              <div className="text-xl font-semibold text-accent">{s.val}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Task list */}
      {error && (
        <div className="card px-3 py-2 mb-3 text-xs text-red-500">{error}</div>
      )}

      {filtered.length === 0 ? (
        <Empty text={search ? 'Ничего не найдено' : 'Задач нет — создайте первую!'} />
      ) : (
        <>
          {active.map(t => <TaskCard key={t.id} task={t} onUpdate={refresh} />)}

          {done.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">
                Выполнено · {done.length}
              </p>
              {done.map(t => <TaskCard key={t.id} task={t} onUpdate={refresh} />)}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
