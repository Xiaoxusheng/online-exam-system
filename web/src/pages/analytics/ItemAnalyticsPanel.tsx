import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { getExamItemAnalytics } from '../../api/score'
import { queryKeys } from '../../api/queryKeys'
import { difficultyLabel, questionTypeLabel } from '../../utils/labels'
import { formatScore } from '../../utils/format'
import { ProfileOutlined } from '@ant-design/icons'
import type { ItemAnalysis } from '../../types'

const discriminationHint = '区分度 = 高分组平均得分率 − 低分组平均得分率（各取总分前/后 27% 的考生）。≥0.3 为好题，<0.1 建议复核。'

function discriminationTag(value: number) {
  if (value >= 30) return <Tag color="green">优秀 {formatScore(value, 1)}</Tag>
  if (value >= 20) return <Tag color="blue">良好 {formatScore(value, 1)}</Tag>
  if (value >= 10) return <Tag color="gold">一般 {formatScore(value, 1)}</Tag>
  return <Tag color="red">偏低 {formatScore(value, 1)}</Tag>
}

/** Judge answers are stored as true/false; the table shows them as 对/错. */
function optionLabel(type: string, key: string) {
  if (type !== 'judge') return key
  if (key === 'true') return '对'
  if (key === 'false') return '错'
  return key
}

function RateBar({ value, tone }: { value: number; tone: 'blue' | 'green' }) {
  const width = Math.max(2, Math.min(100, value))
  return (
    <div className="rate-bar">
      <div className={`rate-fill ${tone}`} style={{ width: `${width}%` }} />
      <span className="rate-text">{formatScore(value, 1)}%</span>
    </div>
  )
}

const columns: ColumnsType<ItemAnalysis> = [
  {
    title: '题目',
    key: 'stem',
    render: (_value, record) => (
      <div className="cell-stack">
        <Tooltip title={record.stem || `题目 ${record.question_id.slice(0, 8)}`}>
          <span className="cell-title cell-ellipsis">{record.stem || `题目 ${record.question_id.slice(0, 8)}`}</span>
        </Tooltip>
        <span className="cell-meta">
          {questionTypeLabel(record.type)} · {difficultyLabel(record.difficulty)} · 满分 {formatScore(record.max_score, 1)}
        </span>
      </div>
    ),
  },
  {
    title: '知识点',
    dataIndex: 'knowledge_point',
    width: 130,
    render: (value: string) => value || <span className="cell-meta">未标注</span>,
  },
  {
    title: '正确率',
    dataIndex: 'correct_rate',
    width: 150,
    sorter: (a, b) => a.correct_rate - b.correct_rate,
    render: (value: number, record) =>
      record.subjective ? <span className="cell-meta">人工阅卷</span> : <RateBar value={value} tone="green" />,
  },
  {
    title: '得分率',
    dataIndex: 'score_rate',
    width: 150,
    sorter: (a, b) => a.score_rate - b.score_rate,
    render: (value: number) => <RateBar value={value} tone="blue" />,
  },
  {
    title: '未作答',
    dataIndex: 'skipped',
    width: 92,
    sorter: (a, b) => a.skipped - b.skipped,
    render: (value: number) => `${value} 人`,
  },
  {
    title: (
      <Tooltip title={discriminationHint}>
        <span>区分度</span>
      </Tooltip>
    ),
    dataIndex: 'discrimination',
    width: 130,
    sorter: (a, b) => a.discrimination - b.discrimination,
    render: (value: number, record) => (record.subjective ? <span className="cell-meta">—</span> : discriminationTag(value)),
  },
  {
    title: '选项分布',
    key: 'options',
    width: 220,
    render: (_value, record) => {
      if (!record.options.length) return <span className="cell-meta">非选择题</span>
      const total = record.options.reduce((sum, option) => sum + option.count, 0) || 1
      return (
        <div className="option-bars">
          {record.options.map((option) => (
            <Tooltip
              key={option.key}
              title={`${option.count} 人选择${option.correct ? '（正确项）' : ''}`}
            >
              <div className={`option-bar${option.correct ? ' is-correct' : ''}`}>
                <span className="option-key">{optionLabel(record.type, option.key)}</span>
                <span className="option-track">
                  <span className="option-fill" style={{ width: `${Math.round((option.count / total) * 100)}%` }} />
                </span>
                <span className="option-count">{option.count}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      )
    },
  },
]

export default function ItemAnalyticsPanel({ examId }: { examId: string }) {
  const itemsQuery = useQuery({
    queryKey: queryKeys.itemAnalytics(examId),
    queryFn: () => getExamItemAnalytics(examId),
    enabled: Boolean(examId),
  })

  if (itemsQuery.isPending) {
    return (
      <Card className="panel-card" variant="borderless" loading>
        <span className="cell-meta">正在统计题目作答数据…</span>
      </Card>
    )
  }
  if (itemsQuery.isError) {
    return (
      <Card className="panel-card" variant="borderless">
        <QueryError error={itemsQuery.error} onRetry={() => itemsQuery.refetch()} />
      </Card>
    )
  }

  const data = itemsQuery.data
  if (!data || data.items.length === 0) {
    return (
      <Card className="panel-card" variant="borderless">
        <EmptyState
          icon={<ProfileOutlined />}
          title="暂无题目统计"
          description="考生交卷并完成判分后，这里会显示每题正确率、得分率、区分度与选项分布。"
        />
      </Card>
    )
  }

  const weakest = [...data.items]
    .filter((item) => !item.subjective)
    .sort((a, b) => a.correct_rate - b.correct_rate)
    .slice(0, 3)

  return (
    <>
      {data.sample_note && (
        <Alert className="page-alert" type="info" showIcon message={data.sample_note} />
      )}
      {weakest.length > 0 && (
        <Alert
          className="page-alert"
          type="warning"
          showIcon
          message="正确率最低的题目"
          description={
            <div className="weak-items">
              {weakest.map((item, index) => (
                <span key={item.question_id} className="weak-item">
                  {index + 1}. {item.stem || `题目 ${item.question_id.slice(0, 8)}`}（{formatScore(item.correct_rate, 1)}%）
                </span>
              ))}
            </div>
          }
        />
      )}
      <Card className="panel-card" variant="borderless" title={`题目分析 · ${data.participants} 份已判分答卷`}>
        <Table
          rowKey="question_id"
          size="small"
          columns={columns}
          dataSource={data.items}
          scroll={{ x: 1080 }}
          pagination={data.items.length > 20 ? { pageSize: 20, showTotal: (total) => `共 ${total} 道题` } : false}
        />
      </Card>
    </>
  )
}
