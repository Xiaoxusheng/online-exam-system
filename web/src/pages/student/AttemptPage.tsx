import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Checkbox, Input, Modal, Radio, Select, Space, Spin, Tag } from 'antd'
import { CheckCircleOutlined, FlagOutlined } from '@ant-design/icons'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { getAttempt, saveAnswer, submitAttempt } from '../../api/student'
import { queryKeys } from '../../api/queryKeys'
import { ApiError } from '../../api/client'
import { formatClock } from '../../utils/format'
import { questionTypeLabel } from '../../utils/labels'
import { errorText } from '../../utils/errors'
import type { AttemptQuestion } from '../../types'

type AnswerContent = Record<string, unknown>

function blankCount(question: AttemptQuestion): number {
  const stem = typeof question.content?.stem === 'string' ? question.content.stem : ''
  const matches = stem.match(/_{2,}/g)
  return Math.max(1, matches?.length ?? 1)
}

function toContent(question: AttemptQuestion, saved: AnswerContent): AnswerContent {
  // Normalise the stored payload into the shape each control edits.
  if (question.type === 'fill') {
    const values = Array.isArray(saved.values) ? (saved.values as string[]) : []
    const count = blankCount(question)
    return { values: Array.from({ length: count }, (_v, index) => values[index] ?? '') }
  }
  return saved
}

function isEmpty(question: AttemptQuestion, content: AnswerContent): boolean {
  switch (question.type) {
    case 'single':
    case 'judge':
      return !content.value
    case 'multiple':
      return !Array.isArray(content.values) || (content.values as string[]).length === 0
    case 'fill':
      return !Array.isArray(content.values) || (content.values as string[]).every((value) => !value.trim())
    case 'programming':
      return !content.code
    case 'media':
      return !content.url
    default:
      return !content.text
  }
}

export default function AttemptPage() {
  const { attemptId = '' } = useParams()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const attemptQuery = useQuery({
    queryKey: queryKeys.attempt(attemptId),
    queryFn: () => getAttempt(attemptId),
  })

  const [answers, setAnswers] = useState<Record<string, AnswerContent>>({})
  const [versions, setVersions] = useState<Record<string, number>>({})
  const [currentId, setCurrentId] = useState<string>('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [result, setResult] = useState<{ total: number | null; visible: boolean; pending: number; at: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const answersRef = useRef(answers)
  answersRef.current = answers
  const versionsRef = useRef(versions)
  versionsRef.current = versions
  const timersRef = useRef<Record<string, number>>({})
  const savingRef = useRef<Record<string, boolean>>({})

  const state = attemptQuery.data
  const live = state?.status === 'in_progress'

  useEffect(() => {
    if (!state) return
    const next: Record<string, AnswerContent> = {}
    const nextVersions: Record<string, number> = {}
    for (const question of state.questions) {
      next[question.question_id] = toContent(question, question.saved_answer ?? {})
      nextVersions[question.question_id] = question.answer_version
    }
    setAnswers(next)
    setVersions(nextVersions)
    setCurrentId((current) => current || state.questions[0]?.question_id || '')
    setRemaining(state.remaining_seconds)
  }, [state])

  const saveQuestion = useCallback(
    async (questionId: string) => {
      if (savingRef.current[questionId]) return
      savingRef.current[questionId] = true
      try {
        const content = answersRef.current[questionId]
        const version = versionsRef.current[questionId] ?? 0
        const saved = await saveAnswer(attemptId, questionId, content, version)
        setVersions((current) => ({ ...current, [questionId]: saved.version }))
      } catch (error) {
        if (error instanceof ApiError && error.code === 'CONFLICT') {
          message.warning('答案版本冲突，已为你载入最新保存的内容')
          await queryClient.invalidateQueries({ queryKey: queryKeys.attempt(attemptId) })
        } else if (error instanceof ApiError && (error.code === 'EXAM_EXPIRED' || error.code === 'INVALID_STATE')) {
          message.error(errorText(error))
        } else {
          message.error(`保存失败：${errorText(error)}`)
        }
      } finally {
        savingRef.current[questionId] = false
      }
    },
    [attemptId, message, queryClient],
  )

  function scheduleSave(questionId: string) {
    const existing = timersRef.current[questionId]
    if (existing) window.clearTimeout(existing)
    timersRef.current[questionId] = window.setTimeout(() => {
      void saveQuestion(questionId)
    }, 900)
  }

  function updateAnswer(questionId: string, patch: AnswerContent) {
    setAnswers((current) => ({ ...current, [questionId]: { ...current[questionId], ...patch } }))
    scheduleSave(questionId)
  }

  // Flush pending saves when leaving the page.
  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  const submitMutation = useMutation({
    mutationFn: () => submitAttempt(attemptId),
    onSuccess: (data) => {
      setResult({ total: data.total_score, visible: data.score_visible, pending: data.pending_review, at: data.submitted_at })
      setConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.myExams })
      queryClient.invalidateQueries({ queryKey: queryKeys.myScores })
    },
    onError: (error) => {
      setConfirmOpen(false)
      message.error(errorText(error))
    },
  })

  // Countdown; hitting zero submits automatically, exactly like the server sweep would.
  useEffect(() => {
    if (!live || remaining === null) return
    if (remaining <= 0) {
      message.warning('答题时间到，系统已自动交卷')
      submitMutation.mutate()
      return
    }
    const timer = window.setTimeout(() => setRemaining((value) => (value === null ? null : value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining, live])

  const sections = useMemo(() => {
    const groups = new Map<string, AttemptQuestion[]>()
    for (const question of state?.questions ?? []) {
      const key = question.section || '试题'
      groups.set(key, [...(groups.get(key) ?? []), question])
    }
    return [...groups.entries()]
  }, [state])
  const allQuestions = useMemo(() => sections.flatMap(([, questions]) => questions), [sections])
  const currentIndex = allQuestions.findIndex((question) => question.question_id === currentId)

  const current = (state?.questions ?? []).find((question) => question.question_id === currentId)
  const answeredCount = (state?.questions ?? []).filter((question) => !isEmpty(question, answers[question.question_id] ?? {})).length
  const totalCount = state?.questions.length ?? 0

  if (attemptQuery.isPending) {
    return (
      <Card className="panel-card" variant="borderless">
        <div className="notice-loading">
          <Spin />
        </div>
      </Card>
    )
  }

  if (attemptQuery.isError) {
    return (
      <div>
        <PageHeader title="答卷" subtitle="答卷不存在或无权查看。" />
        <QueryError error={attemptQuery.error} onRetry={() => attemptQuery.refetch()} />
      </div>
    )
  }

  if (!live && !result) {
    return (
      <div>
        <PageHeader title={state?.exam_title ?? '答卷'} subtitle="本场考试已结束作答。" />
        <Card className="panel-card" variant="borderless">
          <Alert
            type="info"
            showIcon
            message={state?.status === 'submitted' || state?.status === 'graded' ? '答卷已提交，等待阅卷' : '答卷已发布'}
            description={
              state?.score != null
                ? `你的成绩为 ${state.score} 分。`
                : '成绩公布后可在"我的成绩"查看逐题得分。'
            }
            action={<Link to="/my/scores">查看我的成绩</Link>}
          />
        </Card>
      </div>
    )
  }

  if (result) {
    return (
      <div>
        <PageHeader title={state?.exam_title ?? '交卷成功'} subtitle="答卷已提交，感谢作答。" />
        <Card className="panel-card" variant="borderless">
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message={result.visible ? `本场得分 ${result.total ?? 0} 分` : '成绩将在发布后公布'}
            description={
              result.pending > 0
                ? `还有 ${result.pending} 道主观题等待阅卷，最终成绩以阅卷结果为准。`
                : '客观题已自动判分，无需等待阅卷。'
            }
            action={
              <Space>
                <Link to="/my/exams">我的考试</Link>
                <Link to="/my/scores">我的成绩</Link>
              </Space>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={state?.exam_title ?? '作答'}
        subtitle={`共 ${totalCount} 题 · 已作答 ${answeredCount} 题`}
        extra={
          <Space>
            <Tag className={remaining !== null && remaining < 300 ? 'countdown countdown-danger' : 'countdown'}>
              剩余 {formatClock(remaining ?? 0)}
            </Tag>
            <Button type="primary" icon={<FlagOutlined />} onClick={() => setConfirmOpen(true)}>
              交卷
            </Button>
          </Space>
        }
      />

      <div className="attempt-layout">
        <Card className="panel-card" variant="borderless" title="题目导航" size="small">
          <div className="attempt-nav">
            {sections.map(([section, questions]) => (
              <div className="attempt-nav-group" key={section}>
                <div className="attempt-nav-title">{section}</div>
                <div className="attempt-nav-items">
                  {questions.map((question, index) => {
                    const answered = !isEmpty(question, answers[question.question_id] ?? {})
                    return (
                      <button
                        type="button"
                        key={question.question_id}
                        className={
                          question.question_id === currentId
                            ? 'attempt-nav-item attempt-nav-active'
                            : answered
                              ? 'attempt-nav-item attempt-nav-done'
                              : 'attempt-nav-item'
                        }
                        onClick={() => setCurrentId(question.question_id)}
                      >
                        {index + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="panel-card" variant="borderless" size="small">
          {current && (
            <div className="attempt-question">
              <div className="question-view-head">
                <Tag className="soft-tag">{questionTypeLabel(current.type)}</Tag>
                <span className="cell-meta">本题 {current.score} 分</span>
                <span className="cell-meta">{current.section}</span>
              </div>
              <p className="question-stem">{current.content?.stem}</p>

              {(current.type === 'single' || current.type === 'judge') && (
                <Radio.Group
                  value={answers[current.question_id]?.value as string | undefined}
                  onChange={(event) => updateAnswer(current.question_id, { value: event.target.value })}
                >
                  <Space direction="vertical">
                    {current.type === 'judge'
                      ? [
                          { key: 'true', text: '正确' },
                          { key: 'false', text: '错误' },
                        ].map((option) => (
                          <Radio key={option.key} value={option.key}>
                            {option.text}
                          </Radio>
                        ))
                      : (current.content.options ?? []).map((option) => (
                          <Radio key={option.key} value={option.key}>
                            {option.key}. {option.text}
                          </Radio>
                        ))}
                  </Space>
                </Radio.Group>
              )}

              {current.type === 'multiple' && (
                <Checkbox.Group
                  value={(answers[current.question_id]?.values as string[]) ?? []}
                  onChange={(values) => updateAnswer(current.question_id, { values })}
                >
                  <Space direction="vertical">
                    {(current.content.options ?? []).map((option) => (
                      <Checkbox key={option.key} value={option.key}>
                        {option.key}. {option.text}
                      </Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              )}

              {current.type === 'fill' && (
                <div className="fill-inputs">
                  {Array.from({ length: blankCount(current) }, (_value, index) => (
                    <Input
                      key={index}
                      placeholder={`第 ${index + 1} 空`}
                      value={((answers[current.question_id]?.values as string[]) ?? [])[index] ?? ''}
                      onChange={(event) => {
                        const values = [...(((answers[current.question_id]?.values as string[]) ?? []))]
                        values[index] = event.target.value
                        updateAnswer(current.question_id, { values })
                      }}
                    />
                  ))}
                </div>
              )}

              {(current.type === 'short' || current.type === 'essay') && (
                <Input.TextArea
                  rows={6}
                  maxLength={5000}
                  showCount
                  placeholder="请输入你的作答"
                  value={(answers[current.question_id]?.text as string) ?? ''}
                  onChange={(event) => updateAnswer(current.question_id, { text: event.target.value })}
                />
              )}

              {current.type === 'programming' && (
                <div className="programming-inputs">
                  <Select
                    style={{ width: 160 }}
                    value={(answers[current.question_id]?.language as string) ?? current.content.languages?.[0]}
                    options={(current.content.languages ?? []).map((language) => ({ value: language, label: language }))}
                    onChange={(value) => updateAnswer(current.question_id, { language: value })}
                  />
                  <Input.TextArea
                    rows={12}
                    placeholder="在此粘贴或编写代码"
                    value={(answers[current.question_id]?.code as string) ?? ''}
                    onChange={(event) => updateAnswer(current.question_id, { code: event.target.value })}
                    className="answer-code-input"
                  />
                </div>
              )}

              {current.type === 'media' && (
                <>
                  <Alert
                    className="page-alert"
                    type="info"
                    showIcon
                    message="音视频上传通道尚未开放"
                    description="当前阶段请将作答链接粘贴在下方，或按监考要求线下提交。"
                  />
                  <Input
                    placeholder="作答链接（URL）"
                    value={(answers[current.question_id]?.url as string) ?? ''}
                    onChange={(event) => updateAnswer(current.question_id, { url: event.target.value })}
                  />
                </>
              )}

              <div className="attempt-footer">
                <span className="cell-meta">答案自动保存</span>
                <Space>
                  <Button disabled={currentIndex <= 0} onClick={() => setCurrentId(allQuestions[currentIndex - 1].question_id)}>
                    上一题
                  </Button>
                  <Button
                    type="primary"
                    disabled={currentIndex < 0 || currentIndex >= allQuestions.length - 1}
                    onClick={() => setCurrentId(allQuestions[currentIndex + 1].question_id)}
                  >
                    下一题
                  </Button>
                </Space>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={confirmOpen}
        title="确认交卷？"
        okText="确认交卷"
        cancelText="继续作答"
        confirmLoading={submitMutation.isPending}
        onOk={() => submitMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>
          已作答 <strong>{answeredCount}</strong> / {totalCount} 题
          {answeredCount < totalCount ? `，还有 ${totalCount - answeredCount} 题未作答。` : '。'}
        </p>
        <p className="cell-meta">交卷后客观题立即判分，主观题进入阅卷流程；交卷不可撤销。</p>
      </Modal>
    </div>
  )
}
