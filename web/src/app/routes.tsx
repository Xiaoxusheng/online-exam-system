import { Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'
import RequireAuth from './RequireAuth'
import DashboardPage from '../pages/DashboardPage'
import LoginPage from '../pages/LoginPage'
import ModulePage from '../pages/ModulePage'
import NotFoundPage from '../pages/NotFoundPage'
import { moduleMeta } from '../pages/moduleMeta'

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
        <Route path="questions" element={<ModulePage meta={moduleMeta.questions} />} />
        <Route path="papers" element={<ModulePage meta={moduleMeta.papers} />} />
        <Route path="exams" element={<ModulePage meta={moduleMeta.exams} />} />
        <Route path="proctor" element={<ModulePage meta={moduleMeta.proctor} />} />
        <Route path="review" element={<ModulePage meta={moduleMeta.review} />} />
        <Route path="scores" element={<ModulePage meta={moduleMeta.scores} />} />
        <Route path="analytics" element={<ModulePage meta={moduleMeta.analytics} />} />
        <Route path="system/users" element={<ModulePage meta={moduleMeta.users} />} />
        <Route path="system/orgs" element={<ModulePage meta={moduleMeta.orgs} />} />
        <Route
          path="system/audit-logs"
          element={<ModulePage meta={moduleMeta.auditLogs} />}
        />
        <Route
          path="system/notifications"
          element={<ModulePage meta={moduleMeta.notifications} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
