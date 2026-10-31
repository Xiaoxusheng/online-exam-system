import type { CSSProperties } from 'react'
import { Button, Card, Col, List, Row, Skeleton, Tag } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardSummary } from '../api/dashboard'
import EmptyState from '../components/EmptyState'
import { useAuthStore } from '../stores/auth'
import { activityLabel, examStatusLabels, roleLabel } from '../utils/labels'

type AccentVars = CSSProperties & {
  '--accent': string
  '--accent-soft': string
}

const quickActions = [
  {
    title: '题库管理',
    description: '维护题目、知识点与版本',
    path: '/questions',
    icon: <BookOutlined />,
    color: '#3370FF',
    background: '#EAF1FF',
  },
  {
    title: '试卷与组卷',
    description: '固定卷 / 随机卷 / AB 卷',
    path: '/papers',
    icon: <FileTextOutlined />,
    color: '#7A5AF8',
    background: '#F2EEFF',
  },
  {
    title: '考试管理',
    description: '编排考试计划与考生',
    path: '/exams',
    icon: <CalendarOutlined />,
    color: '#12B76A',
    background: '#E8F8F0',
  },
  {
    title: '监考中心',
    description: '实时状态与告警处置',
    path: '/proctor',
    icon: <SafetyCertificateOutlined />,
    color: '#F79009',
    background: '#FFF6E5',
  },
]

const capabilities = [
  { value: '5,000', label: '单场并发作答目标', icon: <ThunderboltOutlined /> },
  { value: '5 秒', label: '告警到达监考台', icon: <ClockCircleOutlined /> },
  { value: '6 类角色', label: '全流程权限控制', icon: <TeamOutlined /> },
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

  const stats = [
    {
      label: '在读学员',
      value: data?.stats.students ?? 0,
      icon: <TeamOutlined />,
      color: '#3370FF',
      background: '#EAF1FF',
      foot: '机构全部启用学员',
    },
    {
      label: '进行中考试',
      value: data?.stats.exams_in_progress ?? 0,
      icon: <CalendarOutlined />,
      color: '#12B76A',
      background: '#E8F8F0',
      foot: '实时统计',
    },
    {
      label: '待阅卷任务',
      value: data?.stats.pending_grading ?? 0,
      icon: <FileDoneOutlined />,
      color: '#7A5AF8',
      background: '#F2EEFF',
      foot: '主观题与音视频题',
    },
    {
      label: '待审核试卷',
      value: data?.stats.pending_review ?? 0,
      icon: <SafetyCertificateOutlined />,
      color: '#F79009',
      background: '#FFF6E5',
      foot: '待考务审核',
    },
  ]

  const today = dayjs().format('YYYY年M月D日 dddd')
  const heroSub = isLoading
    ? '正在加载今日考试概览…'
    : data
      ? `当前身份：${roleLabel(user?.role)} · ${data.stats.exams_in_progress} 场考试进行中，${data.stats.pending_grading} 份答卷待阅`
      : `当前身份：${roleLabel(user?.role)} · 数据暂不可用`

  return (
    <div>
      <section className="dashboard-hero">
        <div className="hero-content">
          <div className="hero-eyebrow">工作台 · {today}</div>
          <h1 className="hero-title">
            {greeting()}，{user?.name ?? '管理员'}
          </h1>
          <p className="hero-sub">{heroSub}</p>
          <div className="hero-actions">
            <Button
              className="hero-btn-primary"
              icon={<CalendarOutlined />}
              onClick={() => navigate('/exams')}
            >
              进入考试管理
            </Button>
            <Button className="hero-btn-ghost" onClick={() => navigate('/proctor')}>
              查看监考中心
            </Button>
          </div>
        </div>

        <div className="hero-side">
          {capabilities.map((item) => (
            <div className="hero-capability" key={item.label}>
              <span className="hero-capability-icon">{item.icon}</span>
              <div>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="section-head">
        <div>
          <h2>今日概览</h2>
          <p>关键运营指标</p>
        </div>
        <span className="live-pill">
          <span className="status-dot" />
          实时
        </span>
      </div>

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
        <Row gutter={[16, 16]}>
          {stats.map((stat) => (
            <Col key={stat.label} xs={12} sm={12} xl={6}>
              <Card
                className="stat-card"
                variant="borderless"
                style={
                  { '--accent': stat.color, '--accent-soft': stat.background } as AccentVars
                }
              >
                <div className="stat-head">
                  <span className="stat-icon">{stat.icon}</span>
                </div>
                <div className="stat-label">{stat.label}</div>
                <div className="stat-value">
                  {isLoading ? (
                    <Skeleton.Input active size="small" style={{ width: 58 }} />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="stat-foot">{stat.foot}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <div className="section-head">
        <div>
          <h2>快捷入口</h2>
          <p>常用操作，一步直达</p>
        </div>
        <span className="section-head-meta">4 个模块</span>
      </div>

      <Row gutter={[16, 16]}>
        {quickActions.map((action) => (
          <Col key={action.path} xs={24} sm={12} xl={6}>
            <button type="button" className="quick-card" onClick={() => navigate(action.path)}>
              <span
                className="quick-icon"
                style={{ color: action.color, background: action.background }}
              >
                {action.icon}
              </span>
              <span>
                <span className="quick-title" style={{ display: 'block' }}>
                  {action.title}
                </span>
                <span className="quick-desc" style={{ display: 'block' }}>
                  {action.description}
                </span>
              </span>
              <ArrowRightOutlined className="quick-arrow" />
            </button>
          </Col>
        ))}
      </Row>

      {!isError && (
        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          <Col xs={24} xl={15}>
            <Card
              className="panel-card"
              variant="borderless"
              title="待开始考试"
              extra={
                <Button type="link" size="small" onClick={() => navigate('/exams')}>
                  全部考试
                </Button>
              }
            >
              {isLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
              ) : data && data.upcoming_exams.length > 0 ? (
                <List
                  className="dashboard-list"
                  dataSource={data.upcoming_exams}
                  renderItem={(exam) => {
                    const status = examStatusLabels[exam.status]
                    return (
                      <List.Item>
                        <div className="exam-item">
                          <div style={{ minWidth: 0 }}>
                            <div className="exam-item-title">{exam.title}</div>
                            <div className="exam-item-meta">
                              <ClockCircleOutlined />
                              {dayjs(exam.start_at).format('MM-DD HH:mm')} -{' '}
                              {dayjs(exam.end_at).format('MM-DD HH:mm')}
                            </div>
                          </div>
                          <Tag color={status?.color ?? 'default'}>
                            {status?.label ?? exam.status}
                          </Tag>
                        </div>
                      </List.Item>
                    )
                  }}
                />
              ) : (
                <EmptyState
                  icon={<CalendarOutlined />}
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
          </Col>

          <Col xs={24} xl={9}>
            <Card
              className="panel-card"
              variant="borderless"
              title="最近动态"
              extra={<span className="panel-sub">近 5 条</span>}
            >
              {isLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : data && data.recent_activity.length > 0 ? (
                <List
                  className="dashboard-list"
                  dataSource={data.recent_activity}
                  renderItem={(item) => (
                    <List.Item>
                      <div className="activity-line">
                        <span className="activity-dot" />
                        <div>
                          <div className="activity-main">
                            <strong>{item.actor_name}</strong> {activityLabel(item.action)}
                          </div>
                          <div className="activity-time">
                            {dayjs(item.created_at).format('MM-DD HH:mm:ss')}
                          </div>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <EmptyState
                  compact
                  icon={<HistoryOutlined />}
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
