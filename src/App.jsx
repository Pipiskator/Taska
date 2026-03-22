import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage    from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import TasksPage    from './pages/TasksPage.jsx'
import TaskPage     from './pages/TaskPage.jsx'
import TaskFormPage from './pages/TaskFormPage.jsx'
import { Toaster } from 'react-hot-toast'
import NotificationsListener from './components/NotificationsListener.jsx' 

// Only what's in scope:
// Auth (36), Tasks CRUD (16-18,20), Subtasks (3),
// Priority/Status/Due/Desc/CreatedAt/ID (6-12 minus Author),
// Recurring (14), Dependencies (15),
// Filter + Search (23,26), LLM x4 (38-41)


export default function App() {
  return (
    <>
      <Toaster position="top-right" />
      <NotificationsListener />
      <Routes>
        <Route path="/"               element={<Navigate to="/login" replace />} />
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/register"       element={<RegisterPage />} />
        <Route path="/tasks"          element={<TasksPage />} />
        <Route path="/tasks/new"      element={<TaskFormPage />} />
        <Route path="/tasks/:id"      element={<TaskPage />} />
        <Route path="/tasks/:id/edit" element={<TaskFormPage />} />
        <Route path="*"               element={<Navigate to="/tasks" replace />} />
      </Routes>
    </>
  )
}
