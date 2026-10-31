import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Descriptions, Drawer, Input, InputNumber, Space, Spin, Tag } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { ReviewSubmitResult } from '../../types'
import QueryError from '../../components/QueryError'
import { CandidateAnswer, QuestionContent, ReferenceAnswer } from '../../components/QuestionView'
import { getReviewQueue, getReviewTask, submitReview } from '../../api/review'
import { queryKeys } from '../../api/queryKeys'
import { formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import { questionTypeLabel } from '../../utils/labels'

const roundNames: Record<number, string> = { 1: '一评', 2: '二评', 3: '仲裁' }

interface Props {
  taskId: string | null
  /** Same status filter as the surrounding list so 上一份/下一份 follows what the reviewer sees. */
  status: string
  onClose: () => void
  onNavigate: (taskId: string) => void
}

export default function ReviewDrawer({ taskId, status, onClose, onNavigate }: Props) {
  const queryClient = useQueryClient()
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [result, setResult] = useState<ReviewSubmitResult | null>(null)

  const detailQuery = useQuery({
    queryKey: queryKeys.reviewTask(taskId ?? ''),
    queryFn: () => getReviewTask(taskId ?? ''),
    enabled: Boolean(taskId),
  })

  const queueQuery = useQuery({
    queryKey: queryKeys.reviewQueue(taskId ?? '', { status }),
    queryFn: () => getReviewQueue(taskId ?? '', { status }),
    enabled: Boolean(taskId),
    staleTime: 30_000,
  })
  const queue = queueQuery.data

  const mutation = useMutation({
    mutationFn: (values: { score: number; comment: string }) => submitReview(taskId ?? '', values.score, values.comment),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['review'] })
      queryClient.invalidateQueries({ queryKey: ['score'] })
      queryClient.invalidateQueries({ queryKey: ['notification'] })
    },
  })

  function reset() {
    setScore(null)
    setComment('')
    setResult(null)
  }

  function goTo(nextTaskId: string) {
    reset()
    onNavigate(nextTaskId)
  }

  const detail = detailQuery.data
  const maxScore = detail?.question?.score ?? 0
  const quickScores = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxScore * ratio * 100) / 100)

  return (
    <Drawer
      open={Boolean(taskId)}
      width={720}
      destroyOnHidden
      title={detail ? `阅卷 · ${roundNames[detail.round] ?? `第 ${detail.round} 轮`}` : '阅卷'}
      onClose={() => {
        reset()
        onClose()
      }}
      footer={
        <div className="review-nav">
          <Button icon={<LeftOutlined />} disabled={!queue?.prev_id} onClick={() => queue?.prev_id && goTo(queue.prev_id)}>
            上一份
          </Button>
          <span className="review-nav-position">
            {queue && queue.total > 0 ? `第 ${queue.position} / ${queue.total} 份${status === 'pending' ? '（待办队列）' : ''}` : '队列位置未知'}
          </span>
          <Button disabled={!queue?.next_id} onClick={() => queue?.next_id && goTo(queue.next_id)}>
            下一份
            <RightOutlined />
          </Button>
        </div>
      }
      extra={
        result ? (
          <Button onClick={() => { reset(); onClose() }}>完成</Button>
        ) : (
          <Space>
            <Button onClick={() => { reset(); onClose() }}>稍后再说</Button>
            <Button
              type="primary"
              disabled={score === null || detailQuery.isPending || detail?.status === 'submitted'}
              loading={mutation.isPending}
              onClick={() => {
                if (score !== null) mutation.mutate({ score, comment: comment.trim() })
              }}
            >
              提交评分
            </Button>
          </Space>
        )
      }
    >
      <QueryError error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      {detailQuery.isPending && (
        <div className="notice-loading">
          <Spin />
        </div>
      )}

      {detail && detail.status === 'submitted' && !result && (
        <Alert
          className="page-alert"
          type="success"
          showIcon
          message={`本轮评分已完成：${detail.score ?? 0} 分`}
          description="已提交的轮次不可修改；如需调整请通过成绩更正流程处理。"
        />
      )}

      {detail && !result && (
        <>
          {detail.needs_arbitrate && (
            <Alert
              className="page-alert"
              type="warning"
              showIcon
              message="该题两评分差超过阈值，本轮为仲裁评分"
              description={`仲裁分数将直接作为该题最终得分。前两轮：${detail.rounds
                .filter((round) => round.score !== null)
                .map((round) => `${roundNames[round.round] ?? round.round} ${round.score} 分`)
                .join('，')}。`}
            />
          )}
          {detail.review_mode === 'double' && detail.round === 1 && (
            <Alert
              className="page-alert"
              type="info"
              showIcon
              message="本场为双评"
              description={`你的评分不会直接生效：第二位教师评分后，分差在 ${formatScore(detail.review_threshold, 1)} 分以内取平均，超过则进入三评仲裁。`}
            />
          )}

          <Descriptions
            size="small"
            column={2}
            className="exam-meta"
            items={[
              { key: 'exam', label: '考试', children: detail.exam_title },
              { key: 'candidate', label: '考生', children: detail.candidate_name },
              { key: 'type', label: '题型', children: questionTypeLabel(detail.question.type) },
              { key: 'score', label: '本题满分', children: `${formatScore(maxScore, 1)} 分` },
            ]}
          />

          <div className="review-block">
            <h4>题目</h4>
            <QuestionContent type={detail.question.type} content={detail.question.content} section={detail.question.section} />
          </div>

          <div className="review-block">
            <h4>考生作答</h4>
            <CandidateAnswer type={detail.question.type} answer={detail.answer} />
          </div>

          <div className="review-block">
            <h4>参考答案与评分要点</h4>
            <ReferenceAnswer answer={detail.question.answer as unknown as Record<string, unknown>} />
          </div>

          <div className="review-block">
            <h4>评分轮次</h4>
            <div className="review-rounds">
              {detail.rounds.map((round) => (
                <div
                  key={round.task_id}
                  className={round.task_id === detail.id ? 'review-round review-round-current' : 'review-round'}
                >
                  <Tag className="soft-tag">{roundNames[round.round] ?? `第 ${round.round} 轮`}</Tag>
                  <span className="review-round-score">{round.score === null ? '—' : `${round.score} 分`}</span>
                  <span className="cell-meta">
                    {round.reviewer_name || '待认领'} · {round.status === 'submitted' ? '已提交' : round.status === 'in_progress' ? '阅卷中' : '待阅'}
                  </span>
                  {round.comment && <span className="cell-meta">评语：{round.comment}</span>}
                </div>
              ))}
            </div>
          </div>

          {detail.status !== 'submitted' && (
          <div className="review-block">
            <h4>本轮评分</h4>
            <div className="quick-scores">
              {quickScores.map((value) => (
                <Button key={value} size="small" type={score === value ? 'primary' : 'default'} onClick={() => setScore(value)}>
                  {value}
                </Button>
              ))}
            </div>
            <InputNumber
              min={0}
              max={maxScore}
              step={0.5}
              value={score ?? undefined}
              style={{ width: 180 }}
              placeholder={`0 - ${maxScore}`}
              onChange={(value) => setScore(value === null ? null : Number(value))}
            />
            <span className="cell-meta score-hint">本题满分 {maxScore} 分</span>
            <Input.TextArea
              className="review-comment"
              rows={3}
              maxLength={2000}
              showCount
              placeholder="评语（选填，会随轮次一起展示给后续评阅教师）"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            {mutation.isError && (
              <Alert className="page-alert" type="error" showIcon message="提交失败" description={errorText(mutation.error)} />
            )}
          </div>
          )}
        </>
      )}

      {detail && result && (
        <Alert
          type="success"
          showIcon
          message={
            result.finalized
              ? `本题最终得分 ${formatScore(result.final_score ?? 0, 2)} 分`
              : result.arbitration
                ? '两轮分差超过阈值，已生成三评仲裁任务'
                : '本轮已记录，等待第二位教师评分'
          }
          description={
            <>
              <p>
                该答卷仍有 {result.pending_review} 题待阅卷；当前总分 {formatScore(result.attempt_total, 2)} 分。
              </p>
              {result.next_task_id && <p>下一轮任务已自动分配给其他阅卷教师。</p>}
              {queue?.next_id ? (
                <Button type="primary" size="small" className="review-next-button" onClick={() => goTo(queue.next_id)}>
                  继续批阅下一份
                </Button>
              ) : (
                <p className="cell-meta">当前队列已经没有下一份了。</p>
              )}
            </>
          }
        />
      )}
    </Drawer>
  )
}
