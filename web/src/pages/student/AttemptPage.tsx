import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Badge, Button, Card, Checkbox, Input, Modal, Radio, Result, Select, Space, Spin, Tag, Tooltip } from 'antd'
import { FlagOutlined, ExpandOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import MediaAnswer from '../../components/proctor/MediaAnswer'
import { isMobileClient, watermarkDataUrl } from '../../components/proctor/watermark'
import { getAttempt, reportEvent, saveAnswer, submitAttempt } from '../../api/student'
import { uploadMediaWithProgress } from '../../api/media'
import { queryKeys } from '../../api/queryKeys'
import { ApiError } from '../../api/client'
import { formatClock } from '../../utils/format'
import { questionTypeLabel } from '../../utils/labels'
import { errorText } from '../../utils/errors'
import { useAuthStore } from '../../stores/auth'
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
      return !content.media_id && !content.url
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
  const rules = state?.rules

  // ===== 标记待检查（C-05）：按答卷持久化在 localStorage =====
  const [flagSet, setFlagSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!attemptId) return
    try {
      const stored = window.localStorage.getItem(`attempt-flags-${attemptId}`)
      if (stored) setFlagSet(new Set(JSON.parse(stored) as string[]))
    } catch {
      /* ignore malformed flags */
    }
  }, [attemptId])

  function toggleFlag(questionId: string) {
    setFlagSet((current) => {
      const next = new Set(current)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      try {
        window.localStorage.setItem(`attempt-flags-${attemptId}`, JSON.stringify([...next]))
      } catch {
        /* storage full/unavailable: in-memory flags still work */
      }
      return next
    })
  }

  // ===== 考生端事件上报（切屏 / 断线 / 全屏退出）=====
  const reportEventRef = useRef(reportEvent)
  reportEventRef.current = reportEvent
  const switchCountRef = useRef(0)
  const offlineSinceRef = useRef<number | null>(null)
  const warnedScreenRef = useRef(false)
  const userName = useAuthStore((s) => s.user?.name ?? '')

  useEffect(() => {
    if (!live || !attemptId) return
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      switchCountRef.current += 1
      const count = switchCountRef.current
      void reportEventRef.current(attemptId, {
        type: 'screen_switch',
        level: 'warning',
        note: `第 ${count} 次离开作答页面`,
      }).catch(() => undefined)
      const limit = rules?.screen_switch_limit ?? 5
      if (count >= limit && !warnedScreenRef.current) {
        warnedScreenRef.current = true
        Modal.warning({
          title: '离开作答页面已被记录',
          content: `监考端已收到 ${count} 次切屏告警，请立即回到作答页面。切屏达到阈值可能被标记违规。`,
        })
      }
    }
    const onOffline = () => {
      offlineSinceRef.current = Date.now()
    }
    const onOnline = () => {
      if (offlineSinceRef.current) {
        const seconds = Math.round((Date.now() - offlineSinceRef.current) / 1000)
        if (seconds >= 15) {
          void reportEventRef.current(attemptId, {
            type: 'connection_lost',
            level: 'critical',
            note: `网络中断约 ${seconds} 秒后恢复`,
          }).catch(() => undefined)
        }
      }
      offlineSinceRef.current = null
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [live, attemptId, rules?.screen_switch_limit])

  // ===== 作答环境限制（M-02）：禁右键 / 复制 / 打印快捷键 =====
  useEffect(() => {
    if (!live) return
    const block = (event: Event) => event.preventDefault()
    const blockKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['p', 'c', 'x'].includes(event.key.toLowerCase())) {
        event.preventDefault()
      }
    }
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('keydown', blockKeys)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('keydown', blockKeys)
    }
  }, [live])

  // ===== 全屏监控（M-02）：退出全屏上报告警 =====
  const [fullscreenHint, setFullscreenHint] = useState(false)
  useEffect(() => {
    if (!live || !attemptId) return
    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        setFullscreenHint(false)
        return
      }
      setFullscreenHint(true)
      void reportEventRef.current(attemptId, {
        type: 'fullscreen_exit',
        level: 'warning',
        note: '退出了全屏作答环境',
      }).catch(() => undefined)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [live, attemptId])

  // ===== 定时抓拍（M-05）：rules.snapshot_interval > 0 且有摄像头时启用 =====
  useEffect(() => {
    const interval = rules?.snapshot_interval ?? 0
    if (!live || !attemptId || interval < 15) return
    let stream: MediaStream | null = null
    let canvas: HTMLCanvasElement | null = null
    let stopped = false
    let timer = 0

    async function startSnapshots() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
      } catch {
        return // no camera permission: snapshots stay off, exam continues
      }
      if (stopped) return
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play().catch(() => undefined)
      canvas = document.createElement('canvas')
      canvas.width = 480
      canvas.height = 360

      const shoot = async () => {
        if (stopped || !canvas || video.readyState < 2) return
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>((resolve) => canvas?.toBlob(resolve, 'image/jpeg', 0.6))
        if (!blob) return
        try {
          const file = new File([blob], `snapshot-${Date.now()}.jpg`, { type: 'image/jpeg' })
          const uploaded = await uploadMediaWithProgress(file, 'proctor_snapshot', () => undefined)
          await reportEventRef.current(attemptId, {
            type: 'camera_snapshot',
            level: 'info',
            snapshot_url: `/api/v1/media/${uploaded.id}/content`,
          })
        } catch {
          /* a failed snapshot never disturbs the exam */
        }
      }
      timer = window.setInterval(() => void shoot(), interval * 1000)
    }
    void startSnapshots()
    return () => {
      stopped = true
      window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [live, attemptId, rules?.snapshot_interval])

  // ===== 水印（M-03）=====
  const watermark = useMemo(
    () =>
      watermarkDataUrl([
        userName,
        state?.exam_title ?? '',
        new Date().toLocaleString('zh-CN', { hour12: false }),
      ]),
    [userName, state?.exam_title],
  )

  const mobileBlocked = Boolean(rules?.restrict_mobile) && isMobileClient()

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

  // 终端限制（C-12）：本场考试禁止移动端入场。
  if (mobileBlocked) {
    return (
      <div>
        <PageHeader title={state?.exam_title ?? '作答'} subtitle="本场考试仅允许电脑端作答。" />
        <Card className="panel-card" variant="borderless">
          <Result
            status="warning"
            title="请改用电脑浏览器入场"
            subTitle="本场考试开启了终端限制：移动端 / 手机浏览器无法进入作答。请在电脑上使用 Chrome 或 Edge 打开本页面。"
            extra={<Link to="/my/exams"><Button type="primary">返回我的考试</Button></Link>}
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
          <Result
            status="success"
            title={result.visible ? `本场得分 ${result.total ?? 0} 分` : '成绩将在发布后公布'}
            subTitle={
              result.pending > 0
                ? `还有 ${result.pending} 道主观题等待阅卷，最终成绩以阅卷结果为准。`
                : '客观题已自动判分，无需等待阅卷。'
            }
            extra={
              <Space>
                <Link to="/my/exams">
                  <Button type="primary">我的考试</Button>
                </Link>
                <Link to="/my/scores">
                  <Button>我的成绩</Button>
                </Link>
              </Space>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div
      onPaste={rules?.disable_paste ? (event) => event.preventDefault() : undefined}
      className="attempt-page-shell"
    >
      {/* 考生水印（M-03） */}
      <div className="attempt-watermark" style={{ backgroundImage: watermark }} aria-hidden="true" />

      <PageHeader
        title={state?.exam_title ?? '作答'}
        subtitle={`共 ${totalCount} 题 · 已作答 ${answeredCount} 题`}
        extra={
          <Space>
            <Tag className={remaining !== null && remaining < 300 ? 'countdown countdown-danger' : 'countdown'}>
              剩余 {formatClock(remaining ?? 0)}
            </Tag>
            {!document.fullscreenElement && (
              <Button
                icon={<ExpandOutlined />}
                onClick={() => document.documentElement.requestFullscreen().catch(() => undefined)}
              >
                全屏作答
              </Button>
            )}
            <Button type="primary" icon={<FlagOutlined />} onClick={() => setConfirmOpen(true)}>
              交卷
            </Button>
          </Space>
        }
      />

      {fullscreenHint && (
        <Alert
          className="page-alert"
          type="warning"
          showIcon
          message="你已退出全屏，监考端会收到提示"
          action={
            <Button size="small" type="primary" onClick={() => document.documentElement.requestFullscreen().catch(() => undefined)}>
              重新全屏
            </Button>
          }
        />
      )}

      <div className="attempt-layout">
        <Card className="panel-card" variant="borderless" title="题目导航" size="small">
          <div className="attempt-nav">
            {sections.map(([section, questions]) => (
              <div className="attempt-nav-group" key={section}>
                <div className="attempt-nav-title">{section}</div>
                <div className="attempt-nav-items">
                  {questions.map((question, index) => {
                    const answered = !isEmpty(question, answers[question.question_id] ?? {})
                    const active = question.question_id === currentId
                    const flagged = flagSet.has(question.question_id)
                    return (
                      <Badge
                        key={question.question_id}
                        count={index + 1}
                        overflowCount={999}
                        color={
                          active ? 'var(--app-primary)' : flagged ? '#F59E0B' : answered ? 'var(--app-success)' : '#E3E8EF'
                        }
                        style={
                          active
                            ? { color: '#fff', fontWeight: 600, boxShadow: '0 0 0 2px #fff' }
                            : flagged || answered
                              ? { color: '#fff', fontWeight: 600, boxShadow: '0 0 0 2px #fff' }
                              : { color: 'var(--app-text-secondary)', fontWeight: 500, boxShadow: '0 0 0 2px #fff' }
                        }
                        offset={[0, 0]}
                      >
                        <Tooltip title={flagged ? '已标记待检查' : answered ? '已作答' : '未作答'}>
                          <button
                            type="button"
                            className={active ? 'attempt-nav-slot attempt-nav-slot-active' : 'attempt-nav-slot'}
                            aria-label={`第 ${index + 1} 题${flagged ? '，已标记待检查' : ''}`}
                            aria-current={active}
                            onClick={() => setCurrentId(question.question_id)}
                          />
                        </Tooltip>
                      </Badge>
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
                <Button
                  type="text"
                  size="small"
                  className="attempt-flag-button"
                  icon={flagSet.has(current.question_id) ? <PushpinFilled style={{ color: '#D98A26' }} /> : <PushpinOutlined />}
                  onClick={() => toggleFlag(current.question_id)}
                >
                  {flagSet.has(current.question_id) ? '已标记待检查' : '标记待检查'}
                </Button>
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
                <MediaAnswer
                  mode={current.content.mode === 'video' ? 'video' : 'audio'}
                  prepareSeconds={current.content.prepare_seconds ?? 3}
                  minSeconds={current.content.min_seconds ?? 5}
                  maxSeconds={current.content.max_seconds ?? 180}
                  retakeLimit={current.content.retake_limit ?? 1}
                  value={answers[current.question_id] as { media_id?: string; duration_ms?: number }}
                  onChange={(value) => updateAnswer(current.question_id, value)}
                />
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
