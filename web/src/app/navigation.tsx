import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FormOutlined,
  HistoryOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'

export interface NavItem {
  key: string
  label: string
  icon?: ReactNode
  children?: NavItem[]
}

export const navigation: NavItem[] = [
  { key: '/', label: '工作台', icon: <DashboardOutlined /> },
  { key: '/questions', label: '题库管理', icon: <BookOutlined /> },
  { key: '/papers', label: '试卷与组卷', icon: <FileTextOutlined /> },
  { key: '/exams', label: '考试管理', icon: <CalendarOutlined /> },
  { key: '/proctor', label: '监考中心', icon: <SafetyCertificateOutlined /> },
  { key: '/review', label: '阅卷中心', icon: <FormOutlined /> },
  {
    key: 'scores-group',
    label: '成绩与分析',
    icon: <BarChartOutlined />,
    children: [
      { key: '/scores', label: '成绩管理' },
      { key: '/analytics', label: '数据分析', icon: <LineChartOutlined /> },
    ],
  },
  {
    key: 'system-group',
    label: '系统管理',
    icon: <SettingOutlined />,
    children: [
      { key: '/system/users', label: '账号与角色', icon: <TeamOutlined /> },
      { key: '/system/orgs', label: '组织架构', icon: <ApartmentOutlined /> },
      { key: '/system/audit-logs', label: '审计日志', icon: <HistoryOutlined /> },
      { key: '/system/notifications', label: '通知配置', icon: <BellOutlined /> },
    ],
  },
]

export function findNavTrail(pathname: string): NavItem[] {
  for (const item of navigation) {
    if (item.key === pathname) return [item]
    const child = item.children?.find((node) => node.key === pathname)
    if (child) return [item, child]
  }
  return []
}

export function pageTitle(pathname: string): string {
  const trail = findNavTrail(pathname)
  return trail.length > 0 ? trail[trail.length - 1].label : '页面不存在'
}
