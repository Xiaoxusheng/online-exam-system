import { Button, Card, Col, Empty, List, Result, Row, Skeleton, Tag } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { fetchDashboardSummary } from '../api/dashboard'
import { useAuthStore } from '../stores/auth'
import { activityLabel, examStatusLabels, roleLabel } from '../utils/labels'

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
    color: '#12B76A',
    background: '#E8F8F0',
  },
  {
    title: '考试管理',
    description: '编排考试计划与考生',
    path: '/exams',
    icon: <CalendarOutlined />,
    color: '#7A5AF8',
    background: '#F2EEFF',
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

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {greeting()}，{user?.name ?? '管理员'}
          </h1>
          <p className="page-subtitle">
            {dayjs().format('YYYY年M月D日 dddd')} · 当前身份：{roleLabel(user?.role)}
          </p>
        </div>
        <Button
          type="primary"
          icon={<CalendarOutlined />}
          onClick={() => navigate('/exams')}
        >
          进入考试管理
        </Button>
      </div>

      {isError ? (
        <Card className="surface-card" variant="borderless">
          <Result
            status="warning"
            title="工作台数据加载失败"
            subTitle="请检查后端服务与数据库连接后重试。"
            extra={
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
              <Card className="stat-card" variant="borderless">
                <div className="stat-head">
                  <div>
                    <div className="stat-label">{stat.label}</div>
                    <div className="stat-value">
                      {isLoading ? (
                        <Skeleton.Input active size="small" style={{ width: 64 }} />
                      ) : (
                        stat.value
                      )}
                    </div>
                  </div>
                  <span
                    className="stat-icon"
                    style={{ color: stat.color, background: stat.background }}
                  >
                    {stat.icon}
                  </span>
                </div>
                <div className="stat-foot">{stat.foot}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {quickActions.map((action) => (
          <Col key={action.path} xs={24} sm={12} xl={6}>
            <button
              type="button"
              className="quick-card"
              onClick={() => navigate(action.path)}
            >
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
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} xl={15}>
            <Card
              className="surface-card"
              variant="borderless"
              title={<span style={{ fontSize: 15, fontWeight: 600 }}>待开始考试</span>}
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
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 16,
                            width: '100%',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{exam.title}</div>
                            <div
                              style={{ marginTop: 2, fontSize: 12, color: '#8F959E' }}
                            >
                              <ClockCircleOutlined />{' '}
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
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无待开始考试"
                >
                  <Button size="small" onClick={() => navigate('/exams')}>
                    去创建考试
                  </Button>
                </Empty>
              )}
            </Card>
          </Col>

          <Col xs={24} xl={9}>
            <Card
              className="surface-card"
              variant="borderless"
              title={<span style={{ fontSize: 15, fontWeight: 600 }}>最近动态</span>}
              extra={<span style={{ fontSize: 12, color: '#8F959E' }}>近 5 条</span>}
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
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无操作动态"
                />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}
