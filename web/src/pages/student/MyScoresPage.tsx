import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Descriptions, Drawer, Form, Input, Modal, Row, Select, Skeleton, Table, Tabs, Tag } from 'antd'
import { AuditOutlined, ClockCircleOutlined, FileTextOutlined, TrophyOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { createScoreAppeal, getMyScoreRecord, listMyAppeals, listMyScores } from '../../api/student'
import { queryKeys } from '../../api/queryKeys'
import { formatDateTime, formatScore } from '../../utils/format'
import { questionTypeLabel, scoreStatusLabels, statusOf } from '../../utils/labels'
import { errorText } from '../../utils/errors'
import type { ScoreAppeal, ScoreDetailItem } from '../../types'

const appealStatus: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'gold' },
  accepted: { label: '已通过', color: 'green' },
  rejected: { label: '未通过', color: 'default' },
}

export default function MyScoresPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [appealAttempt, setAppealAttempt] = useState<string | null>(null)
  const activeAttempt = appealAttempt ?? attemptId
  const [appealForm] = Form.useForm<{ question_id?: string; reason: string }>()

  const scoresQuery = useQuery({ queryKey: queryKeys.myScores, queryFn: listMyScores })
  const appealsQuery = useQuery({ queryKey: queryKeys.myAppeals, queryFn: listMyAppeals })
  const recordQuery = useQuery({
    queryKey: queryKeys.myScoreRecord(activeAttempt ?? ''),
    queryFn: () => getMyScoreRecord(activeAttempt ?? ''),
    enabled: Boolean(activeAttempt),
  })

  const appealMutation = useMutation({
    mutationFn: (values: { question_id?: string; reason: string }) =>
      createScoreAppeal(appealAttempt ?? '', values.reason, values.question_id),
    onSuccess: () => {
      message.success('申诉已提交，考务处理后你会收到站内通知')
      setAppealAttempt(null)
      appealForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['appeal'] })
      queryClient.invalidateQueries({ queryKey: ['notification'] })
    },
    onError: (error) => message.error(errorText(error)),
  })

  const record = recordQuery.data
  const questions = record?.detail.questions ?? []

  const scores = scoresQuery.data ?? []
  const appeals = appealsQuery.data ?? []

  return (
    <div>
      <PageHeader
        title="我的成绩"
        subtitle="只展示已发布的成绩；对分数有异议可在明细中提出申诉，处理结果会站内通知你。"
      />

      <Tabs
        items={[
          {
            key: 'scores',
            label: '成绩列表',
            children: (
              <>
                <QueryError error={scoresQuery.error} onRetry={() => scoresQuery.refetch()} />
                {scoresQuery.isFetching && scores.length === 0 ? (
                  <Row gutter={[12, 12]}>
                    {[0, 1, 2].map((index) => (
                      <Col key={index} xs={24} sm={12} xl={8}>
                        <Card className="panel-card room-card" variant="borderless">
                          <Skeleton active title paragraph={{ rows: 1 }} />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                ) : scores.length === 0 ? (
                  <Card className="panel-card" variant="borderless">
                    <EmptyState
                      icon={<TrophyOutlined />}
                      title="还没有已发布的成绩"
                      description="成绩由考务统一发布，发布后会同时给你发送站内通知。"
                    />
                  </Card>
                ) : (
                  <Row gutter={[12, 12]}>
                    {scores.map((row) => {
                      const status = statusOf(scoreStatusLabels, row.status)
                      return (
                        <Col key={row.attempt_id} xs={24} sm={12} xl={8}>
                          <Card
                            className="panel-card room-card is-interactive"
                            variant="borderless"
                            onClick={() => setAttemptId(row.attempt_id)}
                          >
                            <div className="room-card-head">
                              <span className="room-card-title" title={row.exam_title}>
                                {row.exam_title}
                              </span>
                              <Tag color={status.color}>{status.label}</Tag>
                            </div>
                            <div className="room-card-schedule">
                              <ClockCircleOutlined />
                              <span>公布于 {formatDateTime(row.published_at)}</span>
                            </div>
                            <div className="room-card-foot">
                              <span className="score-value room-score">{formatScore(row.total, 1)} 分</span>
                              <Button
                                type="link"
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setAttemptId(row.attempt_id)
                                }}
                              >
                                逐题明细
                              </Button>
                              <Button
                                type="link"
                                size="small"
                                icon={<AuditOutlined />}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  appealForm.resetFields()
                                  setAppealAttempt(row.attempt_id)
                                }}
                              >
                                申诉
                              </Button>
                            </div>
                          </Card>
                        </Col>
                      )
                    })}
                  </Row>
                )}
              </>
            ),
          },
          {
            key: 'appeals',
            label: appeals.length > 0 ? `我的申诉 (${appeals.length})` : '我的申诉',
            children: (
              <>
                <QueryError error={appealsQuery.error} onRetry={() => appealsQuery.refetch()} />
                {appealsQuery.isFetching && appeals.length === 0 ? (
                  <Row gutter={[12, 12]}>
                    {[0, 1, 2].map((index) => (
                      <Col key={index} xs={24} sm={12} xl={8}>
                        <Card className="panel-card room-card" variant="borderless">
                          <Skeleton active title paragraph={{ rows: 2 }} />
                        </Card>
                      </Col>
                    ))}
                  </Row>
                ) : appeals.length === 0 ? (
                  <Card className="panel-card" variant="borderless">
                    <EmptyState
                      icon={<FileTextOutlined />}
                      title="还没有提交申诉"
                      description="在成绩明细中可以对整份答卷或某一道题提出申诉。"
                    />
                  </Card>
                ) : (
                  <Row gutter={[12, 12]}>
                    {appeals.map((row: ScoreAppeal) => {
                      const meta = appealStatus[row.status] ?? { label: row.status, color: 'default' }
                      return (
                        <Col key={row.id} xs={24} sm={12} xl={8}>
                          <Card className="panel-card room-card" variant="borderless">
                            <div className="room-card-head">
                              <span className="room-card-title" title={row.exam_title}>
                                {row.exam_title}
                              </span>
                              <Tag color={meta.color}>{meta.label}</Tag>
                            </div>
                            <div className="room-card-schedule">
                              <AuditOutlined />
                              <span>{row.question_id ? `第 ${row.question_id.slice(0, 6)} 题` : '整份答卷'}</span>
                              <span className="room-card-sep">·</span>
                              <span>提交于 {formatDateTime(row.created_at)}</span>
                            </div>
                            <div className="room-card-paper">
                              <span title={row.reason}>{row.reason}</span>
                            </div>
                            <div className="room-card-foot">
                              {row.status === 'pending' ? (
                                <span className="cell-meta">等待考务处理</span>
                              ) : (
                                <span className="cell-meta">
                                  {row.handle_note} · {row.handler_name} · {formatDateTime(row.handled_at)}
                                </span>
                              )}
                            </div>
                          </Card>
                        </Col>
                      )
                    })}
                  </Row>
                )}
              </>
            ),
          },
        ]}
      />

      <Drawer
        open={Boolean(attemptId)}
        width={680}
        destroyOnHidden
        title={record ? `成绩明细 · ${record.exam_title}` : '成绩明细'}
        onClose={() => setAttemptId(null)}
        extra={
          record && (
            <Button
              type="primary"
              size="small"
              icon={<AuditOutlined />}
              onClick={() => {
                appealForm.resetFields()
                setAppealAttempt(attemptId)
              }}
            >
              申诉这份成绩
            </Button>
          )
        }
      >
        <QueryError error={recordQuery.error} onRetry={() => recordQuery.refetch()} />
        {record && (
          <>
            <Descriptions
              size="small"
              column={2}
              className="exam-meta"
              items={[
                { key: 'total', label: '总分', children: `${formatScore(record.total, 2)} 分` },
                { key: 'submitted', label: '交卷时间', children: formatDateTime(record.submitted_at) },
              ]}
            />
            <Table
              rowKey="question_id"
              size="small"
              pagination={false}
              dataSource={questions}
              columns={[
                { title: '题型', dataIndex: 'type', width: 100, render: (value: string) => questionTypeLabel(value) },
                { title: '得分', dataIndex: 'score', width: 90, render: (value: number) => formatScore(value, 2) },
                { title: '满分', dataIndex: 'max_score', width: 90, render: (value: number) => formatScore(value, 1) },
                {
                  title: '判分方式',
                  key: 'auto',
                  width: 120,
                  render: (_value: unknown, item: ScoreDetailItem) =>
                    item.needs_review ? (
                      <Tag color="gold">待人工</Tag>
                    ) : item.auto ? (
                      <Tag color="green">自动</Tag>
                    ) : (
                      <Tag color="blue">人工</Tag>
                    ),
                },
              ]}
            />
            {questions.some((item) => item.correct?.length || item.reference || item.rubric?.length) && (
              <div className="score-analysis">
                <h4 className="score-analysis-title">答案与解析</h4>
                {questions.map((item, index) => {
                  const hasAnalysis = Boolean(item.correct?.length || item.reference || item.rubric?.length)
                  if (!hasAnalysis) return null
                  return (
                    <div className="score-analysis-item" key={item.question_id}>
                      <div className="score-analysis-head">
                        <Tag className="soft-tag">第 {index + 1} 题 · {questionTypeLabel(item.type)}</Tag>
                        <span className="cell-meta">{formatScore(item.score, 1)} / {formatScore(item.max_score, 1)} 分</span>
                      </div>
                      {item.correct && item.correct.length > 0 && (
                        <p className="score-analysis-line">正确答案：{item.correct.map((value) => String(value)).join('、')}</p>
                      )}
                      {item.reference && <p className="score-analysis-line">解析：{item.reference}</p>}
                      {item.rubric && item.rubric.length > 0 && (
                        <ul className="score-analysis-line">
                          {item.rubric.map((point, pointIndex) => (
                            <li key={pointIndex}>{point}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Drawer>

      <Modal
        open={Boolean(appealAttempt)}
        title="提交成绩申诉"
        okText="提交申诉"
        cancelText="取消"
        destroyOnHidden
        confirmLoading={appealMutation.isPending}
        onOk={() => appealForm.submit()}
        onCancel={() => setAppealAttempt(null)}
      >
        <Form form={appealForm} layout="vertical" onFinish={(values) => appealMutation.mutate(values)}>
          <Form.Item name="question_id" label="申诉范围">
            <Select
              allowClear
              placeholder="整份答卷（也可指定某一道题）"
              options={questions.map((item, index) => ({
                value: item.question_id,
                label: `第 ${index + 1} 题 · ${questionTypeLabel(item.type)} ${formatScore(item.score, 1)}/${formatScore(item.max_score, 1)} 分`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="申诉理由"
            rules={[
              { required: true, message: '请填写申诉理由' },
              { max: 500, message: '理由不超过 500 字' },
            ]}
          >
            <Input.TextArea rows={4} showCount maxLength={500} placeholder="请说明你认为判分有误的地方，考务复核后会给出结论。" />
          </Form.Item>
          <span className="cell-meta">每道题同时只能有一条待处理申诉；处理结果会通过站内通知发送。</span>
        </Form>
      </Modal>
    </div>
  )
}
