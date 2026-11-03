import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Descriptions, Drawer, Flex, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { DatePicker } from 'antd'
import QueryError from '../../components/QueryError'
import {
  addCandidates,
  createExam,
  getExam,
  listCandidates,
  listProctors,
  listRetakeCandidates,
  listReviewers,
  publishExam,
  rescheduleExam,
  setProctors,
  setReviewers,
} from '../../api/exam'
import type { RetakeCandidate } from '../../api/exam'
import dayjs from 'dayjs'
import { listClasses, listUsers } from '../../api/org'
import { queryKeys } from '../../api/queryKeys'
import { candidateStatusLabels, examStatusLabels, paperTypeLabel, roleLabel, statusOf } from '../../utils/labels'
import { formatDateTime } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { ExamCandidate } from '../../types'

const candidateColumns: ColumnsType<ExamCandidate> = [
  {
    title: '考生',
    key: 'name',
    render: (_value, record) => (
      <div className="cell-stack">
        <span className="cell-title">{record.name}</span>
        <span className="cell-meta">{record.username}</span>
      </div>
    ),
  },
  { title: '分组', dataIndex: 'paper_group', width: 76 },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: (value: string) => {
      const status = statusOf(candidateStatusLabels, value)
      return <Tag color={status.color}>{status.label}</Tag>
    },
  },
  { title: '准考证', dataIndex: 'ticket_no', render: (value: string) => value || <span className="cell-meta">未生成</span> },
  { title: '编排时间', dataIndex: 'created_at', width: 160, render: (value: string) => formatDateTime(value) },
]

export default function ExamDetail({ examId, onClose }: { examId: string | null; onClose: () => void }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [classIds, setClassIds] = useState<string[]>([])
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [proctorIds, setProctorIds] = useState<string[]>([])
  const [reviewerIds, setReviewerIds] = useState<string[]>([])

  const examQuery = useQuery({
    queryKey: queryKeys.exam(examId ?? ''),
    queryFn: () => getExam(examId ?? ''),
    enabled: Boolean(examId),
  })
  const candidatesQuery = useQuery({
    queryKey: queryKeys.candidates(examId ?? '', page),
    queryFn: () => listCandidates(examId ?? '', page, 20),
    enabled: Boolean(examId),
  })
  const proctorsQuery = useQuery({
    queryKey: queryKeys.examStaff(examId ?? '', 'proctors'),
    queryFn: () => listProctors(examId ?? ''),
    enabled: Boolean(examId),
  })
  const reviewersQuery = useQuery({
    queryKey: queryKeys.examStaff(examId ?? '', 'reviewers'),
    queryFn: () => listReviewers(examId ?? ''),
    enabled: Boolean(examId),
  })
  const classesQuery = useQuery({ queryKey: queryKeys.classes(), queryFn: () => listClasses(), enabled: Boolean(examId) })
  const proctorPool = useQuery({
    queryKey: queryKeys.users({ role: 'proctor', page: 1, page_size: 100 }),
    queryFn: () => listUsers({ role: 'proctor', page: 1, page_size: 100 }),
    enabled: Boolean(examId),
  })
  const reviewerPool = useQuery({
    queryKey: queryKeys.users({ role: 'reviewer', page: 1, page_size: 100 }),
    queryFn: () => listUsers({ role: 'reviewer', page: 1, page_size: 100 }),
    enabled: Boolean(examId),
  })
  const studentPool = useQuery({
    queryKey: queryKeys.users({ role: 'student', page: 1, page_size: 100 }),
    queryFn: () => listUsers({ role: 'student', page: 1, page_size: 100 }),
    enabled: Boolean(examId),
  })

  const exam = examQuery.data

  useEffect(() => {
    if (!examId) {
      setPage(1)
      setClassIds([])
      setStudentIds([])
      return
    }
    setProctorIds((proctorsQuery.data ?? []).map((item) => item.user_id))
    setReviewerIds((reviewersQuery.data ?? []).map((item) => item.user_id))
  }, [examId, proctorsQuery.data, reviewersQuery.data])

  const publishMutation = useMutation({
    mutationFn: publishExam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam'] })
      message.success('考试已发布，考生会收到站内通知')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [newWindow, setNewWindow] = useState<[Dayjs, Dayjs] | null>(null)
  const [rescheduleReason, setRescheduleReason] = useState('')
  const rescheduleMutation = useMutation({
    mutationFn: (input: { start_at: string; end_at: string; reason?: string }) => rescheduleExam(examId ?? '', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam'] })
      setRescheduleOpen(false)
      setRescheduleReason('')
      message.success('考试时间已调整，全部考生会收到站内通知')
    },
    onError: (error) => message.error(errorText(error)),
  })

  function openReschedule() {
    if (!exam) return
    setNewWindow([dayjs(exam.start_at), dayjs(exam.end_at)])
    setRescheduleReason('')
    setRescheduleOpen(true)
  }

  function submitReschedule() {
    if (!newWindow) return
    if (!newWindow[0].isValid() || !newWindow[1].isValid() || !newWindow[1].isAfter(newWindow[0])) {
      message.warning('结束时间必须晚于开始时间')
      return
    }
    rescheduleMutation.mutate({
      start_at: newWindow[0].toISOString(),
      end_at: newWindow[1].toISOString(),
      reason: rescheduleReason.trim() || undefined,
    })
  }

  const canReschedule = Boolean(
    exam && ['pending_start', 'in_progress', 'pending_publish'].includes(exam.status) && examId,
  )

  const isRetake = Boolean(exam?.rules?.retake_of)
  const retakeVisible = Boolean(exam && ['published', 'ended', 'grading', 'pending_publish_score', 'archived'].includes(exam.status))
  const retakeQuery = useQuery({
    queryKey: ['exam', 'retake-candidates', examId],
    queryFn: () => listRetakeCandidates(examId ?? ''),
    enabled: retakeVisible && Boolean(examId),
  })
  const [retakeChecked, setRetakeChecked] = useState<string[]>([])
  const [retakeWindow, setRetakeWindow] = useState<[Dayjs, Dayjs] | null>(null)
  const [retakeOpen, setRetakeOpen] = useState(false)
  const retakeCreateMutation = useMutation({
    mutationFn: (input: Parameters<typeof createExam>[0]) => createExam(input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['exam'] })
      setRetakeChecked([])
      message.success(`补考场次《${created.title}》已创建（草稿），请发布并通知考生`)
    },
    onError: (error) => message.error(errorText(error)),
  })

  function submitRetake() {
    if (!exam || !retakeWindow) return
    const failed = retakeChecked
    if (failed.length === 0) {
      message.warning('请至少勾选一名补考考生')
      return
    }
    retakeCreateMutation.mutate({
      paper_id: exam.paper_id,
      title: `${exam.title} 补考`,
      start_at: retakeWindow[0].toISOString(),
      end_at: retakeWindow[1].toISOString(),
      duration_minutes: exam.duration_minutes,
      rules: { ...exam.rules, pass_score: exam.rules?.pass_score },
      retake_of: exam.id,
      candidates: failed.map((userId) => ({ user_id: userId })),
    })
  }

  const addCandidatesMutation = useMutation({
    mutationFn: () => addCandidates(examId ?? '', { class_ids: classIds, candidates: studentIds.map((id) => ({ user_id: id })) }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['exam'] })
      setClassIds([])
      setStudentIds([])
      message.success(result.added > 0 ? `已新增 ${result.added} 名考生` : '没有新增考生（可能已在名单中）')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const saveStaffMutation = useMutation({
    mutationFn: async (kind: 'proctors' | 'reviewers') => {
      const ids = kind === 'proctors' ? proctorIds : reviewerIds
      return kind === 'proctors' ? setProctors(examId ?? '', ids) : setReviewers(examId ?? '', ids)
    },
    onSuccess: (_data, kind) => {
      queryClient.invalidateQueries({ queryKey: ['exam', 'staff'] })
      message.success(kind === 'proctors' ? '监考安排已保存' : '阅卷安排已保存')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const editable = exam?.status === 'draft' || exam?.status === 'pending_publish'
  const doubleReview = exam?.rules?.review_mode === 'double'

  return (
    <Drawer
      open={Boolean(examId)}
      width={760}
      destroyOnHidden
      title={exam ? `考试详情 · ${exam.title}` : '考试详情'}
      onClose={onClose}
      extra={
        <Space>
          {exam && canReschedule && (
            <Button onClick={openReschedule}>调整时间</Button>
          )}
          {exam && (exam.status === 'draft' || exam.status === 'pending_publish') ? (
            <Button type="primary" loading={publishMutation.isPending} onClick={() => publishMutation.mutate(exam.id)}>
              发布考试
            </Button>
          ) : undefined}
        </Space>
      }
    >
      <QueryError error={examQuery.error} onRetry={() => examQuery.refetch()} />

      {exam && (
        <>
      {exam && isRetake && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="本场为补考场次"
          description={`补考成绩独立计算，与原考试分别发布；原考试考生名单与判卷方式已沿用。`}
        />
      )}

      {exam && retakeVisible && !isRetake && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="补考管理"
          description={
            <span>
              已不及格或缺考 {(retakeQuery.data ?? []).filter((item) => item.eligibility !== 'not_graded').length} 名考生可安排补考。
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setRetakeWindow([dayjs().add(1, 'day').hour(9).minute(0), dayjs().add(1, 'day').hour(11).minute(0)])
                  setRetakeOpen(true)
                }}
              >
                安排补考
              </Button>
            </span>
          }
        />
      )}

      <Descriptions
        size="small"
        column={2}
            className="exam-meta"
            items={[
              { key: 'status', label: '状态', children: <Tag color={statusOf(examStatusLabels, exam.status).color}>{statusOf(examStatusLabels, exam.status).label}</Tag> },
              { key: 'paper', label: '试卷', children: `${exam.paper_title}（${paperTypeLabel(exam.paper_type)}）` },
              { key: 'window', label: '时间窗', children: `${formatDateTime(exam.start_at)} ~ ${formatDateTime(exam.end_at)}` },
              { key: 'duration', label: '答题时长', children: `${exam.duration_minutes} 分钟` },
              {
                key: 'rules',
                label: '判卷方式',
                children: doubleReview ? `双评 + 仲裁（阈值 ${exam.rules?.review_threshold ?? '满分 20%'}）` : '单评',
              },
              {
                key: 'visibility',
                label: '成绩与匿名',
                children: `${exam.rules?.show_score === false ? '不显示成绩' : '显示成绩'} · ${exam.rules?.anonymous_review === false ? '实名阅卷' : '匿名阅卷'}`,
              },
              { key: 'candidates', label: '考生数', children: `${exam.candidate_count} 人` },
            ]}
          />

          <Tabs
            items={[
              {
                key: 'candidates',
                label: `考生名单（${exam.candidate_count}）`,
                children: (
                  <>
                    {editable ? (
                      <div className="staff-editor">
                        <Flex className="filter-bar" gap={12} wrap align="flex-end">
                          <Select
                            mode="multiple"
                            allowClear
                            placeholder="按班级添加"
                            style={{ minWidth: 240 }}
                            value={classIds}
                            onChange={setClassIds}
                            options={(classesQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
                          />
                          <Select
                            mode="multiple"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="单独添加考生"
                            style={{ minWidth: 240 }}
                            value={studentIds}
                            onChange={setStudentIds}
                            options={(studentPool.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.name}（${item.username}）` }))}
                          />
                          <Button
                            type="primary"
                            loading={addCandidatesMutation.isPending}
                            disabled={classIds.length === 0 && studentIds.length === 0}
                            onClick={() => addCandidatesMutation.mutate()}
                          >
                            添加
                          </Button>
                        </Flex>
                      </div>
                    ) : (
                      <Alert
                        className="page-alert"
                        type="info"
                        showIcon
                        message="考试已发布，考生名单锁定"
                        description="发布后不再变更编排，避免已下发快照与实际考生不一致。"
                      />
                    )}
                    <Table
                      rowKey="id"
                      size="small"
                      loading={candidatesQuery.isFetching}
                      columns={candidateColumns}
                      dataSource={candidatesQuery.data?.items ?? []}
                      pagination={{
                        current: candidatesQuery.data?.pagination.page ?? 1,
                        pageSize: 20,
                        total: candidatesQuery.data?.pagination.total ?? 0,
                        showSizeChanger: false,
                        onChange: (next) => setPage(next),
                      }}
                    />
                  </>
                ),
              },
              {
                key: 'proctors',
                label: '监考安排',
                children: (
                  <>
                    <Alert
                      className="page-alert"
                      type="info"
                      showIcon
                      message="留空表示本机构所有监考员都能进入该考场；配置名单后仅名单内监考员可查看实时事件。"
                    />
                    <div className="staff-editor">
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="选择监考员"
                        style={{ width: '100%' }}
                        value={proctorIds}
                        onChange={setProctorIds}
                        options={(proctorPool.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.name}（${roleLabel('proctor')}）` }))}
                      />
                      <Button
                        type="primary"
                        disabled={!exam}
                        loading={saveStaffMutation.isPending && saveStaffMutation.variables === 'proctors'}
                        onClick={() => saveStaffMutation.mutate('proctors')}
                      >
                        保存监考
                      </Button>
                    </div>
                    <Table
                      rowKey="user_id"
                      size="small"
                      loading={proctorsQuery.isFetching}
                      columns={[
                        { title: '姓名', dataIndex: 'name' },
                        { title: '用户名', dataIndex: 'username' },
                        { title: '角色', dataIndex: 'role', render: (value: string) => roleLabel(value) },
                        { title: '配置时间', dataIndex: 'assigned_at', render: (value: string) => formatDateTime(value) },
                      ]}
                      dataSource={proctorsQuery.data ?? []}
                      pagination={false}
                    />
                  </>
                ),
              },
              {
                key: 'reviewers',
                label: '阅卷安排',
                children: (
                  <>
                    <Alert
                      className="page-alert"
                      type={doubleReview && reviewerIds.length < 2 ? 'warning' : 'info'}
                      showIcon
                      message={
                        doubleReview
                          ? '双评模式：每位教师一评，系统自动指派不同的二评教师；配置少于 2 人时二评会落回公共认领池。'
                          : '未配置阅卷教师时，任务进入公共认领池；配置后按待评任务最少自动分配。'
                      }
                    />
                    <div className="staff-editor">
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="选择阅卷教师"
                        style={{ width: '100%' }}
                        value={reviewerIds}
                        onChange={setReviewerIds}
                        options={(reviewerPool.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
                      />
                      <Button
                        type="primary"
                        loading={saveStaffMutation.isPending && saveStaffMutation.variables === 'reviewers'}
                        onClick={() => saveStaffMutation.mutate('reviewers')}
                      >
                        保存阅卷
                      </Button>
                    </div>
                    <Table
                      rowKey="user_id"
                      size="small"
                      loading={reviewersQuery.isFetching}
                      columns={[
                        { title: '姓名', dataIndex: 'name' },
                        { title: '用户名', dataIndex: 'username' },
                        { title: '角色', dataIndex: 'role', render: (value: string) => roleLabel(value) },
                        { title: '配置时间', dataIndex: 'assigned_at', render: (value: string) => formatDateTime(value) },
                      ]}
                      dataSource={reviewersQuery.data ?? []}
                      pagination={false}
                    />
                  </>
                ),
              },
            ]}
          />
        </>
      )}

      <Modal
        open={rescheduleOpen}
        title="调整考试时间"
        okText="确认调整"
        cancelText="取消"
        confirmLoading={rescheduleMutation.isPending}
        onOk={submitReschedule}
        onCancel={() => setRescheduleOpen(false)}
      >        <Flex vertical gap={12}>
          <span style={{ fontSize: 13 }}>新的考试时间窗（考生会收到站内通知）</span>
          <DatePicker.RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            value={newWindow}
            onChange={(value) => setNewWindow(value as [Dayjs, Dayjs] | null)}
          />
          <Input.TextArea
            rows={2}
            maxLength={500}
            placeholder="调整原因（选填）：例如 机房冲突顺延 30 分钟"
            value={rescheduleReason}
            onChange={(event) => setRescheduleReason(event.target.value)}
          />
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
            已开考的场次只能顺延结束时间；全部考生会收到时间调整通知，动作写入审计。
          </span>
        </Flex>
      </Modal>
      <Modal
        open={retakeOpen}
        title="安排补考"
        width={640}
        okText="创建补考场次"
        cancelText="取消"
        confirmLoading={retakeCreateMutation.isPending}
        onOk={submitRetake}
        onCancel={() => setRetakeOpen(false)}
        destroyOnHidden
      >
        <Flex vertical gap={12}>
          <DatePicker.RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            value={retakeWindow}
            onChange={(value) => setRetakeWindow(value as [Dayjs, Dayjs] | null)}
          />
          <span style={{ fontSize: 13 }}>
            补考考生（不及格/缺考 {retakeChecked.length} / {(retakeQuery.data ?? []).filter((item) => item.eligibility !== 'not_graded').length} 人可选）
          </span>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--app-border)', borderRadius: 8, padding: '4px 12px' }}>
            {(retakeQuery.data ?? [])
              .filter((item) => item.eligibility !== 'not_graded')
              .map((item: RetakeCandidate) => (
                <label key={item.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={retakeChecked.includes(item.user_id)}
                    onChange={(event) =>
                      setRetakeChecked((current) =>
                        event.target.checked ? [...current, item.user_id] : current.filter((id) => id !== item.user_id),
                      )
                    }
                  />
                  <span>{item.name}</span>
                  <span className="cell-meta">@{item.username}</span>
                  <span className="cell-meta" style={{ marginLeft: 'auto' }}>
                    {item.eligibility === 'failed'
                      ? `未及格（${item.total?.toFixed(1) ?? '—'} / 及格线 ${item.pass_score.toFixed(1)}）`
                      : '缺考'}
                  </span>
                </label>
              ))}
            {(retakeQuery.data ?? []).filter((item) => item.eligibility !== 'not_graded').length === 0 && (
              <p style={{ color: 'var(--app-text-tertiary)', margin: '8px 0' }}>没有需要补考的考生</p>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
            创建后为草稿场次（试卷与判卷方式沿用原考试，rules 关联原考试），发布后考生正常入场。
          </span>
        </Flex>
      </Modal>
    </Drawer>
  )
}
