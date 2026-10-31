import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Card, Descriptions, Drawer, Input, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { getScoreRecord, listScores, publishScores, type ScoreListParams } from '../../api/score'
import { listExams } from '../../api/exam'
import { queryKeys } from '../../api/queryKeys'
import { formatDateTime, formatScore } from '../../utils/format'
import { attemptStatusLabels, questionTypeLabel, scoreStatusLabels, statusOf } from '../../utils/labels'
import { errorText } from '../../utils/errors'
import type { ScoreListItem } from '../../types'

const scoreColumns = (onOpen: (row: ScoreListItem) => void): ColumnsType<ScoreListItem> => [
  {
    title: '考生',
    key: 'candidate',
    render: (_value, record) => (
      <div className="cell-stack">
        <span className="cell-title">{record.user_name}</span>
        <span className="cell-meta">{record.username}</span>
      </div>
    ),
  },
  { title: '考试', dataIndex: 'exam_title', width: 240, ellipsis: true },
  {
    title: '总分',
    dataIndex: 'total',
    width: 92,
    render: (value: number) => <span className="score-value">{formatScore(value, 2)}</span>,
  },
  {
    title: '答卷状态',
    dataIndex: 'attempt_status',
    width: 110,
    render: (value: string) => {
      const status = statusOf(attemptStatusLabels, value)
      return <Tag color={status.color}>{status.label}</Tag>
    },
  },
  {
    title: '成绩状态',
    dataIndex: 'score_status',
    width: 110,
    render: (value: string) => {
      const status = statusOf(scoreStatusLabels, value)
      return <Tag color={status.color}>{status.label}</Tag>
    },
  },
  { title: '提交时间', dataIndex: 'submitted_at', width: 170, render: (value: string | null) => formatDateTime(value) },
  {
    title: '操作',
    key: 'actions',
    width: 92,
    fixed: 'right',
    render: (_value, record) => (
      <Button type="link" size="small" onClick={() => onOpen(record)}>
        明细
      </Button>
    ),
  },
]

export default function ScoresPage() {
  const { message, modal } = App.useApp()
  const [draft, setDraft] = useState<Omit<ScoreListParams, 'page' | 'page_size'>>({})
  const [query, setQuery] = useState<ScoreListParams>({ page: 1, page_size: 20 })
  const [detailAttempt, setDetailAttempt] = useState<string | null>(null)

  const examsQuery = useQuery({
    queryKey: queryKeys.exams({ page: 1, page_size: 100 }),
    queryFn: () => listExams({ page: 1, page_size: 100 }),
  })
  const scoresQuery = useQuery({ queryKey: queryKeys.scores(query), queryFn: () => listScores(query) })
  const recordQuery = useQuery({
    queryKey: queryKeys.scoreRecord(detailAttempt ?? ''),
    queryFn: () => getScoreRecord(detailAttempt ?? ''),
    enabled: Boolean(detailAttempt),
  })

  const publishMutation = useMutation({
    mutationFn: publishScores,
    onSuccess: (data) => {
      scoresQuery.refetch()
      message.success(data.published > 0 ? `已发布 ${data.published} 份成绩，考生可在"我的成绩"查看` : '没有新的可发布成绩（已发布过的不会重复发布）')
    },
    onError: (error) => message.error(errorText(error)),
  })

  function apply() {
    setQuery({ ...draft, page: 1, page_size: scoresQuery.data?.pagination.page_size ?? 20 })
  }

  function confirmPublish() {
    if (!draft.exam_id) {
      message.warning('请先选择要发布成绩的考试')
      return
    }
    const exam = (examsQuery.data?.items ?? []).find((item) => item.id === draft.exam_id)
    modal.confirm({
      title: `发布《${exam?.title ?? '本场考试'}》成绩？`,
      content: '发布后考生立即可见本人成绩与逐题得分，已发布的成绩不会被重复推送。仍有待阅卷答卷时，本次只发布已判分部分。',
      okText: '确认发布',
      cancelText: '再想想',
      onOk: () => publishMutation.mutate(draft.exam_id as string),
    })
  }

  const examOptions = (examsQuery.data?.items ?? []).map((exam) => ({ value: exam.id, label: exam.title }))
  const record = recordQuery.data

  return (
    <div>
      <PageHeader
        title="成绩管理"
        subtitle="答卷判分完成后按考试发布；考生只能看到已发布的成绩。"
        extra={
          <Tooltip title="按考试发布，请先在筛选中选择考试">
            <Button type="primary" icon={<SendOutlined />} onClick={confirmPublish} loading={publishMutation.isPending}>
              发布成绩
            </Button>
          </Tooltip>
        }
      />

      <Card className="panel-card" variant="borderless">
        <div className="filter-bar">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="考试"
            style={{ width: 260 }}
            value={draft.exam_id}
            options={examOptions}
            onChange={(value) => setDraft({ ...draft, exam_id: value })}
          />
          <Select
            allowClear
            placeholder="成绩状态"
            style={{ width: 140 }}
            value={draft.status}
            options={[
              { value: 'pending', label: '未发布' },
              { value: 'published', label: '已发布' },
            ]}
            onChange={(value) => setDraft({ ...draft, status: value })}
          />
          <Input
            allowClear
            placeholder="考生姓名 / 用户名"
            style={{ width: 200 }}
            value={draft.keyword}
            onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
            onPressEnter={apply}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={apply}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setDraft({})
              setQuery({ page: 1, page_size: 20 })
            }}
          >
            重置
          </Button>
        </div>

        <QueryError error={scoresQuery.error} onRetry={() => scoresQuery.refetch()} />

        <Table
          rowKey="attempt_id"
          size="middle"
          loading={scoresQuery.isPending}
          columns={scoreColumns((row) => setDetailAttempt(row.attempt_id))}
          dataSource={scoresQuery.data?.items ?? []}
          scroll={{ x: 980 }}
          pagination={{
            current: scoresQuery.data?.pagination.page ?? 1,
            pageSize: scoresQuery.data?.pagination.page_size ?? 20,
            total: scoresQuery.data?.pagination.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 份答卷`,
            onChange: (page, pageSize) => setQuery({ ...draft, page, page_size: pageSize }),
          }}
          locale={{ emptyText: scoresQuery.isError ? ' ' : '还没有可管理的成绩（考生交卷后生成）' }}
        />
      </Card>

      <Drawer
        open={Boolean(detailAttempt)}
        width={720}
        destroyOnHidden
        title={record ? `成绩明细 · ${record.user_name}` : '成绩明细'}
        onClose={() => setDetailAttempt(null)}
      >
        <QueryError error={recordQuery.error} onRetry={() => recordQuery.refetch()} />
        {record && (
          <>
            <Descriptions
              size="small"
              column={2}
              className="exam-meta"
              items={[
                { key: 'exam', label: '考试', children: record.exam_title },
                { key: 'total', label: '总分', children: `${formatScore(record.total, 2)} 分` },
                {
                  key: 'score-status',
                  label: '成绩状态',
                  children: statusOf(scoreStatusLabels, record.score_status).label,
                },
                { key: 'submitted', label: '提交时间', children: formatDateTime(record.submitted_at) },
              ]}
            />
            <Table
              rowKey="question_id"
              size="small"
              pagination={false}
              dataSource={record.detail.questions}
              columns={[
                {
                  title: '题目',
                  key: 'question',
                  render: (_value, item) => (
                    <div className="cell-stack">
                      <span className="cell-title">{questionTypeLabel(item.type)}</span>
                      <span className="cell-meta">{item.question_id.slice(0, 8)}</span>
                    </div>
                  ),
                },
                { title: '得分', dataIndex: 'score', width: 90, render: (value: number) => formatScore(value, 2) },
                { title: '满分', dataIndex: 'max_score', width: 90, render: (value: number) => formatScore(value, 1) },
                {
                  title: '判分方式',
                  key: 'auto',
                  width: 120,
                  render: (_value, item) =>
                    item.needs_review ? (
                      <Tag color="gold">待人工</Tag>
                    ) : item.auto ? (
                      <Tag color="green">自动</Tag>
                    ) : (
                      <Tag color="blue">人工</Tag>
                    ),
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  )
}
