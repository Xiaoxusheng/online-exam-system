import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'
import RequireAuth from './RequireAuth'
import RequireRole from './RequireRole'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/LoginPage'
import ModulePage from '../pages/ModulePage'
import NotFoundPage from '../pages/NotFoundPage'
import { moduleMeta, type ModuleKey } from '../pages/moduleMeta'

function guarded(path: string, element: ReactNode) {
  return <RequireRole path={path}>{element}</RequireRole>
}

function skeleton(path: string, key: ModuleKey) {
  return guarded(path, <ModulePage meta={moduleMeta[key]} />)
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="questions" element={skeleton('/questions', 'questions')} />
        <Route path="papers" element={skeleton('/papers', 'papers')} />
        <Route path="exams" element={skeleton('/exams', 'exams')} />
        <Route path="proctor" element={skeleton('/proctor', 'proctor')} />
        <Route path="review" element={skeleton('/review', 'review')} />
        <Route path="scores" element={skeleton('/scores', 'scores')} />
        <Route path="analytics" element={skeleton('/analytics', 'analytics')} />
        <Route path="system/users" element={skeleton('/system/users', 'users')} />
        <Route path="system/orgs" element={skeleton('/system/orgs', 'orgs')} />
        <Route path="system/audit-logs" element={skeleton('/system/audit-logs', 'auditLogs')} />
        <Route path="system/notifications" element={skeleton('/system/notifications', 'notifications')} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
