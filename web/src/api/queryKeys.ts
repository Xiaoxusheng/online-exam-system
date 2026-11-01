type KeyParams = object

export const queryKeys = {
  me: ['auth', 'me'] as const,
  dashboard: ['dashboard', 'summary'] as const,

  campuses: ['org', 'campuses'] as const,
  classes: (campusId?: string) => ['org', 'classes', { campus_id: campusId ?? '' }] as const,
  users: (params: KeyParams) => ['org', 'users', params] as const,
  roles: ['org', 'roles'] as const,

  banks: ['question', 'banks'] as const,
  questions: (params: KeyParams) => ['question', 'list', params] as const,
  question: (id: string) => ['question', 'detail', id] as const,

  papers: (params: KeyParams) => ['paper', 'list', params] as const,
  paper: (id: string) => ['paper', 'detail', id] as const,

  exams: (params: KeyParams) => ['exam', 'list', params] as const,
  exam: (id: string) => ['exam', 'detail', id] as const,
  candidates: (examId: string, page: number) => ['exam', 'candidates', examId, page] as const,
  examStaff: (examId: string, kind: 'proctors' | 'reviewers') => ['exam', 'staff', examId, kind] as const,

  myExams: ['student', 'my-exams'] as const,
  attempt: (attemptId: string) => ['student', 'attempt', attemptId] as const,
  myScores: ['student', 'my-scores'] as const,
  // Deliberately separate from scoreRecord: the two endpoints return different shapes,
  // and sharing one key let the candidate page render the admin payload (and vice versa).
  myScoreRecord: (attemptId: string) => ['student', 'score-record', attemptId] as const,

  scores: (params: KeyParams) => ['score', 'list', params] as const,
  scoreRecord: (attemptId: string) => ['score', 'record', attemptId] as const,
  scoreAdjustments: (attemptId: string) => ['score', 'adjustments', attemptId] as const,
  analytics: (examId: string) => ['score', 'analytics', examId] as const,
  itemAnalytics: (examId: string) => ['score', 'analytics', examId, 'items'] as const,
  knowledgeAnalytics: (examId?: string) => ['analytics', 'knowledge', examId ?? 'all'] as const,
  appeals: (params: KeyParams) => ['appeal', 'list', params] as const,
  myAppeals: ['appeal', 'mine'] as const,

  reviewTasks: (params: KeyParams) => ['review', 'list', params] as const,
  reviewTask: (taskId: string) => ['review', 'detail', taskId] as const,
  reviewQueue: (taskId: string, params: KeyParams) => ['review', 'queue', taskId, params] as const,

  proctorRooms: ['proctor', 'rooms'] as const,
  proctorOverview: (examId: string) => ['proctor', 'overview', examId] as const,
  proctorEvents: (examId: string, params: KeyParams) => ['proctor', 'events', examId, params] as const,

  notifications: (params: KeyParams) => ['notification', 'list', params] as const,
  notificationTemplates: ['notification', 'templates'] as const,
  notificationChannels: ['notification', 'channels'] as const,
  notificationLogs: (params: KeyParams) => ['notification', 'logs', params] as const,
  branding: ['branding'] as const,

  auditLogs: (params: KeyParams) => ['system', 'audit-logs', params] as const,
  systemOverview: ['system', 'overview'] as const,
}
