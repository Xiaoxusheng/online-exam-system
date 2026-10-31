import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import ReviewDrawer from './ReviewDrawer'
import { listReviewTasks } from '../../api/review'
import { queryKeys } from '../../api/queryKeys'
import { FileTextOutlined } from '@ant-design/icons'
import { formatDateTime, formatScore } from '../../utils/format'
import { questionTypeLabel, reviewStatusLabels, statusOf } from '../../utils/labels'
import type { ReviewTask } from '../../types'

const roundNames: Record<number, string> = { 1: '一评', 2: '二评', 3: '仲裁' }

const columns = (onOpen: (task: ReviewTask) => void): ColumnsType<ReviewTask> => [
  {
    title: '考卷',
    key: 'exam',
    render: (_value, record) => (
      <div className="cell-stack">
        <span className="cell-title">{record.exam_title}</span>
        <span className="cell-meta">
          {record.user_name} · {questionTypeLabel(record.question_type)}
        </span>
      </div>
    ),
  },
  {
    title: '轮次',
    dataIndex: 'round',
    width: 92,
    render: (value: number) => <Tag className="soft-tag">{roundNames[value] ?? `第 ${value} 轮`}</Tag>,
  },
  {
    title: '分配',
    key: 'assignee',
    width: 130,
    render: (_value, record) =>
      record.reviewer_name ? record.reviewer_name : <Tag color="gold">待认领</Tag>,
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: (value: string) => {
      const status = statusOf(reviewStatusLabels, value)
      return <Tag color={status.color}>{status.label}</Tag>
    },
  },
  {
    title: '评分',
    dataIndex: 'score',
    width: 88,
    render: (value: number | null) => (value === null ? <span className="cell-meta">—</span> : formatScore(value, 1)),
  },
  { title: '更新时间', dataIndex: 'updated_at', width: 160, render: (value: string) => formatDateTime(value) },
  {
    title: '操作',
    key: 'actions',
    width: 96,
    fixed: 'right',
    render: (_value, record) => (
      <Button type="link" size="small" onClick={() => onOpen(record)}>
        {record.status === 'pending' ? '去阅卷' : '查看'}
      </Button>
    ),
  },
]

export default function ReviewPage() {
  const [tab, setTab] = useState<'pending' | 'submitted'>('pending')
  const [taskId, setTaskId] = useState<string | null>(null)

  const pendingQuery = useQuery({
    queryKey: queryKeys.reviewTasks({ status: 'pending' }),
    queryFn: () => listReviewTasks({ status: 'pending', page: 1, page_size: 50 }),
  })
  const doneQuery = useQuery({
    queryKey: queryKeys.reviewTasks({ status: 'submitted' }),
    queryFn: () => listReviewTasks({ status: 'submitted', page: 1, page_size: 50 }),
  })

  const activeQuery = tab === 'pending' ? pendingQuery : doneQuery
  const pendingTotal = pendingQuery.data?.pagination.total ?? 0
  const doneTotal = doneQuery.data?.pagination.total ?? 0

  return (
    <div>
      <PageHeader
        title="阅卷中心"
        subtitle="主观题与音视频题人工评分；双评与仲裁按考试配置自动流转。"
      />

      <Card className="panel-card" variant="borderless">
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as 'pending' | 'submitted')}
          items={[
            { key: 'pending', label: `待办（${pendingTotal}）` },
            { key: 'submitted', label: `已完成（${doneTotal}）` },
          ]}
        />

        <QueryError error={activeQuery.error} onRetry={() => activeQuery.refetch()} />

        <Table
          rowKey="id"
          size="middle"
          loading={activeQuery.isPending}
          columns={columns((task) => setTaskId(task.id))}
          dataSource={activeQuery.data?.items ?? []}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 条任务` }}
          locale={{
            emptyText:
              activeQuery.isError || activeQuery.isPending ? (
                ' '
              ) : (
                <EmptyState
                  compact
                  icon={<FileTextOutlined />}
                  title={tab === 'pending' ? '没有待阅卷任务' : '还没有已完成的评分'}
                  description={
                    tab === 'pending'
                      ? '考生交卷后，主观题会自动生成任务；分配给你的任务会出现在这里。'
                      : '提交过的评分会保留轮次记录，便于追溯。'
                  }
                />
              ),
          }}
        />
      </Card>

      <ReviewDrawer taskId={taskId} onClose={() => setTaskId(null)} />
    </div>
  )
}
