import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'
import RequireAuth from './RequireAuth'
import RequireRole from './RequireRole'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/LoginPage'
import NotFoundPage from '../pages/NotFoundPage'
import NotificationsPage from '../pages/NotificationsPage'
import QuestionsPage from '../pages/questions/QuestionsPage'
import PapersPage from '../pages/papers/PapersPage'
import ExamsPage from '../pages/exams/ExamsPage'
import UsersPage from '../pages/system/UsersPage'
import OrgsPage from '../pages/system/OrgsPage'
import AuditLogsPage from '../pages/system/AuditLogsPage'
import NotificationSettingsPage from '../pages/system/NotificationSettingsPage'
import ModulePage from '../pages/ModulePage'
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
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="questions" element={guarded('/questions', <QuestionsPage />)} />
        <Route path="papers" element={guarded('/papers', <PapersPage />)} />
        <Route path="exams" element={guarded('/exams', <ExamsPage />)} />
        <Route path="proctor" element={skeleton('/proctor', 'proctor')} />
        <Route path="review" element={skeleton('/review', 'review')} />
        <Route path="scores" element={skeleton('/scores', 'scores')} />
        <Route path="analytics" element={skeleton('/analytics', 'analytics')} />
        <Route path="system/users" element={guarded('/system/users', <UsersPage />)} />
        <Route path="system/orgs" element={guarded('/system/orgs', <OrgsPage />)} />
        <Route path="system/audit-logs" element={guarded('/system/audit-logs', <AuditLogsPage />)} />
        <Route
          path="system/notifications"
          element={guarded('/system/notifications', <NotificationSettingsPage />)}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
