export const roleLabels: Record<string, string> = {
  org_admin: '机构管理员',
  exam_admin: '考务管理员',
  teacher: '命题教师',
  reviewer: '阅卷教师',
  proctor: '监考员',
  student: '考生',
}

export const dataScopeLabels: Record<string, string> = {
  org: '全机构',
  campus: '校区',
  class: '班级',
  self: '本人',
}

export const examStatusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending_publish: { label: '待发布', color: 'blue' },
  pending_start: { label: '待开考', color: 'gold' },
  in_progress: { label: '进行中', color: 'green' },
  ended: { label: '已结束', color: 'default' },
  grading: { label: '阅卷中', color: 'purple' },
  pending_publish_score: { label: '待发布成绩', color: 'gold' },
  published: { label: '已发布', color: 'green' },
  archived: { label: '已归档', color: 'default' },
}

export const paperStatusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending_review: { label: '待审核', color: 'gold' },
  approved: { label: '已通过', color: 'green' },
  rejected: { label: '已驳回', color: 'red' },
  archived: { label: '已归档', color: 'default' },
}

export const paperTypeLabels: Record<string, string> = {
  fixed: '固定卷',
  random: '随机卷',
  ab: 'AB 卷',
}

export const questionStatusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending_review: { label: '待审核', color: 'gold' },
  published: { label: '已发布', color: 'green' },
  archived: { label: '已归档', color: 'default' },
}

export const questionTypeLabels: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  short: '简答题',
  essay: '论述题',
  programming: '编程题',
  media: '音视频题',
}

export const difficultyLabels: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

export const candidateStatusLabels: Record<string, { label: string; color: string }> = {
  assigned: { label: '已编排', color: 'default' },
  waiting: { label: '候考中', color: 'gold' },
  testing: { label: '作答中', color: 'green' },
  submitted: { label: '已交卷', color: 'blue' },
  absent: { label: '缺考', color: 'red' },
}

export const attemptStatusLabels: Record<string, { label: string; color: string }> = {
  in_progress: { label: '作答中', color: 'green' },
  submitted: { label: '待阅卷', color: 'gold' },
  graded: { label: '已判分', color: 'blue' },
  published: { label: '已发布', color: 'green' },
}

export const reviewStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待阅', color: 'gold' },
  in_progress: { label: '阅卷中', color: 'blue' },
  submitted: { label: '已提交', color: 'green' },
  reviewed: { label: '已复核', color: 'green' },
}

export const scoreStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '未发布', color: 'gold' },
  published: { label: '已发布', color: 'green' },
}

export const proctorLevelLabels: Record<string, { label: string; color: string }> = {
  info: { label: '提示', color: 'default' },
  warning: { label: '警告', color: 'gold' },
  critical: { label: '严重', color: 'red' },
}

export const proctorEventTypeLabels: Record<string, string> = {
  tab_switch: '切屏',
  blur: '窗口失焦',
  copy: '复制内容',
  paste: '粘贴内容',
  fullscreen_exit: '退出全屏',
  network_offline: '网络中断',
  device_change: '切换设备',
  face_missing: '人脸缺失',
}

export const auditActionLabels: Record<string, string> = {
  'auth.login': '登录系统',
  'auth.logout': '退出登录',
  'auth.login_failed': '登录失败',
  'org.user_created': '创建账号',
  'org.user_updated': '修改账号',
  'org.campus_created': '创建校区',
  'org.class_created': '创建班级',
  'question.bank_created': '创建题库',
  'question.created': '创建题目',
  'question.updated': '修改题目',
  'question.published': '发布题目',
  'paper.created': '创建试卷',
  'paper.updated': '修改试卷',
  'paper.submitted_review': '提交试卷审核',
  'paper.approved': '审核通过试卷',
  'exam.created': '创建考试',
  'exam.published': '发布考试',
  'exam.candidates_added': '追加考生编排',
  'exam.proctors_assigned': '配置监考员',
  'exam.reviewers_assigned': '配置阅卷教师',
  'attempt.started': '开始作答',
  'attempt.submitted': '提交答卷',
  'review.submitted': '提交阅卷评分',
  'score.published': '发布成绩',
  'proctor.event_handled': '处置监考事件',
}

export function roleLabel(role?: string): string {
  if (!role) return ''
  return roleLabels[role] ?? role
}

export function dataScopeLabel(scope?: string): string {
  if (!scope) return ''
  return dataScopeLabels[scope] ?? scope
}

export function activityLabel(action: string): string {
  return auditActionLabels[action] ?? action
}

export function questionTypeLabel(type?: string): string {
  if (!type) return ''
  return questionTypeLabels[type] ?? type
}

export function difficultyLabel(value?: string): string {
  if (!value) return ''
  return difficultyLabels[value] ?? value
}

export function paperTypeLabel(value?: string): string {
  if (!value) return ''
  return paperTypeLabels[value] ?? value
}

export function proctorEventTypeLabel(value: string): string {
  return proctorEventTypeLabels[value] ?? value
}

/** Status pill lookup; falls back to the raw value so nothing renders blank. */
export function statusOf(
  map: Record<string, { label: string; color: string }>,
  value?: string | null,
): { label: string; color: string } {
  if (!value) return { label: '—', color: 'default' }
  return map[value] ?? { label: value, color: 'default' }
}
