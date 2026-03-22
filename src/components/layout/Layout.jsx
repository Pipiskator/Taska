import { useNavigate } from 'react-router-dom'
import { logout, getUser } from '../../store.js'

export default function Layout({ children, title, back, actions }) {
  const navigate = useNavigate()
  const user = getUser()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Topbar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          {back && (
            <button onClick={() => navigate(back)} className="btn btn-ghost btn-sm -ml-1">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Назад
            </button>
          )}

          {!back && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="font-semibold text-gray-900">Taska</span>
            </div>
          )}

          <h1 className="text-sm font-medium text-gray-900 flex-1 truncate">{title}</h1>

          {actions}

          {!back && user && (
            <button onClick={handleLogout} className="btn btn-ghost btn-sm text-gray-400">
              Выйти
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {children}
      </main>
    </div>
  )
}
