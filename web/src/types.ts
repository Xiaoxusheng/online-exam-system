export type Role = 'org_admin' | 'exam_admin' | 'teacher' | 'reviewer' | 'proctor' | 'student'

export interface Pagination {
  page: number
  page_size: number
  total: number
}

export interface ListResult<T> {
  items: T[]
  pagination: Pagination
}

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
  campus_id?: string
  class_id?: string
  last_login_at?: string
  created_at: string
}

export interface LoginResult {
  token: string
  expires_at: string
  refresh_token: string
  refresh_expires_at: string
  user: User
}

export interface Campus {
  id: string
  name: string
  address: string
  status: string
  created_at: string
}

export interface Class {
  id: string
  org_id: string
  campus_id: string | null
  campus_name: string
  name: string
  grade: string
  status: string
  created_at: string
}

export interface RoleDescriptor {
  code: Role
  name: string
  data_scope: string
  description: string
}

export interface QuestionBank {
  id: string
  name: string
  scope: string
  status: string
  question_count: number
  created_at: string
}

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short' | 'essay' | 'programming' | 'media'

export interface QuestionOption {
  key: string
  text: string
}

export interface QuestionAttachment {
  media_id: string
  kind: 'image' | 'audio' | 'video'
  name?: string
}

export interface MediaScoringDimension {
  name: string
  weight: number
}

export interface OrgBranding {
  org_id: string
  name: string
  slogan: string
  logo_media_id: string
  logo_url: string | null
}

export interface QuestionContent {
  stem?: string
  options?: QuestionOption[]
  answers?: string[][]
  mode?: string
  languages?: string[]
  starter_code?: Record<string, string>
  cases?: { input?: string; output?: string; hidden?: boolean }[]
  stem_image?: string
  attachments?: QuestionAttachment[]
  /** media question tuning: recording window and retake budget */
  prepare_seconds?: number
  min_seconds?: number
  max_seconds?: number
  retake_limit?: number
  dimensions?: MediaScoringDimension[]
}

export interface QuestionAnswer {
  correct?: string[]
  answers?: string[][]
  reference?: string
  rubric?: string[]
}

export interface QuestionScoreRule {
  partial?: 'ratio' | ''
  ignore_case?: boolean
  trim_space?: boolean
}

export interface Question {
  id: string
  bank_id: string
  type: QuestionType
  knowledge_point: string
  difficulty: string
  content: QuestionContent
  answer: QuestionAnswer
  score_rule: QuestionScoreRule
  default_score: number
  status: string
  version: number
  created_at: string
  updated_at: string
}

export interface PaperQuestion {
  question_id: string
  section: string
  paper_group: string
  score: number
  type: QuestionType
  difficulty: string
  knowledge_point: string
  content: QuestionContent
}

export interface RandomSection {
  name: string
  bank_id: string
  type: QuestionType
  difficulty?: string
  knowledge_point?: string
  count: number
  score: number
}

export interface Paper {
  id: string
  type: 'fixed' | 'random' | 'ab'
  title: string
  status: string
  total_score: number
  version: number
  rules: { sections?: RandomSection[] }
  question_count: number
  created_at: string
  updated_at: string
}

export interface PaperDetail extends Paper {
  questions: PaperQuestion[]
}

export interface ExamRules {
  pass_score?: number
  show_score?: boolean
  anonymous_review?: boolean
  review_mode?: 'single' | 'double'
  review_threshold?: number
  restrict_mobile?: boolean
  disable_paste?: boolean
  screen_switch_limit?: number
  snapshot_interval?: number
  show_analysis?: boolean
}

export interface Exam {
  id: string
  paper_id: string
  paper_title: string
  paper_type: Paper['type']
  title: string
  start_at: string
  end_at: string
  duration_minutes: number
  status: string
  rules: ExamRules
  proctor_config: Record<string, unknown>
  candidate_count: number
  created_at: string
  updated_at: string
}

export interface ExamCandidate {
  id: string
  user_id: string
  name: string
  username: string
  phone: string
  ticket_no: string
  status: 'assigned' | 'waiting' | 'testing' | 'submitted' | 'absent'
  paper_group: string
  attempt_id: string | null
  created_at: string
}

export interface ExamStaff {
  user_id: string
  name: string
  username: string
  role: Role
  assigned_at: string
}

export interface MyExam {
  id: string
  title: string
  start_at: string
  end_at: string
  duration_minutes: number
  exam_status: string
  candidate_status: string
  attempt_id: string | null
  score: number | null
  score_status: string
}

export interface AttemptQuestion {
  question_id: string
  type: QuestionType
  section: string
  paper_group: string
  difficulty: string
  knowledge_point: string
  content: QuestionContent
  score: number
  saved_answer: Record<string, unknown>
  answer_version: number
}

export interface AttemptRules {
  disable_paste: boolean
  restrict_mobile: boolean
  screen_switch_limit: number
  snapshot_interval: number
}

export interface AttemptState {
  attempt_id: string
  exam_id: string
  exam_title: string
  status: 'in_progress' | 'submitted' | 'graded' | 'published'
  paper_group: string
  started_at: string
  deadline: string
  server_time: string
  remaining_seconds: number
  total_score: number
  questions: AttemptQuestion[]
  score: number | null
  pending_review: number
  rules: AttemptRules
}

export interface SubmitResult {
  attempt_id: string
  status: string
  total_score: number | null
  score_visible: boolean
  pending_review: number
  submitted_at: string
}

export interface ReviewTask {
  id: string
  attempt_id: string
  exam_id: string
  exam_title: string
  user_id: string
  user_name: string
  question_id: string
  question_type: QuestionType
  round: number
  status: string
  reviewer_id: string
  reviewer_name: string
  score: number | null
  comment: string
  created_at: string
  updated_at: string
}

export interface ReviewRound {
  round: number
  task_id: string
  status: string
  reviewer_id: string
  reviewer_name: string
  score: number | null
  comment: string
}

export interface ReviewTaskDetail extends ReviewTask {
  anonymous: boolean
  candidate_name: string
  exam_rules: ExamRules
  attempt_status: string
  review_mode: string
  review_threshold: number
  needs_arbitrate: boolean
  rounds: ReviewRound[]
  question: SnapshotQuestion
  answer: Record<string, unknown>
}

export interface ReviewSubmitResult {
  task_id: string
  round: number
  score: number
  final_score: number | null
  finalized: boolean
  arbitration: boolean
  next_task_id?: string
  attempt_total: number
  pending_review: number
}

export interface SnapshotQuestion {
  question_id: string
  type: QuestionType
  section: string
  paper_group: string
  difficulty: string
  knowledge_point: string
  content: QuestionContent
  answer: QuestionAnswer
  score_rule: QuestionScoreRule
  score: number
}

export interface ScoreDetailItem {
  question_id: string
  type: QuestionType
  score: number
  max_score: number
  needs_review: boolean
  auto: boolean
  /** Analysis fields ride along only when the exam released them (C-13). */
  correct?: (string | string[])[]
  reference?: string
  rubric?: string[]
}

export interface ScoreListItem {
  attempt_id: string
  user_id: string
  user_name: string
  username: string
  exam_id: string
  exam_title: string
  total: number
  score_status: string
  attempt_status: string
  submitted_at: string | null
  published_at: string | null
}

export interface ScoreRecordDetail extends ScoreListItem {
  detail: { questions: ScoreDetailItem[] }
}

export interface MyScore {
  attempt_id: string
  exam_id: string
  exam_title: string
  total: number
  status: string
  published_at: string | null
}

export interface ScoreBucket {
  label: string
  count: number
}

export interface ExamAnalytics {
  exam_id: string
  exam_title: string
  paper_title: string
  total_score: number
  pass_score: number
  candidate_count: number
  graded_count: number
  average: number
  highest: number
  lowest: number
  pass_rate: number
  distribution: ScoreBucket[]
}

export interface ItemOption {
  key: string
  count: number
  correct: boolean
}

export interface ItemAnalysis {
  question_id: string
  type: string
  stem: string
  knowledge_point: string
  difficulty: string
  max_score: number
  answered: number
  skipped: number
  correct: number
  correct_rate: number
  score_rate: number
  discrimination: number
  subjective: boolean
  options: ItemOption[]
}

export interface ExamItemAnalytics {
  exam_id: string
  exam_title: string
  participants: number
  sample_note: string
  items: ItemAnalysis[]
}

export interface KnowledgeTrend {
  exam_id: string
  exam_title: string
  score_rate: number
  answers: number
}

export interface KnowledgePointStat {
  name: string
  items: number
  answers: number
  correct: number
  score_rate: number
  correct_rate: number
  level: string
  trend: KnowledgeTrend[]
}

export interface KnowledgeAnalytics {
  scope: string
  exams: number
  participants: number
  points: KnowledgePointStat[]
}

export interface AdjustmentItem {
  question_id: string
  before: number
  after: number
  max_score: number
}

export interface ScoreAdjustment {
  id: string
  attempt_id: string
  before_total: number
  after_total: number
  reason: string
  items: AdjustmentItem[]
  operator_id: string
  operator_name: string
  created_at: string
}

export interface ScoreAppeal {
  id: string
  attempt_id: string
  exam_id: string
  exam_title: string
  question_id: string
  user_id: string
  user_name: string
  total: number
  reason: string
  status: string
  handle_note: string
  handler_name: string
  handled_at: string | null
  created_at: string
}

export interface ReviewQueue {
  position: number
  total: number
  prev_id: string
  next_id: string
}

export interface NotificationLog {
  id: string
  user_name: string
  user_account: string
  channel: string
  title: string
  content: string
  status: string
  source_type: string
  sent_at: string | null
  created_at: string
}

export interface ProctorRoom {
  exam_id: string
  title: string
  status: string
  start_at: string
  end_at: string
  duration_minutes: number
  candidates: number
  assigned: boolean
}

export interface ProctorEvent {
  id: number
  exam_id: string
  attempt_id: string
  user_id: string
  user_name: string
  type: string
  level: 'info' | 'warning' | 'critical'
  snapshot_url: string
  occurred_at: string
  handled_by: string | null
  handled_by_name: string
  action: string
  note: string
  created_at: string
}

export interface ProctorOverview {
  candidates: number
  waiting: number
  testing: number
  submitted: number
  absent: number
  online: number
  unhandled_events: number
  warning_events: number
  critical_events: number
}

export interface Notification {
  id: string
  channel: string
  title: string
  content: string
  status: 'pending' | 'sent' | 'failed' | 'read'
  source_type: string
  source_id: string
  sent_at: string | null
  created_at: string
}

export interface NotificationTemplate {
  id: string
  channel: string
  code: string
  title_tpl: string
  content_tpl: string
  enabled: boolean
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  actor_name: string
  action: string
  target_type: string
  target_id: string
  detail: Record<string, unknown>
  ip: string
  user_agent: string
  created_at: string
}

export interface SystemOverview {
  users: number
  students: number
  campuses: number
  classes: number
  question_banks: number
  questions: number
  questions_pending: number
  papers: number
  papers_pending: number
  exams: number
  exams_in_progress: number
  attempts_in_progress: number
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

export type RealtimeEventType =
  | 'connected'
  | 'exam_published'
  | 'exam_closed'
  | 'attempt_started'
  | 'attempt_submitted'
  | 'proctor_event'
  | 'proctor_event_handled'
  | 'pong'

export interface RealtimeEvent {
  type: RealtimeEventType
  exam_id?: string
  attempt_id?: string
  user_id?: string
  user_name?: string
  detail?: Record<string, unknown>
  timestamp?: string
  data?: {
    exam_id: string
    exam_title: string
    exam_status: string
    online: number
    server_time: string
  }
}
