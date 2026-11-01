import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, Space, Table, Tag, Timeline } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileDoneOutlined } from '@ant-design/icons'
import { getProctorReport, type ProctorReportRow } from '../../api/proctor'
import { formatDateTime } from '../../utils/format'
import { proctorActionLabels } from '../../utils/labels'
import QueryError from '../../components/QueryError'

const scoreStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待发布', color: 'gold' },
  published: { label: '已发布', color: 'green' },
  withheld: { label: '违规挂起', color: 'red' },
  corrected: { label: '已更正', color: 'blue' },
}

interface ProctorReportDrawerProps {
  examId: string | null
  examTitle?: string
  onClose: () => void
}

/** M-10 post-exam monitoring report: aggregates + disposition timeline. */
export default function ProctorReportDrawer({ examId, examTitle, onClose }: ProctorReportDrawerProps) {
  const reportQuery = useQuery({
    queryKey: ['proctor', 'report', examId],
    queryFn: () => getProctorReport(examId as string),
    enabled: Boolean(examId),
  })

  const columns: ColumnsType<ProctorReportRow> = [
    {
      title: '考生',
      key: 'user',
      width: 170,
      render: (_value, row) => (
        <div className="cell-stack">
          <span className="cell-title">{row.user_name}</span>
          <span className="cell-meta">{row.username}</span>
        </div>
      ),
    },
    { title: '事件', dataIndex: 'event_count', width: 80, sorter: (a, b) => a.event_count - b.event_count },
    { title: '切屏', dataIndex: 'screen_switches', width: 80, render: (v: number) => (v > 0 ? <Tag color="gold">{v}</Tag> : '—') },
    { title: '严重', dataIndex: 'critical_count', width: 80, render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : '—') },
    { title: '抓拍', dataIndex: 'snapshots', width: 80 },
    { title: '已处置', dataIndex: 'handled_count', width: 90 },
    {
      title: '成绩状态',
      dataIndex: 'score_status',
      width: 110,
      render: (value: string) => {
        if (!value) return <span className="cell-meta">无记录</span>
        const meta = scoreStatusLabels[value] ?? { label: value, color: 'default' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
  ]

  return (
    <Drawer
      open={Boolean(examId)}
      width={860}
      title={`监考报告${examTitle ? ` · ${examTitle}` : ''}`}
      onClose={onClose}
      destroyOnHidden
    >
      <QueryError error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      <Table
        rowKey="user_id"
        size="middle"
        loading={reportQuery.isFetching}
        columns={columns}
        dataSource={reportQuery.data ?? []}
        pagination={false}
        expandable={{
          expandedRowRender: (row) =>
            row.events.length === 0 ? (
              <span className="cell-meta">该考生本场没有监考事件。</span>
            ) : (
              <Timeline
                items={row.events.map((event) => ({
                  color: event.level === 'critical' ? 'red' : event.level === 'warning' ? 'orange' : 'blue',
                  children: (
                    <Space direction="vertical" size={0}>
                      <span>
                        {formatDateTime(event.occurred_at)} · <strong>{event.type}</strong>
                        {event.action && ` · ${proctorActionLabels[event.action] ?? event.action}`}
                      </span>
                      {event.note && <span className="cell-meta">{event.note}</span>}
                    </Space>
                  ),
                }))}
              />
            ),
        }}
        locale={{ emptyText: '本场暂无监考数据' }}
      />
    </Drawer>
  )
}

export function ReportButton(props: { onClick: () => void }) {
  return (
    <Button icon={<FileDoneOutlined />} onClick={props.onClick}>
      监考报告
    </Button>
  )
}
