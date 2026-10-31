import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Descriptions, Drawer, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { TrophyOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { listMyScores, getMyScoreRecord } from '../../api/student'
import { queryKeys } from '../../api/queryKeys'
import { formatDateTime, formatScore } from '../../utils/format'
import { questionTypeLabel, scoreStatusLabels, statusOf } from '../../utils/labels'
import type { MyScore } from '../../types'

export default function MyScoresPage() {
  const [attemptId, setAttemptId] = useState<string | null>(null)

  const scoresQuery = useQuery({ queryKey: queryKeys.myScores, queryFn: listMyScores })
  const recordQuery = useQuery({
    queryKey: queryKeys.scoreRecord(attemptId ?? ''),
    queryFn: () => getMyScoreRecord(attemptId ?? ''),
    enabled: Boolean(attemptId),
  })

  const columns: ColumnsType<MyScore> = [
    { title: '考试', dataIndex: 'exam_title' },
    {
      title: '成绩',
      dataIndex: 'total',
      width: 110,
      render: (value: number) => <span className="score-value">{formatScore(value, 1)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => {
        const status = statusOf(scoreStatusLabels, value)
        return <Tag color={status.color}>{status.label}</Tag>
      },
    },
    { title: '公布时间', dataIndex: 'published_at', width: 170, render: (value: string | null) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_value, record) => (
        <Button type="link" size="small" onClick={() => setAttemptId(record.attempt_id)}>
          逐题明细
        </Button>
      ),
    },
  ]

  const record = recordQuery.data

  return (
    <div>
      <PageHeader title="我的成绩" subtitle="只展示已发布的成绩；未发布的成绩对考生不可见。" />

      <Card className="panel-card" variant="borderless">
        <QueryError error={scoresQuery.error} onRetry={() => scoresQuery.refetch()} />
        <Table
          rowKey="attempt_id"
          size="middle"
          loading={scoresQuery.isPending}
          columns={columns}
          dataSource={scoresQuery.data ?? []}
          pagination={false}
          locale={{
            emptyText: scoresQuery.isError ? (
              ' '
            ) : (
              <EmptyState icon={<TrophyOutlined />} title="还没有已发布的成绩" description="成绩由考务统一发布，发布后会同时给你发送站内通知。" />
            ),
          }}
        />
      </Card>

      <Drawer
        open={Boolean(attemptId)}
        width={680}
        destroyOnHidden
        title={record ? `成绩明细 · ${record.exam_title}` : '成绩明细'}
        onClose={() => setAttemptId(null)}
      >
        <QueryError error={recordQuery.error} onRetry={() => recordQuery.refetch()} />
        {record && (
          <>
            <Descriptions
              size="small"
              column={2}
              className="exam-meta"
              items={[
                { key: 'total', label: '总分', children: `${formatScore(record.total, 2)} 分` },
                { key: 'submitted', label: '交卷时间', children: formatDateTime(record.submitted_at) },
              ]}
            />
            <Table
              rowKey="question_id"
              size="small"
              pagination={false}
              dataSource={record.detail.questions}
              columns={[
                { title: '题型', dataIndex: 'type', width: 100, render: (value: string) => questionTypeLabel(value) },
                { title: '得分', dataIndex: 'score', width: 90, render: (value: number) => formatScore(value, 2) },
                { title: '满分', dataIndex: 'max_score', width: 90, render: (value: number) => formatScore(value, 1) },
                {
                  title: '判分方式',
                  key: 'auto',
                  width: 120,
                  render: (_value, item) =>
                    item.needs_review ? <Tag color="gold">待人工</Tag> : item.auto ? <Tag color="green">自动</Tag> : <Tag color="blue">人工</Tag>,
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  )
}
