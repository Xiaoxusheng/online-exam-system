import { lazy, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from './AppLayout'
import RequireAuth from './RequireAuth'
import RequireRole from './RequireRole'
import LoginPage from '../pages/LoginPage'
import NotFoundPage from '../pages/NotFoundPage'

// Every workspace page is split into its own chunk: the login screen and the shell
// stay small, and a role only downloads the pages it can open.
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'))
const QuestionsPage = lazy(() => import('../pages/questions/QuestionsPage'))
const PapersPage = lazy(() => import('../pages/papers/PapersPage'))
const ExamsPage = lazy(() => import('../pages/exams/ExamsPage'))
const ReviewPage = lazy(() => import('../pages/review/ReviewPage'))
const ReviewWorkbench = lazy(() => import('../pages/review/ReviewWorkbench'))
const ScoresPage = lazy(() => import('../pages/scores/ScoresPage'))
const AnalyticsPage = lazy(() => import('../pages/analytics/AnalyticsPage'))
const ProctorPage = lazy(() => import('../pages/proctor/ProctorPage'))
const MyExamsPage = lazy(() => import('../pages/student/MyExamsPage'))
const MyScoresPage = lazy(() => import('../pages/student/MyScoresPage'))
const AttemptPage = lazy(() => import('../pages/student/AttemptPage'))
const UsersPage = lazy(() => import('../pages/system/UsersPage'))
const OrgsPage = lazy(() => import('../pages/system/OrgsPage'))
const AuditLogsPage = lazy(() => import('../pages/system/AuditLogsPage'))
const NotificationSettingsPage = lazy(() => import('../pages/system/NotificationSettingsPage'))
const BrandingSettingsPage = lazy(() => import('../pages/system/BrandingSettingsPage'))
const SystemOpsPage = lazy(() => import('../pages/system/SystemOpsPage'))

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
        <Route path="review/workbench" element={guarded('/review/workbench', <ReviewWorkbench />)} />
        <Route path="scores" element={guarded('/scores', <ScoresPage />)} />
        <Route path="analytics" element={guarded('/analytics', <AnalyticsPage />)} />
        <Route path="system/users" element={guarded('/system/users', <UsersPage />)} />
        <Route path="system/orgs" element={guarded('/system/orgs', <OrgsPage />)} />
        <Route path="system/audit-logs" element={guarded('/system/audit-logs', <AuditLogsPage />)} />
        <Route
          path="system/notifications"
          element={guarded('/system/notifications', <NotificationSettingsPage />)}
        />
        <Route path="system/branding" element={guarded('/system/branding', <BrandingSettingsPage />)} />
        <Route path="system/ops" element={guarded('/system/ops', <SystemOpsPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
