import type { ReactNode } from 'react'
import { Button, Card, Col, Descriptions, Flex, List, Row, Skeleton, Tag, Timeline } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardSummary } from '../api/dashboard'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import StatCard, { type StatTone } from '../components/StatCard'
import { useAuthStore } from '../stores/auth'
import { activityLabel, dataScopeLabel, examStatusLabels, roleLabel } from '../utils/labels'

const quickActions = [
  {
    title: '题库管理',
    description: '维护题目、知识点与版本',
    path: '/questions',
    icon: <BookOutlined />,
  },
  {
    title: '试卷与组卷',
    description: '固定卷 / 随机卷 / AB 卷',
    path: '/papers',
    icon: <FileTextOutlined />,
  },
  {
    title: '考试管理',
    description: '编排考试计划与考生',
    path: '/exams',
    icon: <CalendarOutlined />,
  },
  {
    title: '监考中心',
    description: '实时状态与告警处置',
    path: '/proctor',
    icon: <SafetyCertificateOutlined />,
  },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
  })

  const stats: {
    label: string
    value: number
    unit: string
    foot: string
    icon: ReactNode
    tone: StatTone
  }[] = [
    {
      label: '在读学员',
      value: data?.stats.students ?? 0,
      unit: '人',
      foot: '机构全部启用学员',
      icon: <TeamOutlined />,
      tone: 'primary',
    },
    {
      label: '进行中考试',
      value: data?.stats.exams_in_progress ?? 0,
      unit: '场',
      foot: '处于考试时间窗内',
      icon: <CalendarOutlined />,
      tone: 'success',
    },
    {
      label: '待阅卷任务',
      value: data?.stats.pending_grading ?? 0,
      unit: '份',
      foot: '主观题与音视频题',
      icon: <ClockCircleOutlined />,
      tone: 'warning',
    },
    {
      label: '待审核试卷',
      value: data?.stats.pending_review ?? 0,
      unit: '份',
      foot: '待考务审核',
      icon: <FileTextOutlined />,
      tone: 'violet',
    },
  ]

  const today = dayjs().format('YYYY年M月D日 dddd')
  const subtitle = `今天是${today} · ${
    isLoading
      ? '正在加载今日概览…'
      : data
        ? `当前身份：${roleLabel(user?.role)} · ${data.stats.exams_in_progress} 场考试进行中，${data.stats.pending_grading} 份答卷待阅`
        : `当前身份：${roleLabel(user?.role)} · 数据暂不可用`
  }`

  const infoItems = data
    ? [
        { key: 'role', label: '当前身份', children: user ? `${user.name}（${roleLabel(user.role)}）` : '—' },
        { key: 'org', label: '所属机构', children: user?.org_id ? user.org_id.slice(0, 8) : '—' },
        { key: 'scope', label: '数据范围', children: user?.data_scope ? dataScopeLabel(user.data_scope) : '—' },
        { key: 'today', label: '今日', children: dayjs().format('YYYY-MM-DD dddd') },
        { key: 'students', label: '在读学员', children: `${data.stats.students} 人` },
        {
          key: 'todo',
          label: '待办合计',
          children: `${data.stats.pending_grading + data.stats.pending_review} 项（阅卷 ${data.stats.pending_review} · 待判 ${data.stats.pending_grading}）`,
        },
        { key: 'running', label: '进行中考试', children: `${data.stats.exams_in_progress} 场` },
        { key: 'upcoming', label: '待开始考试', children: `${data.upcoming_exams.length} 场` },
      ]
    : []

  return (
    <div>
      <PageHeader
        title={`${greeting()}，${user?.name ?? '管理员'}`}
        subtitle={subtitle}
        extra={
          <Button type="primary" icon={<CalendarOutlined />} onClick={() => navigate('/exams')}>
            进入考试管理
          </Button>
        }
      />

      {isError ? (
        <Card className="panel-card" variant="borderless">
          <EmptyState
            icon={<WarningOutlined />}
            title="工作台数据加载失败"
            description="请检查后端服务与数据库连接后重试。"
            action={
              <Button type="primary" onClick={() => refetch()}>
                重新加载
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="stat-cards">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              icon={stat.icon}
              label={stat.label}
              value={stat.value}
              unit={stat.unit}
              foot={stat.foot}
              tone={stat.tone}
              loading={isLoading}
            />
          ))}
        </div>
      )}

      {!isError && data && (
        <Card className="panel-card dashboard-info" variant="borderless" title="基本信息">
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
            items={infoItems}
            styles={{ label: { width: 72 } }}
          />
        </Card>
      )}

      {!isError && (
        <Row gutter={[12, 12]} className="dashboard-row">
          <Col xs={24} xl={15}>
            <Card className="panel-card" variant="borderless" title="待开始考试">
              {isLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
              ) : data && data.upcoming_exams.length > 0 ? (
                <List
                  className="dashboard-list"
                  dataSource={data.upcoming_exams}
                  renderItem={(exam) => {
                    const status = examStatusLabels[exam.status]
                    return (
                      <List.Item
                        extra={
                          <Tag color={status?.color ?? 'default'}>{status?.label ?? exam.status}</Tag>
                        }
                      >
                        <div className="exam-item">
                          <div className="exam-item-title">{exam.title}</div>
                          <div className="exam-item-meta">
                            <ClockCircleOutlined />
                            {dayjs(exam.start_at).format('MM-DD HH:mm')} -{' '}
                            {dayjs(exam.end_at).format('MM-DD HH:mm')}
                          </div>
                        </div>
                      </List.Item>
                    )
                  }}
                />
              ) : (
                <EmptyState
                  title="暂无待开始考试"
                  description="创建考试计划后，即将开始的场次会显示在这里。"
                  action={
                    <Button size="small" onClick={() => navigate('/exams')}>
                      去创建考试
                    </Button>
                  }
                />
              )}
            </Card>

            <div className="section-head">
              <h2>快捷入口</h2>
            </div>

            <Row gutter={[12, 12]}>
              {quickActions.map((action) => (
                <Col key={action.path} xs={12} sm={12} xl={12}>
                  <Card
                    className="quick-card"
                    variant="borderless"
                    hoverable
                    onClick={() => navigate(action.path)}
                  >
                    <Flex align="center" gap={10}>
                      <span className="quick-icon">{action.icon}</span>
                      <div className="quick-body">
                        <div className="quick-title">{action.title}</div>
                        <div className="quick-desc">{action.description}</div>
                      </div>
                      <ArrowRightOutlined className="quick-arrow" />
                    </Flex>
                  </Card>
                </Col>
              ))}
            </Row>
          </Col>

          <Col xs={24} xl={9}>
            <Card className="panel-card" variant="borderless" title="最近动态">
              {isLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : data && data.recent_activity.length > 0 ? (
                <Timeline
                  className="dashboard-timeline"
                  items={data.recent_activity.map((item) => ({
                    color: 'blue',
                    children: (
                      <>
                        <div className="activity-main">
                          <strong>{item.actor_name}</strong> {activityLabel(item.action)}
                        </div>
                        <div className="activity-time">
                          {dayjs(item.created_at).format('MM-DD HH:mm:ss')}
                        </div>
                      </>
                    ),
                  }))}
                />
              ) : (
                <EmptyState
                  compact
                  title="暂无操作动态"
                  description="登录、组卷与发布等操作会记录在这里。"
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}
