import { Card, Col, Row, Skeleton, Tag } from 'antd'
import { ClockCircleOutlined, RightOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { examStatusLabels, statusOf } from '../../utils/labels'
import { formatTimeRange } from '../../utils/format'
import type { ProctorRoom } from '../../types'

interface RoomPickerProps {
  rooms: ProctorRoom[]
  loading?: boolean
  error?: unknown
  onRetry: () => void
  onPick: (examId: string) => void
}

/** 监考关注度排序：进行中 > 待开考 > 其他；同组内分配给我的优先，开考时间近的优先。 */
function roomOrder(room: ProctorRoom): number {
  const statusWeight = room.status === 'in_progress' ? 0 : room.status === 'pending_start' ? 1 : 2
  return statusWeight * 2 + (room.assigned ? 0 : 1)
}

/**
 * 考场选择视图：监考中心未选择考试时渲染。
 * 用卡片网格代替「下拉框 + 空态」——进行中的考试排最前并带呼吸点，点击卡片即进入监考。
 */
export default function RoomPicker({ rooms, loading = false, error, onRetry, onPick }: RoomPickerProps) {
  if (error) {
    return (
      <Card className="panel-card" variant="borderless">
        <QueryError error={error} onRetry={onRetry} />
      </Card>
    )
  }

  if (loading) {
    return (
      <Row gutter={[12, 12]}>
        {[0, 1, 2].map((index) => (
          <Col key={index} xs={24} sm={12} xl={8}>
            <Card className="panel-card room-card" variant="borderless">
              <Skeleton active title paragraph={{ rows: 2 }} />
            </Card>
          </Col>
        ))}
      </Row>
    )
  }

  if (rooms.length === 0) {
    return (
      <Card className="panel-card" variant="borderless">
        <EmptyState
          icon={<SafetyCertificateOutlined />}
          title="当前没有可监考的考试"
          description="考试编排并分配监考员后，考场会自动出现在这里。"
        />
      </Card>
    )
  }

  const sorted = [...rooms].sort(
    (a, b) => roomOrder(a) - roomOrder(b) || dayjs(a.start_at).valueOf() - dayjs(b.start_at).valueOf(),
  )
  const inProgress = rooms.filter((room) => room.status === 'in_progress').length
  const upcoming = rooms.filter((room) => room.status === 'pending_start').length
  const mine = rooms.filter((room) => room.assigned).length
  const candidates = rooms.reduce((total, room) => total + room.candidates, 0)

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>选择要监考的考试</h2>
          <p className="room-stats">
            共 <b>{rooms.length}</b> 场 · 进行中 <b>{inProgress}</b> · 待开考 <b>{upcoming}</b> · 分配给你{' '}
            <b>{mine}</b> · 覆盖考生 <b>{candidates}</b> 人
          </p>
        </div>
      </div>
      <Row gutter={[12, 12]}>
        {sorted.map((room) => {
          const status = statusOf(examStatusLabels, room.status)
          const live = room.status === 'in_progress'
          return (
            <Col key={room.exam_id} xs={24} sm={12} xl={8}>
              <Card
                className={`panel-card room-card is-interactive${live ? ' is-live' : ''}`}
                variant="borderless"
                onClick={() => onPick(room.exam_id)}
              >
                <div className="room-card-head">
                  <span className="room-card-title" title={room.title}>
                    {room.title}
                  </span>
                  {live ? (
                    <span className="room-live-badge">
                      <span className="room-live-dot" />
                      进行中
                    </span>
                  ) : (
                    <Tag color={status.color}>{status.label}</Tag>
                  )}
                </div>
                <div className="room-card-schedule">
                  <ClockCircleOutlined />
                  <span>{formatTimeRange(room.start_at, room.end_at)}</span>
                  <span className="room-card-sep">·</span>
                  <span>限时 {room.duration_minutes} 分钟</span>
                </div>
                <div className="room-card-foot">
                  <span className="room-card-meta">
                    <TeamOutlined />
                    {room.candidates} 名考生
                  </span>
                  {room.assigned ? <span className="room-chip room-chip-mine">我的考场</span> : <span className="room-chip">未分配</span>}
                  <RightOutlined className="room-card-enter" />
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}
