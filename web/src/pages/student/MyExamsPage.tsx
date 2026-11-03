import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Card, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CalendarOutlined, SafetyOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import DeviceCheckModal from '../../components/DeviceCheckModal'
import { listMyExams, startAttempt } from '../../api/student'
import { queryKeys } from '../../api/queryKeys'
import { candidateStatusLabels, examStatusLabels, statusOf } from '../../utils/labels'
import { formatDateTime, formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { MyExam } from '../../types'

export default function MyExamsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [deviceOpen, setDeviceOpen] = useState(false)

  const examsQuery = useQuery({ queryKey: queryKeys.myExams, queryFn: listMyExams })

  const startMutation = useMutation({
    mutationFn: startAttempt,
    onSuccess: (state) => {
      examsQuery.refetch()
      navigate(`/attempts/${state.attempt_id}`)
    },
    onError: (error) => message.error(errorText(error)),
  })

  const columns: ColumnsType<MyExam> = [
    {
      title: '考试',
      key: 'title',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.title}</span>
          <span className="cell-meta">
            {formatDateTime(record.start_at)} ~ {formatDateTime(record.end_at)} · 限时 {record.duration_minutes} 分钟
          </span>
        </div>
      ),
    },
    {
      title: '考试状态',
      dataIndex: 'exam_status',
      width: 110,
      render: (value: string) => {
        const status = statusOf(examStatusLabels, value)
        return <Tag color={status.color}>{status.label}</Tag>
      },
    },
    {
      title: '我的状态',
      dataIndex: 'candidate_status',
      width: 110,
      render: (value: string) => {
        const status = statusOf(candidateStatusLabels, value)
        return <Tag color={status.color}>{status.label}</Tag>
      },
    },
    {
      title: '成绩',
      dataIndex: 'score',
      width: 100,
      render: (value: number | null, record) =>
        value === null ? (
          <span className="cell-meta">{record.score_status === 'published' ? '—' : '未公布'}</span>
        ) : (
          <span className="score-value">{formatScore(value, 1)}</span>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_value, record) => {
        if (record.attempt_id && record.candidate_status === 'testing') {
          return (
            <Button type="primary" size="small" onClick={() => navigate(`/attempts/${record.attempt_id}`)}>
              继续作答
            </Button>
          )
        }
        if (record.attempt_id) {
          return (
            <Button size="small" onClick={() => navigate(`/attempts/${record.attempt_id}`)}>
              查看答卷
            </Button>
          )
        }
        const canEnter = ['pending_start', 'in_progress'].includes(record.exam_status) && ['assigned', 'waiting'].includes(record.candidate_status)
        return canEnter ? (
          <Button type="primary" size="small" loading={startMutation.isPending && startMutation.variables === record.id} onClick={() => startMutation.mutate(record.id)}>
            进入考试
          </Button>
        ) : (
          <span className="cell-meta">
            {record.exam_status === 'pending_start' ? '未到开考时间' : record.candidate_status === 'absent' ? '已缺考' : '考试已结束'}
          </span>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="我的考试"
        subtitle="开考时间到后即可进入；交卷前答案会自动保存。"
        extra={
          <Button icon={<SafetyOutlined />} onClick={() => setDeviceOpen(true)}>
            设备检测
          </Button>
        }
      />

      <DeviceCheckModal open={deviceOpen} onClose={() => setDeviceOpen(false)} />

      <Card className="panel-card" variant="borderless">
        <QueryError error={examsQuery.error} onRetry={() => examsQuery.refetch()} />
        <Table
          rowKey="id"
          size="middle"
          loading={examsQuery.isFetching}
          columns={columns}
          dataSource={examsQuery.data ?? []}
          scroll={{ x: 860 }}
          pagination={false}
          locale={{
            emptyText: examsQuery.isError ? (
              ' '
            ) : (
              <EmptyState icon={<CalendarOutlined />} title="还没有安排考试" description="考务发布考试后，会在这里看到开考入口与成绩。" />
            ),
          }}
        />
      </Card>
    </div>
  )
}
