import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Input, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import PaperEditor from './PaperEditor'
import { approvePaper, listPapers, submitPaperReview, type PaperListParams } from '../../api/paper'
import { queryKeys } from '../../api/queryKeys'
import { useAuthStore } from '../../stores/auth'
import { paperStatusLabels, paperTypeLabel, statusOf } from '../../utils/labels'
import { formatDateTime, formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { Paper } from '../../types'

export default function PapersPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const role = useAuthStore((state) => state.user?.role)
  const canSubmit = role === 'teacher' || role === 'org_admin'
  const canApprove = role === 'exam_admin' || role === 'org_admin'

  const [draft, setDraft] = useState<Omit<PaperListParams, 'page' | 'page_size'>>({})
  const [query, setQuery] = useState<PaperListParams>({ page: 1, page_size: 20 })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Paper | null>(null)

  const papersQuery = useQuery({ queryKey: queryKeys.papers(query), queryFn: () => listPapers(query) })
  const pagination = papersQuery.data?.pagination

  const submitReviewMutation = useMutation({
    mutationFn: submitPaperReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper'] })
      message.success('已提交审核，等待考务管理员通过')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const approveMutation = useMutation({
    mutationFn: approvePaper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper'] })
      message.success('试卷已通过审核，可用于创建考试')
    },
    onError: (error) => message.error(errorText(error)),
  })

  function apply() {
    setQuery({ ...draft, page: 1, page_size: pagination?.page_size ?? 20 })
  }

  const columns: ColumnsType<Paper> = [
    {
      title: '试卷',
      key: 'title',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.title}</span>
          <span className="cell-meta">
            {paperTypeLabel(record.type)} · {record.question_count} 题 · {formatScore(record.total_score, 1)} 分
          </span>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => {
        const status = statusOf(paperStatusLabels, value)
        return <Tag color={status.color}>{status.label}</Tag>
      },
    },
    { title: '版本', dataIndex: 'version', width: 76, render: (value: number) => `v${value}` },
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (value: string) => formatDateTime(value) },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_value, record) => (
        <Space size={4}>
          {record.status === 'draft' && (
            <>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setEditing(record)
                  setEditorOpen(true)
                }}
              >
                编辑
              </Button>
              {canSubmit ? (
                <Button
                  type="link"
                  size="small"
                  loading={submitReviewMutation.isPending && submitReviewMutation.variables === record.id}
                  onClick={() => submitReviewMutation.mutate(record.id)}
                >
                  提交审核
                </Button>
              ) : (
                <Tooltip title="提交审核由命题教师执行">
                  <Tag className="soft-tag">待提交</Tag>
                </Tooltip>
              )}
            </>
          )}
          {record.status === 'pending_review' &&
            (canApprove ? (
              <Button
                type="link"
                size="small"
                loading={approveMutation.isPending && approveMutation.variables === record.id}
                onClick={() => approveMutation.mutate(record.id)}
              >
                审核通过
              </Button>
            ) : (
              <Tooltip title="审核由考务管理员执行">
                <Tag className="soft-tag">待审核</Tag>
              </Tooltip>
            ))}
          {(record.status === 'approved' || record.status === 'archived') && <span className="cell-meta">已定稿</span>}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="试卷与组卷"
        subtitle="固定卷、随机卷与 AB 卷；审核通过后才能用于创建考试。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          >
            新建试卷
          </Button>
        }
      />

      <Card className="panel-card" variant="borderless">
        <div className="filter-bar">
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 130 }}
            value={draft.status}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'pending_review', label: '待审核' },
              { value: 'approved', label: '已通过' },
            ]}
            onChange={(value) => setDraft({ ...draft, status: value })}
          />
          <Select
            allowClear
            placeholder="组卷方式"
            style={{ width: 130 }}
            value={draft.type}
            options={[
              { value: 'fixed', label: '固定卷' },
              { value: 'random', label: '随机卷' },
              { value: 'ab', label: 'AB 卷' },
            ]}
            onChange={(value) => setDraft({ ...draft, type: value })}
          />
          <Input
            allowClear
            placeholder="试卷名称"
            style={{ width: 220 }}
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

        <QueryError error={papersQuery.error} onRetry={() => papersQuery.refetch()} />

        <Table
          rowKey="id"
          size="middle"
          loading={papersQuery.isPending}
          columns={columns}
          dataSource={papersQuery.data?.items ?? []}
          scroll={{ x: 900 }}
          pagination={{
            current: pagination?.page ?? 1,
            pageSize: pagination?.page_size ?? 20,
            total: pagination?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 份试卷`,
            onChange: (page, pageSize) => setQuery({ ...draft, page, page_size: pageSize }),
          }}
          locale={{ emptyText: papersQuery.isError ? ' ' : '还没有试卷，点击右上角新建' }}
        />
      </Card>

      <PaperEditor
        open={editorOpen}
        paper={editing}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
