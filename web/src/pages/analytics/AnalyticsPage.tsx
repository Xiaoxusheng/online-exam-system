import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Descriptions, Progress, Select, Tabs } from 'antd'
import PageHeader from '../../components/PageHeader'
import MetricGrid from '../../components/MetricGrid'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import ItemAnalyticsPanel from './ItemAnalyticsPanel'
import KnowledgeAnalyticsPanel from './KnowledgeAnalyticsPanel'
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

  const overview = analytics ? (
    <>
      {analytics.graded_count === 0 && (
        <Alert
          className="page-alert"
          type="info"
          showIcon
          message="该考试还没有已判分的答卷"
          description="考生交卷后客观题会自动判分，主观题需要阅卷完成后才会进入统计。"
        />
      )}
      <Card className="panel-card" variant="borderless" title={analytics.exam_title}>
        <Descriptions
          className="analytics-meta"
          size="small"
          column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
          items={[
            { key: 'paper', label: '试卷', children: analytics.paper_title },
            {
              key: 'score',
              label: '满分 / 及格线',
              children: `${formatScore(analytics.total_score, 0)} / ${formatScore(analytics.pass_score, 0)}`,
            },
          ]}
        />
        <MetricGrid
          items={[
            { label: '编排考生', value: analytics.candidate_count },
            { label: '已判分答卷', value: analytics.graded_count },
            { label: '平均分', value: analytics.average, decimals: 1 },
            { label: '及格率', value: analytics.pass_rate, decimals: 1, suffix: '%', tone: 'success' },
            { label: '最高分', value: analytics.highest, decimals: 1 },
            { label: '最低分', value: analytics.lowest, decimals: 1 },
          ]}
        />
      </Card>

      <Card className="panel-card" variant="borderless" title="判分概览">
        <div className="ring-panel">
          <Progress
            type="circle"
            percent={Math.min(100, Math.max(0, analytics.pass_rate))}
            size={132}
            strokeWidth={10}
            format={() => (
              <span className="ring-center">
                <span className="ring-center-value">{formatScore(analytics.pass_rate, 1)}%</span>
                <span className="ring-center-caption">及格率</span>
              </span>
            )}
          />
          <div className="ring-metrics">
            <div className="ring-row">
              <span className="ring-label">平均分</span>
              <Progress
                percent={
                  analytics.total_score > 0
                    ? Math.min(100, (analytics.average / analytics.total_score) * 100)
                    : 0
                }
                showInfo={false}
                size="small"
              />
              <span className="ring-value">
                {formatScore(analytics.average, 1)} / {formatScore(analytics.total_score, 0)}
              </span>
            </div>
            <div className="ring-row">
              <span className="ring-label">已判分</span>
              <Progress
                percent={
                  analytics.candidate_count > 0
                    ? Math.min(100, (analytics.graded_count / analytics.candidate_count) * 100)
                    : 0
                }
                showInfo={false}
                size="small"
                strokeColor="var(--app-success)"
              />
              <span className="ring-value">
                {analytics.graded_count} / {analytics.candidate_count} 人
              </span>
            </div>
            <div className="ring-row">
              <span className="ring-label">最高 / 最低</span>
              <span className="ring-value ring-value-wide">
                {formatScore(analytics.highest, 1)} / {formatScore(analytics.lowest, 1)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="panel-card" variant="borderless" title="分数段分布（按得分率）">
        <div className="distribution">
          {analytics.distribution.map((bucket) => (
            <div className="distribution-row" key={bucket.label}>
              <span className="cell-meta">{bucket.label}</span>
              <Progress
                percent={Math.round((bucket.count / maxBucket) * 100)}
                showInfo={false}
                size="small"
              />
              <span className="distribution-count">{bucket.count} 人</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  ) : null

  return (
    <div>
      <PageHeader
        title="数据分析"
        subtitle="按考试查看分数分布、逐题诊断与知识点掌握度，定位需要讲评的题目与薄弱知识点。"
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
        <Tabs
          className="analytics-tabs"
          defaultActiveKey="overview"
          items={[
            {
              key: 'overview',
              label: '总体概览',
              children: (
                <>
                  <QueryError error={analyticsQuery.error} onRetry={() => analyticsQuery.refetch()} />
                  {overview}
                </>
              ),
            },
            { key: 'items', label: '题目分析', children: <ItemAnalyticsPanel examId={activeExam} /> },
            { key: 'knowledge', label: '知识点分析', children: <KnowledgeAnalyticsPanel examId={activeExam} /> },
          ]}
        />
      )}
    </div>
  )
}
