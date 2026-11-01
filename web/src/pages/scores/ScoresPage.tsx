import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Descriptions, Drawer, Flex, Input, InputNumber, Select, Space, Table, Tabs, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { HistoryOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import AppealsPanel from './AppealsPanel'
import {
  adjustScore,
  exportScores,
  getScoreRecord,
  listAppeals,
  listScoreAdjustments,
  listScores,
  publishScores,
  type ScoreListParams,
} from '../../api/score'
import { listExams } from '../../api/exam'
import { queryKeys } from '../../api/queryKeys'
import { useAuthStore } from '../../stores/auth'
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
  const queryClient = useQueryClient()
  const role = useAuthStore((state) => state.user?.role)
  const canAdjust = role === 'exam_admin' || role === 'org_admin'
  const [draft, setDraft] = useState<Omit<ScoreListParams, 'page' | 'page_size'>>({})
  const [query, setQuery] = useState<ScoreListParams>({ page: 1, page_size: 20 })
  const [detailAttempt, setDetailAttempt] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')

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

  const exportMutation = useMutation({
    mutationFn: (examId: string) => exportScores(examId),
    onSuccess: () => message.success('已开始下载成绩表'),
    onError: (error) => message.error(errorText(error)),
  })

  function confirmExport() {
    if (!draft.exam_id) {
      message.warning('导出前请先选择考试')
      return
    }
    const exam = (examsQuery.data?.items ?? []).find((item) => item.id === draft.exam_id)
    modal.confirm({
      title: `导出《${exam?.title ?? '本场考试'}》成绩？`,
      content: '导出 Excel 包含考生姓名、账号、校区班级、准考证号与逐行水印，用于教学管理。导出动作会写入审计日志。',
      okText: '确认导出',
      cancelText: '取消',
      onOk: () => exportMutation.mutate(draft.exam_id as string),
    })
  }

  const historyQuery = useQuery({
    queryKey: queryKeys.scoreAdjustments(detailAttempt ?? ''),
    queryFn: () => listScoreAdjustments(detailAttempt ?? ''),
    enabled: Boolean(detailAttempt) && canAdjust,
  })

  const appealsSummary = useQuery({
    queryKey: queryKeys.appeals({ status: 'pending', page: 1, page_size: 1 }),
    queryFn: () => listAppeals({ status: 'pending', page: 1, page_size: 1 }),
    enabled: role === 'exam_admin' || role === 'org_admin',
  })

  const adjustMutation = useMutation({
    mutationFn: (payload: { attemptId: string; reason: string; items: { question_id: string; score: number }[] }) =>
      adjustScore(payload.attemptId, payload.reason, payload.items),
    onSuccess: (data) => {
      message.success(`已更正为 ${formatScore(data.after_total, 2)} 分，考生会收到通知`)
      setOverrides({})
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['score'] })
      queryClient.invalidateQueries({ queryKey: ['appeal'] })
    },
    onError: (error) => message.error(errorText(error)),
  })

  function openDetail(row: ScoreListItem) {
    setDetailAttempt(row.attempt_id)
    setOverrides({})
    setReason('')
  }

  function confirmAdjust() {
    if (!record) return
    const items = Object.entries(overrides).map(([questionId, score]) => ({ question_id: questionId, score }))
    if (items.length === 0) {
      message.warning('请先修改至少一道题目的得分')
      return
    }
    if (!reason.trim()) {
      message.warning('请填写更正原因')
      return
    }
    const nextTotal = record.detail.questions.reduce(
      (sum, item) => sum + (overrides[item.question_id] ?? item.score),
      0,
    )
    modal.confirm({
      title: '确认提交成绩更正？',
      content: `本次将修改 ${items.length} 道题，总分由 ${formatScore(record.total, 2)} 变更为 ${formatScore(nextTotal, 2)} 分。`
        + '系统会保留原分数快照与更正记录，并向考生发送站内通知。',
      okText: '确认更正',
      cancelText: '再想想',
      onOk: () => adjustMutation.mutate({ attemptId: record.attempt_id, reason: reason.trim(), items }),
    })
  }

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
  const pendingCount = appealsSummary.data?.pagination.total ?? 0

  const listCard = (
    <Card className="panel-card" variant="borderless">
        <Flex className="filter-bar" gap={12} wrap align="flex-end">
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
        </Flex>

        <QueryError error={scoresQuery.error} onRetry={() => scoresQuery.refetch()} />

        <Table
          rowKey="attempt_id"
          size="middle"
          loading={scoresQuery.isFetching}
          columns={scoreColumns(openDetail)}
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
  )

  const tabItems = [
    { key: 'list', label: '成绩列表', children: listCard },
    ...(role === 'exam_admin' || role === 'org_admin'
      ? [
          {
            key: 'appeals',
            label: pendingCount > 0 ? `申诉管理 (${pendingCount})` : '申诉管理',
            children: <AppealsPanel />,
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="成绩管理"
        subtitle="答卷判分完成后按考试发布；考生只能看到已发布的成绩，更正与申诉全程留痕。"
        extra={
          <Space>
            <Tooltip title="按考试导出 Excel，含逐行水印">
              <Button icon={<DownloadOutlined />} loading={exportMutation.isPending} onClick={confirmExport}>
                导出成绩
              </Button>
            </Tooltip>
            <Tooltip title="按考试发布，请先在筛选中选择考试">
              <Button type="primary" icon={<SendOutlined />} onClick={confirmPublish} loading={publishMutation.isPending}>
                发布成绩
              </Button>
            </Tooltip>
          </Space>
        }
      />

      <Tabs items={tabItems} />

      <Drawer
        open={Boolean(detailAttempt)}
        width={760}
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
                {
                  title: '得分',
                  dataIndex: 'score',
                  width: 128,
                  render: (value: number, item) =>
                    canAdjust ? (
                      <InputNumber
                        size="small"
                        min={0}
                        max={item.max_score}
                        step={0.5}
                        value={overrides[item.question_id] ?? value}
                        onChange={(next) => {
                          if (next === null) {
                            const copy = { ...overrides }
                            delete copy[item.question_id]
                            setOverrides(copy)
                            return
                          }
                          setOverrides({ ...overrides, [item.question_id]: Number(next) })
                        }}
                      />
                    ) : (
                      formatScore(value, 2)
                    ),
                },
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

            {canAdjust && (
              <div className="adjust-box">
                <div className="adjust-head">
                  <span className="cell-title">成绩更正</span>
                  <span className="cell-meta">修改上方得分后提交，系统保留原分数与操作人</span>
                </div>
                <Input.TextArea
                  rows={2}
                  maxLength={200}
                  showCount
                  placeholder="更正原因（必填）：例如 阅卷漏给分、题目作废全员给分"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Space>
                  <Button type="primary" loading={adjustMutation.isPending} onClick={confirmAdjust}>
                    提交更正
                  </Button>
                  {Object.keys(overrides).length > 0 && (
                    <Button
                      type="link"
                      onClick={() => {
                        setOverrides({})
                        setReason('')
                      }}
                    >
                      清空修改
                    </Button>
                  )}
                </Space>
              </div>
            )}

            {canAdjust && (
              <Card
                className="panel-card inner-card"
                variant="borderless"
                size="small"
                title={
                  <span>
                    <HistoryOutlined /> 更正记录
                  </span>
                }
              >
                <Table
                  rowKey="id"
                  size="small"
                  loading={historyQuery.isFetching}
                  dataSource={historyQuery.data ?? []}
                  pagination={false}
                  columns={[
                    { title: '时间', dataIndex: 'created_at', width: 160, render: (value: string) => formatDateTime(value) },
                    {
                      title: '分数变化',
                      key: 'delta',
                      width: 150,
                      render: (_value, item) => (
                        <span className="adjust-delta">
                          {formatScore(item.before_total, 2)} → {formatScore(item.after_total, 2)}
                        </span>
                      ),
                    },
                    { title: '原因', dataIndex: 'reason', ellipsis: true },
                    {
                      title: '逐题',
                      key: 'items',
                      width: 150,
                      render: (_value, item) => (
                        <span className="cell-meta">
                          {item.items.map((row) => `${row.question_id.slice(0, 6)}：${formatScore(row.before, 1)}→${formatScore(row.after, 1)}`).join('，')}
                        </span>
                      ),
                    },
                    { title: '操作人', dataIndex: 'operator_name', width: 110 },
                  ]}
                  locale={{ emptyText: '暂无更正记录' }}
                />
              </Card>
            )}
          </>
        )}
      </Drawer>
    </div>
  )
}
