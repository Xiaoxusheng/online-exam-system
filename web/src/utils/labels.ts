export const roleLabels: Record<string, string> = {
  org_admin: '机构管理员',
  exam_admin: '考务管理员',
  teacher: '命题教师',
  reviewer: '阅卷教师',
  proctor: '监考员',
  student: '考生',
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

export const activityLabels: Record<string, string> = {
  'auth.login': '登录了系统',
  'auth.logout': '退出了系统',
  'auth.login_failed': '登录失败',
}

export function roleLabel(role?: string): string {
  if (!role) return ''
  return roleLabels[role] ?? role
}

export function activityLabel(action: string): string {
  return activityLabels[action] ?? action
}
