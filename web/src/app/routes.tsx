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
import ReviewPage from '../pages/review/ReviewPage'
import ScoresPage from '../pages/scores/ScoresPage'
import AnalyticsPage from '../pages/analytics/AnalyticsPage'
import ProctorPage from '../pages/proctor/ProctorPage'
import MyExamsPage from '../pages/student/MyExamsPage'
import MyScoresPage from '../pages/student/MyScoresPage'
import AttemptPage from '../pages/student/AttemptPage'
import UsersPage from '../pages/system/UsersPage'
import OrgsPage from '../pages/system/OrgsPage'
import AuditLogsPage from '../pages/system/AuditLogsPage'
import NotificationSettingsPage from '../pages/system/NotificationSettingsPage'

function guarded(path: string, element: ReactNode) {
  return <RequireRole path={path}>{element}</RequireRole>
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
        <Route path="my/exams" element={guarded('/my/exams', <MyExamsPage />)} />
        <Route path="my/scores" element={guarded('/my/scores', <MyScoresPage />)} />
        <Route path="attempts/:attemptId" element={guarded('/attempts/', <AttemptPage />)} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="questions" element={guarded('/questions', <QuestionsPage />)} />
        <Route path="papers" element={guarded('/papers', <PapersPage />)} />
        <Route path="exams" element={guarded('/exams', <ExamsPage />)} />
        <Route path="proctor" element={guarded('/proctor', <ProctorPage />)} />
        <Route path="review" element={guarded('/review', <ReviewPage />)} />
        <Route path="scores" element={guarded('/scores', <ScoresPage />)} />
        <Route path="analytics" element={guarded('/analytics', <AnalyticsPage />)} />
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
