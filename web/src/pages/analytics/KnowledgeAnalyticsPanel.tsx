import { useQuery } from '@tanstack/react-query'
import { Card, Empty, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AimOutlined } from '@ant-design/icons'
import QueryError from '../../components/QueryError'
import { getKnowledgeAnalytics } from '../../api/score'
import { queryKeys } from '../../api/queryKeys'
import { formatScore } from '../../utils/format'
import type { KnowledgePointStat } from '../../types'

const levelColors: Record<string, string> = {
  优秀: 'green',
  良好: 'blue',
  待巩固: 'gold',
  待提升: 'red',
}

function TrendSpark({ point }: { point: KnowledgePointStat }) {
  if (point.trend.length <= 1) {
    return <span className="cell-meta">{point.trend[0]?.exam_title ?? '—'}</span>
  }
  const max = Math.max(...point.trend.map((item) => item.score_rate), 1)
  return (
    <div className="trend-spark">
      {point.trend.map((item) => (
        <Tooltip key={item.exam_id} title={`${item.exam_title}：得分率 ${formatScore(item.score_rate, 1)}%（${item.answers} 人次）`}>
          <div className="trend-col">
            <div className="trend-bar" style={{ height: `${Math.max(8, (item.score_rate / max) * 44)}px` }} />
            <span className="trend-label">{item.exam_title.slice(0, 4)}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  )
}

const columns: ColumnsType<KnowledgePointStat> = [
  {
    title: '知识点',
    dataIndex: 'name',
    render: (value: string) => <span className="cell-title">{value}</span>,
  },
  { title: '题目数', dataIndex: 'items', width: 88, sorter: (a, b) => a.items - b.items, render: (value: number) => `${value} 题` },
  { title: '作答人次', dataIndex: 'answers', width: 104, render: (value: number) => `${value} 次` },
  {
    title: '得分率',
    dataIndex: 'score_rate',
    width: 190,
    sorter: (a, b) => a.score_rate - b.score_rate,
    render: (value: number) => (
      <div className="rate-bar">
        <div className={`rate-fill ${value >= 85 ? 'green' : 'blue'}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        <span className="rate-text">{formatScore(value, 1)}%</span>
      </div>
    ),
  },
  {
    title: '全对率',
    dataIndex: 'correct_rate',
    width: 100,
    render: (value: number) => `${formatScore(value, 1)}%`,
  },
  {
    title: '掌握度',
    dataIndex: 'level',
    width: 96,
    render: (value: string) => <Tag color={levelColors[value] ?? 'default'}>{value}</Tag>,
  },
  {
    title: '历次趋势',
    key: 'trend',
    width: 260,
    render: (_value, record) => <TrendSpark point={record} />,
  },
]

export default function KnowledgeAnalyticsPanel({ examId }: { examId?: string }) {
  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledgeAnalytics(examId),
    queryFn: () => getKnowledgeAnalytics(examId),
  })

  if (knowledgeQuery.isPending) {
    return (
      <Card className="panel-card" variant="borderless" loading>
        <span className="cell-meta">正在汇总知识点掌握度…</span>
      </Card>
    )
  }
  if (knowledgeQuery.isError) {
    return (
      <Card className="panel-card" variant="borderless">
        <QueryError error={knowledgeQuery.error} onRetry={() => knowledgeQuery.refetch()} />
      </Card>
    )
  }

  const data = knowledgeQuery.data
  const points = data?.points ?? []

  return (
    <Card
      className="panel-card"
      variant="borderless"
      title={
        <span>
          <AimOutlined /> 知识点掌握度 · {data?.scope === 'exam' ? '当前考试' : `全部考试（${data?.exams ?? 0} 场）`}
        </span>
      }
    >
      {points.length === 0 ? (
        <Empty description="暂无可统计的判分数据。给题目标注“知识点”后，这里会按知识点汇总得分率与历次趋势。" />
      ) : (
        <Table
          rowKey="name"
          size="small"
          columns={columns}
          dataSource={points}
          scroll={{ x: 940 }}
          pagination={points.length > 10 ? { pageSize: 10, showTotal: (total) => `共 ${total} 个知识点` } : false}
        />
      )}
    </Card>
  )
}
