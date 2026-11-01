import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, DatePicker, Drawer, Flex, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import SectionFold from '../../components/SectionFold'
import ExamDetail from './ExamDetail'
import { createExam, listExams, publishExam, type ExamInput, type ExamListParams } from '../../api/exam'
import { listPapers } from '../../api/paper'
import { listClasses, listUsers } from '../../api/org'
import { queryKeys } from '../../api/queryKeys'
import { examStatusLabels, statusOf } from '../../utils/labels'
import { formatDateTime } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { Exam } from '../../types'

interface CreateFormValues {
  paper_id: string
  title: string
  window: [Dayjs, Dayjs]
  duration_minutes: number
  pass_score?: number
  show_score: boolean
  anonymous_review: boolean
  review_mode: 'single' | 'double'
  review_threshold?: number
  class_ids?: string[]
  student_ids?: string[]
  restrict_mobile?: boolean
  disable_paste?: boolean
  screen_switch_limit?: number
  snapshot_interval?: number
  show_analysis?: boolean
}

export default function ExamsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Omit<ExamListParams, 'page' | 'page_size'>>({})
  const [query, setQuery] = useState<ExamListParams>({ page: 1, page_size: 20 })
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [form] = Form.useForm<CreateFormValues>()
  const reviewMode = Form.useWatch('review_mode', form)

  const examsQuery = useQuery({ queryKey: queryKeys.exams(query), queryFn: () => listExams(query) })
  const papersQuery = useQuery({
    queryKey: queryKeys.papers({ status: 'approved', page: 1, page_size: 100 }),
    queryFn: () => listPapers({ status: 'approved', page: 1, page_size: 100 }),
    enabled: createOpen,
  })
  const classesQuery = useQuery({ queryKey: queryKeys.classes(), queryFn: () => listClasses(), enabled: createOpen })
  const studentsQuery = useQuery({
    queryKey: queryKeys.users({ role: 'student', page: 1, page_size: 100 }),
    queryFn: () => listUsers({ role: 'student', page: 1, page_size: 100 }),
    enabled: createOpen,
  })

  const paperOptions = useMemo(
    () =>
      (papersQuery.data?.items ?? []).map((paper) => ({
        value: paper.id,
        label: `${paper.title}（${paper.question_count} 题 / ${paper.total_score} 分）`,
      })),
    [papersQuery.data],
  )
  const classOptions = (classesQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))
  const studentOptions = (studentsQuery.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.name}（${item.username}）` }))

  const publishMutation = useMutation({
    mutationFn: publishExam,
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ['exam'] })
      message.success(`《${exam.title}》已发布，考生将收到站内通知`)
    },
    onError: (error) => message.error(errorText(error)),
  })

  const createMutation = useMutation({
    mutationFn: (input: ExamInput) => createExam(input),
    onSuccess: (exam) => {
      queryClient.invalidateQueries({ queryKey: ['exam'] })
      message.success('考试已创建（草稿），编排完成后可发布')
      setCreateOpen(false)
      form.resetFields()
      setDetailId(exam.id)
    },
    onError: (error) => message.error(errorText(error)),
  })

  async function submitCreate() {
    let values: CreateFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    createMutation.mutate({
      paper_id: values.paper_id,
      title: values.title,
      start_at: values.window[0].toISOString(),
      end_at: values.window[1].toISOString(),
      duration_minutes: values.duration_minutes,
      rules: {
        pass_score: values.pass_score,
        show_score: values.show_score,
        anonymous_review: values.anonymous_review,
        review_mode: values.review_mode,
        review_threshold: values.review_mode === 'double' ? values.review_threshold : undefined,
        restrict_mobile: values.restrict_mobile ?? false,
        disable_paste: values.disable_paste ?? false,
        screen_switch_limit: values.screen_switch_limit ?? 5,
        snapshot_interval: values.snapshot_interval ?? 0,
        show_analysis: values.show_analysis ?? false,
      },
      class_ids: values.class_ids ?? [],
      candidates: (values.student_ids ?? []).map((id) => ({ user_id: id })),
    })
  }

  function apply() {
    setQuery({ ...draft, page: 1, page_size: query.page_size ?? 20 })
  }

  const columns: ColumnsType<Exam> = [
    {
      title: '考试',
      key: 'title',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.title}</span>
          <span className="cell-meta">
            {record.paper_title} · {record.candidate_count} 名考生
          </span>
        </div>
      ),
    },
    {
      title: '时间窗',
      key: 'window',
      width: 250,
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{formatDateTime(record.start_at)} 起</span>
          <span className="cell-meta">
            至 {formatDateTime(record.end_at)} · 限时 {record.duration_minutes} 分钟
          </span>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => {
        const status = statusOf(examStatusLabels, value)
        return <Tag color={status.color}>{status.label}</Tag>
      },
    },
    {
      title: '判卷方式',
      key: 'review',
      width: 130,
      render: (_value, record) =>
        record.rules?.review_mode === 'double' ? (
          <Tooltip title={`两评分差超过 ${record.rules?.review_threshold ?? '满分 20%'} 时进入三评仲裁`}>
            <Tag color="purple">双评 + 仲裁</Tag>
          </Tooltip>
        ) : (
          <span className="cell-meta">单评</span>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_value, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => setDetailId(record.id)}>
            详情
          </Button>
          {(record.status === 'draft' || record.status === 'pending_publish') && (
            <Button
              type="link"
              size="small"
              loading={publishMutation.isPending && publishMutation.variables === record.id}
              onClick={() => publishMutation.mutate(record.id)}
            >
              发布
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="考试管理"
        subtitle="规划时间窗、编排考生、配置判卷与监考策略；发布后生成试卷快照。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建考试
          </Button>
        }
      />

      <Card className="panel-card" variant="borderless">
        <Flex className="filter-bar" gap={12} wrap align="flex-end">
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            value={draft.status}
            options={Object.entries(examStatusLabels).map(([value, item]) => ({ value, label: item.label }))}
            onChange={(value) => setDraft({ ...draft, status: value })}
          />
          <Input
            allowClear
            placeholder="考试名称"
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

        <QueryError error={examsQuery.error} onRetry={() => examsQuery.refetch()} />

        <Table
          rowKey="id"
          size="middle"
          loading={examsQuery.isFetching}
          columns={columns}
          dataSource={examsQuery.data?.items ?? []}
          scroll={{ x: 1000 }}
          pagination={{
            current: examsQuery.data?.pagination.page ?? 1,
            pageSize: examsQuery.data?.pagination.page_size ?? 20,
            total: examsQuery.data?.pagination.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 场考试`,
            onChange: (page, pageSize) => setQuery({ ...draft, page, page_size: pageSize }),
          }}
          locale={{ emptyText: examsQuery.isError ? ' ' : '还没有考试安排' }}
        />
      </Card>

      <Drawer
        open={createOpen}
        width={620}
        title="新建考试"
        destroyOnHidden
        onClose={() => setCreateOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" loading={createMutation.isPending} onClick={submitCreate}>
              创建
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            duration_minutes: 60,
            show_score: true,
            anonymous_review: true,
            review_mode: 'single',
            review_threshold: 2,
            window: [dayjs().add(1, 'day').hour(9).minute(0), dayjs().add(1, 'day').hour(11).minute(0)],
          }}
        >
          <Form.Item name="paper_id" label="试卷" rules={[{ required: true, message: '请选择已审核通过的试卷' }]}
            extra={papersQuery.data?.items?.length ? undefined : '暂无可用试卷，请先完成组卷与审核'}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择已通过审核的试卷"
              options={paperOptions}
              loading={papersQuery.isFetching}
            />
          </Form.Item>

          <Form.Item name="title" label="考试名称" rules={[{ required: true, message: '请填写考试名称' }, { max: 120 }]}>
            <Input placeholder="如：2026 秋季期中考试" />
          </Form.Item>

          <Form.Item name="window" label="考试时间窗" rules={[{ required: true, message: '请选择起止时间' }]}>
            <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>

          <div className="form-grid">
            <Form.Item name="duration_minutes" label="答题时长（分钟）" rules={[{ required: true }]}>
              <InputNumber min={5} max={1440} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="pass_score" label="及格分" extra="留空按满分 60% 计算">
              <InputNumber min={0} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <SectionFold
            defaultActiveKey={['rule', 'students']}
            items={[
              {
                key: 'rule',
                title: '成绩与阅卷',
                children: (
                  <>
                    <div className="form-grid">
                      <Form.Item name="show_score" label="对考生显示成绩" valuePropName="checked" tooltip="关闭后考生查完成绩也不可见，需成绩发布">
                        <Switch />
                      </Form.Item>
                      <Form.Item name="anonymous_review" label="匿名阅卷" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </div>

                    <div className="form-grid">
                      <Form.Item name="review_mode" label="阅卷方式" tooltip="双评：同一题两位教师独立评分，分差超阈值进入三评仲裁">
                        <Select
                          options={[
                            { value: 'single', label: '单评' },
                            { value: 'double', label: '双评 + 仲裁' },
                          ]}
                        />
                      </Form.Item>
                      {reviewMode === 'double' && (
                        <Form.Item name="review_threshold" label="分差阈值（分）" extra="留空按该题满分 20% 计算">
                          <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                        </Form.Item>
                      )}
                    </div>
                  </>
                ),
              },
              {
                key: 'proctor',
                title: '监考与防作弊',
                children: (
                  <>
                    <div className="form-grid">
                      <Form.Item
                        name="restrict_mobile"
                        label="仅限电脑作答"
                        valuePropName="checked"
                        tooltip="开启后移动端 / 手机浏览器无法进入本场考试（严肃考试建议开启）"
                      >
                        <Switch />
                      </Form.Item>
                      <Form.Item
                        name="disable_paste"
                        label="禁止粘贴"
                        valuePropName="checked"
                        tooltip="开启后作答页无法粘贴内容"
                      >
                        <Switch />
                      </Form.Item>
                    </div>
                    <div className="form-grid">
                      <Form.Item
                        name="screen_switch_limit"
                        label="切屏告警阈值（次）"
                        extra="考生离开作答页面达到该次数时弹出警告并推送监考端，0 为不限制"
                      >
                        <InputNumber min={0} max={50} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name="snapshot_interval"
                        label="摄像头抓拍间隔（秒）"
                        extra="0 为不抓拍；开启后考生授权摄像头，每间隔自动上传一帧供监考取证"
                      >
                        <InputNumber min={0} max={600} step={5} style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                  </>
                ),
              },
              {
                key: 'analysis',
                title: '答案与解析',
                children: (
                  <Form.Item
                    name="show_analysis"
                    label="成绩发布后展示解析"
                    valuePropName="checked"
                    tooltip="开启后考生在成绩明细中可查看正确答案、参考答案与评分要点"
                  >
                    <Switch />
                  </Form.Item>
                ),
              },
              {
                key: 'students',
                title: '考生编排',
                children: (
                  <>
                    <Form.Item name="class_ids" label="按班级编排" tooltip="班级内启用状态的学员会被全部加入">
                      <Select mode="multiple" allowClear placeholder="选择班级" options={classOptions} loading={classesQuery.isFetching} />
                    </Form.Item>

                    <Form.Item
                      name="student_ids"
                      label="单独添加考生"
                      extra={
                        (studentsQuery.data?.items ?? []).length >= 100
                          ? '列表仅展示前 100 名学员，整班考生请用「按班级编排」'
                          : undefined
                      }
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="选择学员"
                        options={studentOptions}
                        loading={studentsQuery.isFetching}
                      />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>

      <ExamDetail examId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
