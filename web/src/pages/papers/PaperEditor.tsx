import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Drawer, Empty, Form, Input, InputNumber, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import QueryError from '../../components/QueryError'
import { createPaper, getPaper, updatePaper } from '../../api/paper'
import type { PaperInput } from '../../api/paper'
import { listBanks, listQuestions } from '../../api/question'
import { queryKeys } from '../../api/queryKeys'
import { difficultyLabel, paperTypeLabel, questionTypeLabel } from '../../utils/labels'
import { formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { Paper, Question, QuestionType, RandomSection } from '../../types'

interface PickedRow {
  question_id: string
  section: string
  paper_group: string
  score: number
  type: QuestionType
  knowledge_point: string
  stem: string
}

interface FormValues {
  title: string
  type: Paper['type']
  sections?: RandomSection[]
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill', label: '填空题' },
  { value: 'short', label: '简答题' },
  { value: 'essay', label: '论述题' },
  { value: 'programming', label: '编程题' },
  { value: 'media', label: '音视频题' },
]

const OBJECTIVE: QuestionType[] = ['single', 'multiple', 'judge', 'fill']

function stemOf(question: Question): string {
  const stem = (question.content as { stem?: unknown })?.stem
  return typeof stem === 'string' && stem ? stem : question.id.slice(0, 8)
}

function defaultSection(type: QuestionType): string {
  return OBJECTIVE.includes(type) ? '一、客观题' : '二、主观题'
}

export default function PaperEditor({
  open,
  paper,
  onClose,
}: {
  open: boolean
  paper: Paper | null
  onClose: () => void
}) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<FormValues>()
  const type = Form.useWatch('type', form) ?? 'fixed'
  const sections = Form.useWatch('sections', form) ?? []

  const [picked, setPicked] = useState<PickedRow[]>([])
  const [catalogFilter, setCatalogFilter] = useState<{ bank_id?: string; type?: string; keyword?: string }>({})
  const [catalogQuery, setCatalogQuery] = useState({ page: 1, page_size: 6 })

  const banksQuery = useQuery({ queryKey: queryKeys.banks, queryFn: listBanks, enabled: open })
  const catalogState = useQuery({
    queryKey: queryKeys.questions({ ...catalogQuery, ...catalogFilter, status: 'published' }),
    queryFn: () => listQuestions({ ...catalogQuery, ...catalogFilter, status: 'published' }),
    enabled: open && type !== 'random',
  })
  const detailState = useQuery({
    queryKey: queryKeys.paper(paper?.id ?? ''),
    queryFn: () => getPaper(paper?.id ?? ''),
    enabled: open && Boolean(paper),
  })

  const bankOptions = useMemo(() => (banksQuery.data ?? []).map((bank) => ({ value: bank.id, label: bank.name })), [banksQuery.data])
  const pickedIds = useMemo(() => new Set(picked.map((row) => row.question_id)), [picked])
  const fixedTotal = picked.reduce((sum, row) => sum + (Number(row.score) || 0), 0)
  const randomTotal = sections.reduce((sum, section) => sum + (Number(section?.count) || 0) * (Number(section?.score) || 0), 0)

  // Editing a paper starts from its stored question list, not from scratch.
  useEffect(() => {
    if (!open) {
      setPicked([])
      return
    }
    if (!paper || picked.length > 0 || !detailState.data) return
    setPicked(
      detailState.data.questions.map((question) => ({
        question_id: question.question_id,
        section: question.section,
        paper_group: question.paper_group,
        score: question.score,
        type: question.type,
        knowledge_point: question.knowledge_point,
        stem: stemOf(question as unknown as Question),
      })),
    )
  }, [open, paper, detailState.data, picked.length])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const input: PaperInput = { type: values.type, title: values.title }
      if (values.type === 'random') {
        input.rules = { sections: values.sections ?? [] }
        input.questions = []
      } else {
        input.questions = picked.map((row) => ({
          question_id: row.question_id,
          section: row.section,
          paper_group: row.paper_group,
          score: Number(row.score) || 0,
        }))
      }
      return paper ? updatePaper(paper.id, input) : createPaper(input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper'] })
      message.success(paper ? '试卷已保存' : '试卷已创建（草稿）')
      onClose()
    },
    onError: (error) => message.error(errorText(error)),
  })

  function addQuestion(question: Question) {
    if (pickedIds.has(question.id)) return
    setPicked((current) => [
      ...current,
      {
        question_id: question.id,
        section: defaultSection(question.type),
        paper_group: 'A',
        score: question.default_score,
        type: question.type,
        knowledge_point: question.knowledge_point,
        stem: stemOf(question),
      },
    ])
  }

  function move(index: number, delta: number) {
    setPicked((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(target, 0, row)
      return next
    })
  }

  async function submit() {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    if (values.type === 'random') {
      if ((values.sections ?? []).length === 0) {
        message.warning('随机卷至少需要一条抽题规则')
        return
      }
    } else if (picked.length === 0) {
      message.warning('请至少选择一道题目')
      return
    }
    mutation.mutate(values)
  }

  const catalogColumns: ColumnsType<Question> = [
    {
      title: '题干',
      key: 'stem',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title cell-ellipsis">{stemOf(record)}</span>
          <span className="cell-meta">
            {questionTypeLabel(record.type)} · {difficultyLabel(record.difficulty)} · {formatScore(record.default_score, 1)} 分
          </span>
        </div>
      ),
    },
    {
      title: '',
      key: 'add',
      width: 76,
      render: (_value, record) => (
        <Button
          size="small"
          type={pickedIds.has(record.id) ? 'default' : 'primary'}
          icon={<PlusOutlined />}
          disabled={pickedIds.has(record.id)}
          onClick={() => addQuestion(record)}
        >
          {pickedIds.has(record.id) ? '已选' : '加入'}
        </Button>
      ),
    },
  ]

  const pickedColumns: ColumnsType<PickedRow> = [
    {
      title: '题目',
      key: 'question',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title cell-ellipsis">{record.stem}</span>
          <span className="cell-meta">{questionTypeLabel(record.type)}</span>
        </div>
      ),
    },
    {
      title: '大题',
      key: 'section',
      width: 132,
      render: (_value, record, index) => (
        <Input
          size="small"
          value={record.section}
          onChange={(event) =>
            setPicked((current) => current.map((row, i) => (i === index ? { ...row, section: event.target.value } : row)))
          }
        />
      ),
    },
    ...(type === 'ab'
      ? [
          {
            title: '分组',
            key: 'paper_group',
            width: 92,
            render: (_value: unknown, record: PickedRow, index: number) => (
              <Select
                size="small"
                value={record.paper_group}
                style={{ width: 72 }}
                options={[
                  { value: 'A', label: 'A 组' },
                  { value: 'B', label: 'B 组' },
                ]}
                onChange={(value) =>
                  setPicked((current) => current.map((row, i) => (i === index ? { ...row, paper_group: value } : row)))
                }
              />
            ),
          },
        ]
      : []),
    {
      title: '分值',
      key: 'score',
      width: 92,
      render: (_value, record, index) => (
        <InputNumber
          size="small"
          min={0.5}
          max={100}
          step={0.5}
          value={record.score}
          style={{ width: 74 }}
          onChange={(value) =>
            setPicked((current) => current.map((row, i) => (i === index ? { ...row, score: Number(value) || 0 } : row)))
          }
        />
      ),
    },
    {
      title: '',
      key: 'sort',
      width: 108,
      render: (_value, _record, index) => (
        <Space size={0}>
          <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label="上移" onClick={() => move(index, -1)} />
          <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label="下移" onClick={() => move(index, 1)} />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label="移除题目"
            onClick={() => setPicked((current) => current.filter((_, i) => i !== index))}
          />
        </Space>
      ),
    },
  ]

  return (
    <Drawer
      open={open}
      width={1180}
      destroyOnHidden
      title={paper ? `编辑试卷 · ${paper.title}` : '新建试卷'}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={mutation.isPending} onClick={submit}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={paper ? { title: paper.title, type: paper.type, sections: paper.rules?.sections ?? [] } : { title: '', type: 'fixed', sections: [] }}
      >
        <div className="form-grid">
          <Form.Item name="title" label="试卷名称" rules={[{ required: true, message: '请填写试卷名称' }, { max: 120 }]}>
            <Input placeholder="如：2026 秋季期中数学卷" />
          </Form.Item>
          <Form.Item
            name="type"
            label="组卷方式"
            tooltip="固定卷手工选题；AB 卷按考生分组下发不同题目；随机卷保存抽题规则，发布考试时生成题目"
            rules={[{ required: true }]}
          >
            <Select
              disabled={Boolean(paper)}
              options={[
                { value: 'fixed', label: paperTypeLabel('fixed') },
                { value: 'ab', label: paperTypeLabel('ab') },
                { value: 'random', label: paperTypeLabel('random') },
              ]}
            />
          </Form.Item>
        </div>

        {type === 'random' ? (
          <Card
            className="panel-card"
            variant="borderless"
            title="抽题规则"
            extra={<Tag className="soft-tag">合计 {formatScore(randomTotal, 1)} 分</Tag>}
          >
            <Form.List name="sections">
              {(fields, { add, remove }) => (
                <div className="section-editor">
                  {fields.map((field) => (
                    <div className="section-row" key={field.key}>
                      <Form.Item
                        name={[field.name, 'name']}
                        label="大题名称"
                        rules={[{ required: true, message: '必填' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="如：一、单选题" style={{ width: 150 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'bank_id']}
                        label="题库"
                        rules={[{ required: true, message: '必选' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select placeholder="选择题库" options={bankOptions} style={{ width: 170 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'type']}
                        label="题型"
                        rules={[{ required: true, message: '必选' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select options={QUESTION_TYPES} style={{ width: 110 }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'difficulty']} label="难度" style={{ marginBottom: 0 }}>
                        <Select
                          allowClear
                          placeholder="不限"
                          style={{ width: 96 }}
                          options={[
                            { value: 'easy', label: '简单' },
                            { value: 'medium', label: '中等' },
                            { value: 'hard', label: '困难' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item name={[field.name, 'knowledge_point']} label="知识点" style={{ marginBottom: 0 }}>
                        <Input placeholder="不限" style={{ width: 120 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'count']}
                        label="数量"
                        rules={[{ required: true, message: '必填' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={1} max={100} style={{ width: 80 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'score']}
                        label="每题分值"
                        rules={[{ required: true, message: '必填' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0.5} max={100} step={0.5} style={{ width: 90 }} />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} aria-label="删除规则" onClick={() => remove(field.name)} />
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ name: '', bank_id: undefined, type: 'single', count: 5, score: 2 })}
                  >
                    添加抽题规则
                  </Button>
                </div>
              )}
            </Form.List>
          </Card>
        ) : (
          <div className="paper-picker">
            <Card className="panel-card" variant="borderless" title="题库选题">
              <div className="filter-bar">
                <Select
                  allowClear
                  placeholder="题库"
                  style={{ width: 150 }}
                  value={catalogFilter.bank_id}
                  options={bankOptions}
                  onChange={(value) => setCatalogFilter({ ...catalogFilter, bank_id: value })}
                />
                <Select
                  allowClear
                  placeholder="题型"
                  style={{ width: 110 }}
                  value={catalogFilter.type}
                  options={QUESTION_TYPES}
                  onChange={(value) => setCatalogFilter({ ...catalogFilter, type: value })}
                />
                <Input
                  allowClear
                  placeholder="题干关键词"
                  style={{ width: 150 }}
                  value={catalogFilter.keyword}
                  onChange={(event) => setCatalogFilter({ ...catalogFilter, keyword: event.target.value })}
                  onPressEnter={() => setCatalogQuery({ page: 1, page_size: 6 })}
                />
                <Button icon={<SearchOutlined />} type="primary" onClick={() => setCatalogQuery({ page: 1, page_size: 6 })}>
                  查询
                </Button>
              </div>
              <QueryError error={catalogState.error} onRetry={() => catalogState.refetch()} />
              <Table
                rowKey="id"
                size="small"
                loading={catalogState.isPending}
                columns={catalogColumns}
                dataSource={catalogState.data?.items ?? []}
                pagination={{
                  current: catalogState.data?.pagination.page ?? 1,
                  pageSize: 6,
                  total: catalogState.data?.pagination.total ?? 0,
                  size: 'small',
                  showSizeChanger: false,
                  onChange: (page) => setCatalogQuery({ page, page_size: 6 }),
                }}
                locale={{
                  emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有已发布题目，请先发布题目" />,
                }}
              />
            </Card>

            <Card
              className="panel-card"
              variant="borderless"
              title={`已选题目（${picked.length}）`}
              extra={<Tag className="soft-tag">合计 {formatScore(fixedTotal, 1)} 分</Tag>}
            >
              {paper && detailState.isPending ? (
                <div className="notice-loading">载入试卷题目…</div>
              ) : (
                <Table
                  rowKey="question_id"
                  size="small"
                  tableLayout="fixed"
                  columns={pickedColumns}
                  dataSource={picked}
                  pagination={false}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧题库加入题目" /> }}
                />
              )}
            </Card>
          </div>
        )}
      </Form>
    </Drawer>
  )
}
