import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Input, InputNumber, Spin, Tag, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  BookOutlined,
  CheckOutlined,
  EyeInvisibleOutlined,
  FileDoneOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { getReviewQueue, getReviewTask, listReviewTasks, submitReview } from '../../api/review'
import { queryKeys } from '../../api/queryKeys'
import type { ReviewTask, ReviewSubmitResult } from '../../types'
import { CandidateAnswer, QuestionContent, ReferenceAnswer } from '../../components/QuestionView'
import { formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import { questionTypeLabel } from '../../utils/labels'
import QueryError from '../../components/QueryError'
import './workbench.css'

const roundNames: Record<number, string> = { 1: '一评', 2: '二评', 3: '仲裁' }

const commentTemplates = [
  '要点完整，推理清晰。',
  '思路正确，计算有失误。',
  '步骤规范，结论准确。',
  '方法得当，表达可更简洁。',
  '未答到关键要点。',
  '书写潦草，建议规范作答。',
]

export default function ReviewWorkbench() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') === 'submitted' ? 'submitted' : 'pending'
  const taskId = params.get('task')

  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [result, setResult] = useState<ReviewSubmitResult | null>(null)
  const [showReference, setShowReference] = useState(true)

  // 任务队列（左栏）：按当前状态过滤
  const queueListQuery = useQuery({
    queryKey: queryKeys.reviewTasks({ status }),
    queryFn: () => listReviewTasks({ status, page: 1, page_size: 100 }),
  })
  const tasks: ReviewTask[] = queueListQuery.data?.items ?? []

  // 无指定任务时自动取队列第一份
  useEffect(() => {
    if (!taskId && tasks.length > 0) {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('task', tasks[0].id)
        return next
      }, { replace: true })
    }
  }, [taskId, tasks, setParams])

  const detailQuery = useQuery({
    queryKey: queryKeys.reviewTask(taskId ?? ''),
    queryFn: () => getReviewTask(taskId ?? ''),
    enabled: Boolean(taskId),
  })
  const detail = detailQuery.data

  const queueQuery = useQuery({
    queryKey: queryKeys.reviewQueue(taskId ?? '', { status }),
    queryFn: () => getReviewQueue(taskId ?? '', { status }),
    enabled: Boolean(taskId),
    staleTime: 15_000,
  })
  const queue = queueQuery.data
  const queueRef = useRef(queue)
  queueRef.current = queue

  const mutation = useMutation({
    mutationFn: (values: { score: number; comment: string }) => submitReview(taskId ?? '', values.score, values.comment),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['review'] })
      queryClient.invalidateQueries({ queryKey: ['score'] })
      queryClient.invalidateQueries({ queryKey: ['notification'] })
      // 连续批阅：提交成功后自动进入队列中的下一份（短暂展示结果）
      const next = queueRef.current?.next_id
      if (next && status === 'pending') {
        setTimeout(() => goTo(next), 800)
      }
    },
  })

  function goTo(nextTaskId: string) {
    setScore(null)
    setComment('')
    setResult(null)
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('task', nextTaskId)
      return next
    })
  }

  function submit() {
    if (score === null || mutation.isPending || !detail || detail.status === 'submitted') return
    mutation.mutate({ score, comment: comment.trim() })
  }

  // 键盘快捷键：数字给分 / Enter 提交 / ←→ 切换 / Esc 返回
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
      if (!detail || detail.status === 'submitted' || result) return
      if (/^[0-9]$/.test(event.key)) {
        const value = Number(event.key)
        const max = detail.question.score ?? 0
        if (value <= max) setScore(value)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        submit()
        return
      }
      if (event.key === 'ArrowLeft' && queue?.prev_id) goTo(queue.prev_id)
      if (event.key === 'ArrowRight' && queue?.next_id) goTo(queue.next_id)
      if (event.key === 'Escape') navigate('/review')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const maxScore = detail?.question.score ?? 0
  const tiers = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(maxScore * ratio * 100) / 100)
  const position = queue ? `${queue.position} / ${queue.total}` : '—'

  return (
    <div className="wb-shell">
      {/* 顶栏 */}
      <div className="wb-topbar">
        <div className="wb-topbar-left">
          <Button className="wb-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/review')}>
            退出批阅
          </Button>
          <span className="wb-divider" />
          <div className="wb-title">
            <span className="wb-title-main">{detail?.exam_title ?? '阅卷工作台'}</span>
            <span className="wb-title-sub">
              {detail && (
                <>
                  {roundNames[detail.round] ?? `第 ${detail.round} 轮`}
                  {detail.review_mode === 'double' && <Tag className="soft-tag">双评 {formatScore(detail.review_threshold, 1)} 分差</Tag>}
                  {detail.needs_arbitrate && <Tag color="red">仲裁轮</Tag>}
                  {detail.anonymous && (
                    <Tag className="soft-tag" icon={<EyeInvisibleOutlined />}>匿名</Tag>
                  )}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="wb-topbar-right">
          <div className="wb-progress">
            <span className="wb-progress-label">本队列</span>
            <div className="wb-progress-track">
              <div
                className="wb-progress-fill"
                style={{ width: queue && queue.total > 0 ? `${(queue.position / queue.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <span className="wb-divider" />
          <div className="review-nav wb-nav">
            <Button size="small" disabled={!queue?.prev_id} onClick={() => queue?.prev_id && goTo(queue.prev_id)}>
              ← 上一份
            </Button>
            <span className="review-nav-position wb-nav-position">{position}</span>
            <Button size="small" type="primary" ghost disabled={!queue?.next_id} onClick={() => queue?.next_id && goTo(queue.next_id)}>
              下一份 →
            </Button>
          </div>
        </div>
      </div>

      <div className="wb-body">
        {/* 左栏：任务队列 */}
        <aside className="wb-queue">
          <div className="wb-queue-tabs">
            <button
              type="button"
              className={status === 'pending' ? 'wb-queue-tab wb-queue-tab-active' : 'wb-queue-tab'}
              onClick={() => { setParams({ status: 'pending' }) }}
            >
              待批阅
            </button>
            <button
              type="button"
              className={status === 'submitted' ? 'wb-queue-tab wb-queue-tab-active' : 'wb-queue-tab'}
              onClick={() => { setParams({ status: 'submitted' }) }}
            >
              已完成
            </button>
          </div>

          <div className="wb-queue-list">
            {queueListQuery.isPending && <div className="wb-center"><Spin /></div>}
            <QueryError error={queueListQuery.error} onRetry={() => queueListQuery.refetch()} />
            {!queueListQuery.isPending && tasks.length === 0 && (
              <Empty
                className="wb-queue-empty"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={status === 'pending' ? '队列已清空' : '暂无已完成'}
              />
            )}
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={task.id === taskId ? 'wb-task wb-task-active' : 'wb-task'}
                onClick={() => goTo(task.id)}
              >
                <div className="wb-task-top">
                  <span className="wb-task-name">
                    <UserOutlined className="wb-task-user-icon" />
                    {task.user_name || '匿名考生'}
                  </span>
                  <span className={`wb-task-dot wb-task-dot-${task.status}`} />
                </div>
                <div className="wb-task-meta">
                  <span className="wb-task-type">{questionTypeLabel(task.question_type)}</span>
                  <Tag className={`soft-tag wb-task-round`}>{roundNames[task.round] ?? task.round}</Tag>
                  <span className="wb-task-score">
                    {task.score === null ? <span className="wb-task-pending">待评</span> : `${formatScore(task.score, 1)} 分`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* 中栏：答卷主区 */}
        <main className="wb-main">
          {detailQuery.isPending && <div className="wb-center wb-center-tall"><Spin /></div>}
          <QueryError error={detailQuery.error} onRetry={() => detailQuery.refetch()} />

          {!detailQuery.isPending && !detail && !detailQuery.error && (
            <div className="wb-center wb-center-tall">
              <Empty description="从左侧队列选择一份答卷开始批阅" />
            </div>
          )}

          {detail && (
            <div className="wb-paper" key={detail.id}>
              {/* 题目卡 */}
              <section className="wb-card">
                <header className="wb-card-head">
                  <span className="wb-card-badge"><BookOutlined /></span>
                  <span className="wb-card-title">题目</span>
                  <span className="wb-card-meta">
                    {questionTypeLabel(detail.question.type)} · 满分 {formatScore(maxScore, 1)} 分
                    {detail.question.section ? ` · ${detail.question.section}` : ''}
                  </span>
                </header>
                <div className="wb-card-body wb-question">
                  <QuestionContent type={detail.question.type} content={detail.question.content} section={detail.question.section} />
                </div>
              </section>

              {/* 考生作答卡 */}
              <section className="wb-card wb-card-answer">
                <header className="wb-card-head">
                  <span className="wb-card-badge wb-card-badge-answer"><UserOutlined /></span>
                  <span className="wb-card-title">考生作答</span>
                  <span className="wb-card-meta">
                    {detail.anonymous ? (
                      <span className="wb-anon"><EyeInvisibleOutlined /> 匿名评阅 · {detail.candidate_name || '考生姓名已隐藏'}</span>
                    ) : (
                      detail.candidate_name
                    )}
                  </span>
                </header>
                <div className="wb-card-body wb-answer">
                  <CandidateAnswer type={detail.question.type} answer={detail.answer} />
                </div>
              </section>

              {/* 参考答案卡（可折叠） */}
              <section className="wb-card">
                <header
                  className="wb-card-head wb-card-head-click"
                  onClick={() => setShowReference((v) => !v)}
                >
                  <span className="wb-card-badge wb-card-badge-ref"><CheckOutlined /></span>
                  <span className="wb-card-title">参考答案与评分要点</span>
                  <span className="wb-card-meta wb-fold">{showReference ? '收起 ▲' : '展开 ▼'}</span>
                </header>
                {showReference && (
                  <div className="wb-card-body wb-reference">
                    <ReferenceAnswer answer={detail.question.answer as unknown as Record<string, unknown>} />
                  </div>
                )}
              </section>

              {/* 轮次卡 */}
              {detail.rounds.length > 0 && (
                <section className="wb-card">
                  <header className="wb-card-head">
                    <span className="wb-card-badge wb-card-badge-round"><FileDoneOutlined /></span>
                    <span className="wb-card-title">评阅轮次</span>
                    <span className="wb-card-meta">共 {detail.rounds.length} 轮</span>
                  </header>
                  <div className="wb-card-body wb-rounds">
                    {detail.rounds.map((round) => (
                      <div key={round.task_id} className={round.task_id === detail.id ? 'wb-round wb-round-current' : 'wb-round'}>
                        <Tag className="soft-tag">{roundNames[round.round] ?? `第 ${round.round} 轮`}</Tag>
                        <span className="wb-round-score">{round.score === null ? '待评' : `${formatScore(round.score, 1)} 分`}</span>
                        <span className="wb-round-meta">
                          {round.reviewer_name || '待认领'} · {round.status === 'submitted' ? '已提交' : round.status === 'in_progress' ? '阅卷中' : '待阅'}
                        </span>
                        {round.comment && <div className="wb-round-comment">“{round.comment}”</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>

        {/* 右栏：评分面板 */}
        <aside className="wb-panel">
          {detail && detail.status === 'submitted' && !result && (
            <div className="wb-panel-inner">
              <Alert type="success" showIcon message={`本轮评分已完成：${formatScore(detail.score ?? 0, 1)} 分`} description="已提交的轮次不可修改；如需调整请通过成绩更正流程处理。" />
              <Button block className="wb-submit" disabled={!queue?.next_id} onClick={() => queue?.next_id && goTo(queue.next_id)}>
                下一份 →
              </Button>
            </div>
          )}

          {detail && result && (
            <div className="wb-panel-inner">
              <Alert
                type="success"
                showIcon
                message={
                  result.finalized
                    ? `最终得分 ${formatScore(result.final_score ?? 0, 2)} 分`
                    : result.arbitration
                      ? '分差超过阈值，已生成三评仲裁'
                      : '本轮已记录，等待第二位教师评分'
                }
                description={`该答卷仍有 ${result.pending_review} 题待阅卷；当前总分 ${formatScore(result.attempt_total, 2)} 分。`}
              />
              {queue?.next_id ? (
                <Button block type="primary" className="wb-submit" onClick={() => goTo(queue.next_id)}>
                  继续批阅下一份 →
                </Button>
              ) : (
                <Button block className="wb-submit" onClick={() => navigate('/review')}>
                  队列已清空，返回列表
                </Button>
              )}
            </div>
          )}

          {detail && detail.status !== 'submitted' && !result && (
            <div className="wb-panel-inner">
              {detail.needs_arbitrate && (
                <Alert
                  className="wb-panel-alert"
                  type="warning"
                  showIcon
                  message="仲裁轮：两评分差超过阈值"
                  description={`你的分数将直接作为最终得分。前两轮：${detail.rounds
                    .filter((r) => r.score !== null)
                    .map((r) => `${roundNames[r.round] ?? r.round} ${r.score} 分`)
                    .join('，')}`}
                />
              )}
              {detail.review_mode === 'double' && detail.round === 1 && (
                <Alert
                  className="wb-panel-alert"
                  type="info"
                  showIcon
                  message="双评模式"
                  description={`你的评分不直接生效：两位教师分差 ≤ ${formatScore(detail.review_threshold, 1)} 分取平均，超过则仲裁。`}
                />
              )}

              <div className="wb-score-label">本题得分</div>
              <div className="wb-score-row">
                <InputNumber
                  className="wb-score-input"
                  min={0}
                  max={maxScore}
                  step={0.5}
                  value={score ?? undefined}
                  placeholder={`0 - ${maxScore}`}
                  autoFocus
                  onChange={(value) => setScore(value === null ? null : Number(value))}
                />
                <span className="wb-score-max">/ {formatScore(maxScore, 1)}</span>
              </div>

              <div className="wb-tiers">
                {tiers.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={score === value ? 'wb-tier wb-tier-active' : 'wb-tier'}
                    onClick={() => setScore(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <div className="wb-comment-label">评语（选填）</div>
              <div className="wb-templates">
                {commentTemplates.map((tpl) => (
                  <Tooltip key={tpl} title="点击填入评语">
                    <button
                      type="button"
                      className="wb-template"
                      onClick={() => setComment(tpl)}
                    >
                      {tpl}
                    </button>
                  </Tooltip>
                ))}
              </div>
              <Input.TextArea
                className="wb-comment"
                rows={4}
                maxLength={2000}
                showCount
                placeholder="写下评语，会展示给后续评阅教师与成绩明细"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />

              {mutation.isError && (
                <Alert className="wb-panel-alert" type="error" showIcon message="提交失败" description={errorText(mutation.error)} />
              )}

              <Button
                block
                type="primary"
                size="large"
                className="wb-submit"
                icon={<CheckOutlined />}
                disabled={score === null || detailQuery.isPending}
                loading={mutation.isPending}
                onClick={submit}
              >
                提交并下一份
              </Button>
              <div className="wb-shortcut">
                <span><kbd>0-9</kbd> 快速给分</span>
                <span><kbd>Enter</kbd> 提交</span>
                <span><kbd>←</kbd><kbd>→</kbd> 切换</span>
                <span><kbd>Esc</kbd> 退出</span>
              </div>
            </div>
          )}

          {!detail && (
            <div className="wb-panel-inner">
              <div className="wb-panel-placeholder">
                <FileDoneOutlined />
                <p>选择答卷后在此评分</p>
                <span>支持键盘快捷操作，连续批阅更快</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
