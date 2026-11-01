import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  DashboardOutlined,
  TrophyOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FormOutlined,
  HistoryOutlined,
  LineChartOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'

export interface NavItem {
  key: string
  label: string
  icon?: ReactNode
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

export const navigation: NavGroup[] = [
  {
    key: 'overview',
    label: '总览',
    items: [
      { key: '/', label: '工作台', icon: <DashboardOutlined /> },
      { key: '/notifications', label: '我的通知', icon: <BellOutlined /> },
    ],
  },
  {
    key: 'student',
    label: '我的考试',
    items: [
      { key: '/my/exams', label: '我的考试', icon: <CalendarOutlined /> },
      { key: '/my/scores', label: '我的成绩', icon: <TrophyOutlined /> },
    ],
  },
  {
    key: 'exam-ops',
    label: '考试运营',
    items: [
      { key: '/questions', label: '题库管理', icon: <BookOutlined /> },
      { key: '/papers', label: '试卷与组卷', icon: <FileTextOutlined /> },
      { key: '/exams', label: '考试管理', icon: <CalendarOutlined /> },
      { key: '/proctor', label: '监考中心', icon: <SafetyCertificateOutlined /> },
      { key: '/review', label: '阅卷中心', icon: <FormOutlined /> },
      { key: '/review/workbench', label: '阅卷工作台', icon: <FileDoneOutlined /> },
    ],
  },
  {
    key: 'insights',
    label: '成绩与分析',
    items: [
      { key: '/scores', label: '成绩管理', icon: <BarChartOutlined /> },
      { key: '/analytics', label: '数据分析', icon: <LineChartOutlined /> },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    items: [
      { key: '/system/users', label: '账号与角色', icon: <TeamOutlined /> },
      { key: '/system/orgs', label: '组织架构', icon: <ApartmentOutlined /> },
      { key: '/system/audit-logs', label: '审计日志', icon: <HistoryOutlined /> },
      { key: '/system/notifications', label: '通知配置', icon: <NotificationOutlined /> },
    ],
  },
]

export function findNavTrail(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of navigation) {
    const item = group.items.find((node) => node.key === pathname)
    if (item) return { group, item }
  }
  return null
}

export function pageTitle(pathname: string): string {
  return findNavTrail(pathname)?.item.label ?? '页面不存在'
}
