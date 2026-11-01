import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Descriptions, Drawer, Flex, Select, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import QueryError from '../../components/QueryError'
import {
  addCandidates,
  getExam,
  listCandidates,
  listProctors,
  listReviewers,
  publishExam,
  setProctors,
  setReviewers,
} from '../../api/exam'
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
        exam && (exam.status === 'draft' || exam.status === 'pending_publish') ? (
          <Button type="primary" loading={publishMutation.isPending} onClick={() => publishMutation.mutate(exam.id)}>
            发布考试
          </Button>
        ) : undefined
      }
    >
      <QueryError error={examQuery.error} onRetry={() => examQuery.refetch()} />

      {exam && (
        <>
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
    </Drawer>
  )
}
