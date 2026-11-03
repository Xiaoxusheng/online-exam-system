import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Flex, Form, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, EyeOutlined, ImportOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import QuestionEditor from './QuestionEditor'
import QuestionImportModal from '../../components/QuestionImportModal'
import { QuestionTryIt } from '../../components/QuestionTryIt'
import {
  archiveQuestion,
  createBank,
  exportQuestions,
  listBanks,
  listQuestions,
  publishQuestion,
  rejectQuestion,
  type QuestionListParams,
} from '../../api/question'
import { queryKeys } from '../../api/queryKeys'
import { useAuthStore } from '../../stores/auth'
import { difficultyLabel, questionStatusLabels, questionTypeLabel, statusOf } from '../../utils/labels'
import { formatDateTime, formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { Question } from '../../types'

const typeFilterOptions = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill', label: '填空题' },
  { value: 'short', label: '简答题' },
  { value: 'essay', label: '论述题' },
  { value: 'programming', label: '编程题' },
  { value: 'media', label: '音视频题' },
]

function stemOf(question: Question): string {
  const stem = (question.content as { stem?: unknown })?.stem
  return typeof stem === 'string' && stem ? stem : '（未填写题干）'
}

export default function QuestionsPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const role = useAuthStore((state) => state.user?.role)
  const canPublish = role === 'teacher' || role === 'org_admin'
  const canReview = role === 'exam_admin' || role === 'org_admin'

  const [draft, setDraft] = useState<Omit<QuestionListParams, 'page' | 'page_size'>>({})
  const [query, setQuery] = useState<QuestionListParams>({ page: 1, page_size: 20 })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Question | null>(null)
  const [bankOpen, setBankOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [bankForm] = Form.useForm<{ name: string; scope?: string }>()

  const banksQuery = useQuery({ queryKey: queryKeys.banks, queryFn: listBanks })
  const questionsQuery = useQuery({ queryKey: queryKeys.questions(query), queryFn: () => listQuestions(query) })
  const pagination = questionsQuery.data?.pagination
  const bankOptions = (banksQuery.data ?? []).map((bank) => ({ value: bank.id, label: bank.name }))
  const bankNames = new Map(bankOptions.map((item) => [item.value, item.label]))

  const createBankMutation = useMutation({
    mutationFn: createBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.banks })
      setBankOpen(false)
      bankForm.resetFields()
      message.success('题库已创建')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const publishMutation = useMutation({
    mutationFn: publishQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question'] })
      message.success('题目已发布，可被试卷引用')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const archiveMutation = useMutation({
    mutationFn: archiveQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question'] })
      message.success('题目已归档下架，历史试卷不受影响')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const [rejectTarget, setRejectTarget] = useState<Question | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [preview, setPreview] = useState<Question | null>(null)
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectQuestion(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question'] })
      setRejectTarget(null)
      setRejectReason('')
      message.success('已驳回，命题人可修改后重新提交')
    },
    onError: (error) => message.error(errorText(error)),
  })

  function confirmArchive(record: Question) {
    modal.confirm({
      title: `归档题目？`,
      content: '归档后题目下架，不再出现在可选列表；已包含它的历史试卷与快照不受影响。',
      okText: '确认归档',
      cancelText: '取消',
      onOk: () => archiveMutation.mutate(record.id),
    })
  }

  const exportMutation = useMutation({
    mutationFn: () =>
      exportQuestions({
        bank_id: query.bank_id,
        type: query.type,
        difficulty: query.difficulty,
        status: query.status,
        keyword: query.keyword,
      }),
    onSuccess: () => message.success('已开始下载题目文件'),
    onError: (error) => message.error(errorText(error)),
  })

  function apply() {
    setQuery({ ...draft, page: 1, page_size: pagination?.page_size ?? 20 })
  }

  const columns: ColumnsType<Question> = [
    {
      title: '题干',
      key: 'stem',
      render: (_value, record) => (
        <div className="cell-stack">
          <Tooltip title={stemOf(record)}>
            <span className="cell-title cell-ellipsis">{stemOf(record)}</span>
          </Tooltip>
          <span className="cell-meta">
            {bankNames.get(record.bank_id) ?? '未知题库'}
            {record.knowledge_point ? ` · ${record.knowledge_point}` : ''}
          </span>
        </div>
      ),
    },
    { title: '题型', dataIndex: 'type', width: 100, render: (value: string) => questionTypeLabel(value) },
    { title: '难度', dataIndex: 'difficulty', width: 80, render: (value: string) => difficultyLabel(value) },
    { title: '分值', dataIndex: 'default_score', width: 76, render: (value: number) => formatScore(value, 1) },
    { title: '版本', dataIndex: 'version', width: 70, render: (value: number) => `v${value}` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => {
        const status = statusOf(questionStatusLabels, value)
        return <Tag color={status.color}>{status.label}</Tag>
      },
    },
    { title: '更新时间', dataIndex: 'updated_at', width: 160, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_value, record) => (
        <Space size={4}>
          <Tooltip title="预览与试答">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setPreview(record)} />
          </Tooltip>
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
          {record.status !== 'published' && record.status !== 'archived' &&
            (record.status === 'pending_review' && canReview ? (
              <Button type="link" size="small" danger onClick={() => setRejectTarget(record)}>
                驳回
              </Button>
            ) : canPublish ? (
              <Button
                type="link"
                size="small"
                loading={publishMutation.isPending && publishMutation.variables === record.id}
                onClick={() => publishMutation.mutate(record.id)}
              >
                发布
              </Button>
            ) : (
              <Tooltip title="发布由命题教师或机构管理员执行">
                <Tag className="soft-tag">待发布</Tag>
              </Tooltip>
            ))}
          {record.status !== 'archived' && (
            <Button type="link" size="small" danger onClick={() => confirmArchive(record)}>
              归档
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const noBanks = (banksQuery.data ?? []).length === 0

  return (
    <div>
      <PageHeader
        title="题库管理"
        subtitle="维护题目、知识点与版本；已发布题目修改后会生成新版本，不影响历史试卷。"
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
              导出
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              批量导入
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setBankOpen(true)}>
              新建题库
            </Button>
            <Tooltip title={noBanks ? '请先创建题库' : undefined}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={noBanks}
                onClick={() => {
                  setEditing(null)
                  setEditorOpen(true)
                }}
              >
                新建题目
              </Button>
            </Tooltip>
          </Space>
        }
      />

      <Card className="panel-card" variant="borderless">
        <Flex className="filter-bar" gap={12} wrap align="flex-end">
          <Select
            allowClear
            placeholder="题库"
            style={{ width: 180 }}
            value={draft.bank_id}
            options={bankOptions}
            onChange={(value) => setDraft({ ...draft, bank_id: value })}
          />
          <Select
            allowClear
            placeholder="题型"
            style={{ width: 130 }}
            value={draft.type}
            options={typeFilterOptions}
            onChange={(value) => setDraft({ ...draft, type: value })}
          />
          <Select
            allowClear
            placeholder="难度"
            style={{ width: 110 }}
            value={draft.difficulty}
            options={[
              { value: 'easy', label: '简单' },
              { value: 'medium', label: '中等' },
              { value: 'hard', label: '困难' },
            ]}
            onChange={(value) => setDraft({ ...draft, difficulty: value })}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 120 }}
            value={draft.status}
            options={[
              { value: 'draft', label: '草稿' },
              { value: 'pending_review', label: '待审核' },
              { value: 'published', label: '已发布' },
            ]}
            onChange={(value) => setDraft({ ...draft, status: value })}
          />
          <Input
            allowClear
            placeholder="题干关键词 / 知识点"
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
        </Flex>

        <QueryError error={questionsQuery.error} onRetry={() => questionsQuery.refetch()} />

        <Table
          rowKey="id"
          size="middle"
          loading={questionsQuery.isFetching}
          columns={columns}
          dataSource={questionsQuery.data?.items ?? []}
          scroll={{ x: 1020 }}
          pagination={{
            current: pagination?.page ?? 1,
            pageSize: pagination?.page_size ?? 20,
            total: pagination?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 道题目`,
            onChange: (page, pageSize) => setQuery({ ...draft, page, page_size: pageSize }),
          }}
          locale={{
            emptyText: questionsQuery.isError
              ? ' '
              : noBanks
                ? '还没有题库，请先新建题库再命题'
                : '没有符合条件的题目',
          }}
        />
      </Card>

      <QuestionEditor
        open={editorOpen}
        question={editing}
        bankOptions={bankOptions}
        onClose={() => {
          setEditorOpen(false)
          setEditing(null)
        }}
      />

      <QuestionImportModal
        open={importOpen}
        banks={banksQuery.data ?? []}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['question', 'list'] })
          queryClient.invalidateQueries({ queryKey: queryKeys.banks })
        }}
      />

      <Modal
        open={bankOpen}
        title="新建题库"
        okText="保存"
        cancelText="取消"
        confirmLoading={createBankMutation.isPending}
        onOk={() => bankForm.submit()}
        onCancel={() => setBankOpen(false)}
        destroyOnHidden
      >
        <Form form={bankForm} layout="vertical" initialValues={{ scope: 'org' }} onFinish={(values) => createBankMutation.mutate(values)}>
          <Form.Item name="name" label="题库名称" rules={[{ required: true, message: '请填写题库名称' }, { max: 60 }]}>
            <Input placeholder="如：高中数学必修一" />
          </Form.Item>
          <Form.Item name="scope" label="可见范围">
            <Select
              options={[
                { value: 'org', label: '全机构' },
                { value: 'campus', label: '本校区' },
                { value: 'personal', label: '仅创建者' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(preview)}
        title={preview ? `题目预览与试答 · v${preview.version}` : '题目预览'}
        footer={null}
        width={640}
        onCancel={() => setPreview(null)}
        destroyOnHidden
      >
        {preview && (
          <QuestionTryIt
            type={preview.type}
            content={preview.content}
            answer={preview.answer as unknown as Record<string, unknown>}
            score={preview.default_score}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        title="驳回题目"
        okText="确认驳回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        confirmLoading={rejectMutation.isPending}
        onOk={() => {
          const reason = rejectReason.trim()
          if (!reason) {
            message.warning('请填写驳回理由')
            return
          }
          if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, reason })
        }}
        onCancel={() => {
          setRejectTarget(null)
          setRejectReason('')
        }}
      >
        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="驳回理由（必填）：例如 答案与题干不符、知识点标注错误"
        />
      </Modal>
    </div>
  )
}
