import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, humanizeApiError } from '../store.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const ok = await login(email, password)
      if (!ok) {
        setError('Неверный email или пароль')
        return
      }
      navigate('/tasks')
    } catch (err) {
      setError(humanizeApiError(err, 'Не удалось выполнить вход'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-xl font-semibold text-gray-900">Taska</span>
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold mb-1">Вход</h1>
          <p className="text-sm text-gray-500 mb-5">Введите данные аккаунта</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button type="submit" className="btn btn-primary w-full justify-center py-2.5">
              Войти
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Нет аккаунта?{' '}
          <Link to="/register" className="text-accent hover:text-accent-hover">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
