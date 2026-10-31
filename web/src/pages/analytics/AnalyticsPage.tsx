import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Select } from 'antd'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { BarChartOutlined } from '@ant-design/icons'
import { getExamAnalytics } from '../../api/score'
import { listExams } from '../../api/exam'
import { queryKeys } from '../../api/queryKeys'
import { formatScore } from '../../utils/format'

export default function AnalyticsPage() {
  const [chosen, setChosen] = useState<string | undefined>()

  const examsQuery = useQuery({
    queryKey: queryKeys.exams({ page: 1, page_size: 100 }),
    queryFn: () => listExams({ page: 1, page_size: 100 }),
  })

  useEffect(() => {
    if (!chosen && examsQuery.data?.items?.length) {
      const first = examsQuery.data.items.find((exam) => ['ended', 'grading', 'pending_publish_score', 'published'].includes(exam.status))
      if (first) setChosen(first.id)
    }
  }, [examsQuery.data, chosen])

  const activeExam = chosen
  const analyticsQuery = useQuery({
    queryKey: queryKeys.analytics(activeExam ?? ''),
    queryFn: () => getExamAnalytics(activeExam ?? ''),
    enabled: Boolean(activeExam),
  })

  const analytics = analyticsQuery.data
  const maxBucket = Math.max(1, ...(analytics?.distribution ?? []).map((bucket) => bucket.count))
  const examOptions = (examsQuery.data?.items ?? []).map((exam) => ({ value: exam.id, label: exam.title }))

  return (
    <div>
      <PageHeader
        title="数据分析"
        subtitle="按考试查看分数分布与及格情况；题目与知识点分析在后续里程碑。"
        extra={
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择考试"
            style={{ width: 280 }}
            value={chosen}
            options={examOptions}
            loading={examsQuery.isPending}
            onChange={(value) => setChosen(value)}
          />
        }
      />

      {!activeExam ? (
        <Card className="panel-card" variant="borderless">
          <EmptyState
            icon={<BarChartOutlined />}
            title="请选择一场考试"
            description="只有存在已判分答卷的考试才有统计数据。"
          />
        </Card>
      ) : (
        <>
          <QueryError error={analyticsQuery.error} onRetry={() => analyticsQuery.refetch()} />
          {analytics && analytics.graded_count === 0 && (
            <Alert
              className="page-alert"
              type="info"
              showIcon
              message="该考试还没有已判分的答卷"
              description="考生交卷后客观题会自动判分，主观题需要阅卷完成后才会进入统计。"
            />
          )}
          {analytics && (
            <>
              <Card className="panel-card" variant="borderless" title={analytics.exam_title}>
                <div className="metric-grid">
                  <div className="metric-cell">
                    <div className="metric-label">编排考生</div>
                    <div className="metric-value">{analytics.candidate_count}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">已判分答卷</div>
                    <div className="metric-value">{analytics.graded_count}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">平均分</div>
                    <div className="metric-value">{formatScore(analytics.average, 1)}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">及格率</div>
                    <div className="metric-value">{formatScore(analytics.pass_rate, 1)}%</div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">最高分</div>
                    <div className="metric-value">{formatScore(analytics.highest, 1)}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">最低分</div>
                    <div className="metric-value">{formatScore(analytics.lowest, 1)}</div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">满分 / 及格线</div>
                    <div className="metric-value">
                      {formatScore(analytics.total_score, 0)} / {formatScore(analytics.pass_score, 0)}
                    </div>
                  </div>
                  <div className="metric-cell">
                    <div className="metric-label">试卷</div>
                    <div className="metric-value metric-text">{analytics.paper_title}</div>
                  </div>
                </div>
              </Card>

              <Card className="panel-card" variant="borderless" title="分数段分布（按得分率）">
                <div className="distribution">
                  {analytics.distribution.map((bucket) => (
                    <div className="distribution-row" key={bucket.label}>
                      <span className="cell-meta">{bucket.label}</span>
                      <span className="distribution-bar">
                        <span
                          className="distribution-fill"
                          style={{ width: `${Math.round((bucket.count / maxBucket) * 100)}%` }}
                        />
                      </span>
                      <span className="distribution-count">{bucket.count} 人</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
