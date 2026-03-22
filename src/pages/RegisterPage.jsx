import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register, humanizeApiError } from '../store.js'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!email.trim() || !password) {
      setError('Заполните email и пароль')
      return
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    setError('')

    try {
      const ok = await register({ name, email, password })
      if (!ok) {
        setError('Пользователь с таким email уже существует')
        return
      }
      navigate('/tasks')
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось зарегистрироваться'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-xl font-semibold text-gray-900">Taska</span>
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold mb-1">Регистрация</h1>
          <p className="text-sm text-gray-500 mb-5">Создайте новый аккаунт</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Имя</label>
              <input
                className="input"
                type="text"
                placeholder="Ваше имя"
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Пароль</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Повторите пароль</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError('') }}
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center py-2.5">
              {loading ? 'Создаю аккаунт...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-accent hover:text-accent-hover">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
