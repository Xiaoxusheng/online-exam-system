export type Role = 'org_admin' | 'exam_admin' | 'teacher' | 'reviewer' | 'proctor' | 'student'

export interface User {
  id: string
  org_id: string
  name: string
  username: string
  phone: string
  email: string
  role: Role
  data_scope: string
  status: 'active' | 'disabled'
}

export interface LoginResult {
  token: string
  expires_at: string
  user: User
}

export interface DashboardStats {
  students: number
  exams_in_progress: number
  pending_grading: number
  pending_review: number
}

export interface UpcomingExam {
  id: string
  title: string
  status: string
  start_at: string
  end_at: string
}

export interface RecentActivity {
  action: string
  actor_name: string
  created_at: string
}

export interface DashboardSummary {
  stats: DashboardStats
  upcoming_exams: UpcomingExam[]
  recent_activity: RecentActivity[]
}
