import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Flex, Form, Input, Modal, Select, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DotChartOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import PageHeader from '../../components/PageHeader'
import MetricGrid from '../../components/MetricGrid'
import QueryError from '../../components/QueryError'
import EmptyState from '../../components/EmptyState'
import { handleProctorEvent, listProctorEvents, listProctorRooms, getProctorOverview, type ProctorEventParams } from '../../api/proctor'
import { queryKeys } from '../../api/queryKeys'
import { useProctorSocket, type SocketStatus } from '../../hooks/useProctorSocket'
import { useAuthStore } from '../../stores/auth'
import { examStatusLabels, proctorActionLabels, proctorEventTypeLabel, proctorLevelLabels, statusOf } from '../../utils/labels'
import { formatDateTime, formatTime } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { ProctorEvent, RealtimeEvent } from '../../types'

const statusLabels: Record<SocketStatus, { label: string; status: 'success' | 'processing' | 'default' | 'error' }> = {
  open: { label: '实时连接', status: 'success' },
  connecting: { label: '连接中', status: 'processing' },
  closed: { label: '已断开，自动重连中', status: 'error' },
  idle: { label: '未选择考试', status: 'default' },
}

interface LiveItem {
  key: string
  label: string
  at: number
}

export default function ProctorPage() {
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.token)
  const [examId, setExamId] = useState<string | undefined>()
  const [filters, setFilters] = useState<Omit<ProctorEventParams, 'page' | 'page_size'>>({})
  const [query, setQuery] = useState<ProctorEventParams>({ page: 1, page_size: 20 })
  const [handling, setHandling] = useState<ProctorEvent | null>(null)
  const [live, setLive] = useState<LiveItem[]>([])
  const [form] = Form.useForm<{ action: string; note?: string }>()
  const debounceRef = useRef<number | undefined>(undefined)

  const refresh = useCallback(() => {
    if (!examId) return
    queryClient.invalidateQueries({ queryKey: ['proctor', 'overview', examId] })
    queryClient.invalidateQueries({ queryKey: ['proctor', 'events', examId] })
  }, [examId, queryClient])

  const onRealtime = useCallback(
    (event: RealtimeEvent) => {
      const label =
        event.type === 'attempt_started'
          ? `${event.user_name ?? '考生'} 开始作答`
          : event.type === 'attempt_submitted'
            ? `${event.user_name ?? '考生'} 已交卷`
            : event.type === 'proctor_event'
              ? `${event.user_name ?? '考生'} 触发 ${proctorEventTypeLabel(String(event.detail?.event_type ?? ''))}`
              : event.type === 'proctor_event_handled'
                ? `告警已被处置（${String(event.detail?.action ?? '')}）`
                : event.type === 'exam_closed'
                  ? '考试已结束'
                  : event.type
      setLive((current) => [{ key: `${event.type}-${Date.now()}-${Math.random()}`, label, at: Date.now() }, ...current].slice(0, 6))
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(refresh, 400)
    },
    [refresh],
  )

  const { status } = useProctorSocket(examId, token ?? undefined, onRealtime)

  const roomsQuery = useQuery({ queryKey: queryKeys.proctorRooms, queryFn: listProctorRooms })
  const overviewQuery = useQuery({
    queryKey: queryKeys.proctorOverview(examId ?? ''),
    queryFn: () => getProctorOverview(examId ?? ''),
    enabled: Boolean(examId),
    refetchInterval: status === 'open' ? false : 15_000,
  })
  const eventsQuery = useQuery({
    queryKey: queryKeys.proctorEvents(examId ?? '', query),
    queryFn: () => listProctorEvents(examId ?? '', query),
    enabled: Boolean(examId),
    refetchInterval: status === 'open' ? false : 15_000,
  })

  const handleMutation = useMutation({
    mutationFn: (values: { action: string; note?: string }) =>
      handleProctorEvent(Number(handling?.id), { action: values.action, note: values.note ?? '' }),
    onSuccess: () => {
      setHandling(null)
      form.resetFields()
      refresh()
    },
  })

  const rooms = roomsQuery.data ?? []
  const selectedRoom = useMemo(() => rooms.find((room) => room.exam_id === examId), [rooms, examId])

  const columns: ColumnsType<ProctorEvent> = [
    { title: '时间', dataIndex: 'occurred_at', width: 110, render: (value: string) => formatTime(value) },
    {
      title: '考生',
      dataIndex: 'user_name',
      width: 140,
      render: (value: string) => <span className="cell-title">{value}</span>,
    },
    {
      title: '事件',
      key: 'event',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{proctorEventTypeLabel(record.type)}</span>
          <span className="cell-meta">{record.type}</span>
        </div>
      ),
    },
    {
      title: '级别',
      dataIndex: 'level',
      width: 90,
      render: (value: string) => {
        const level = statusOf(proctorLevelLabels, value)
        return <Tag color={level.color}>{level.label}</Tag>
      },
    },
    {
      title: '处置',
      key: 'handled',
      width: 200,
      render: (_value, record) =>
        record.handled_by ? (
          <span className="cell-meta">
            {record.handled_by_name} · {proctorActionLabels[record.action] ?? record.action}
            {record.note ? ` · ${record.note}` : ''}
          </span>
        ) : (
          <Button
            type="link"
            size="small"
            onClick={() => {
              setHandling(record)
              form.setFieldsValue({ action: 'warning', note: '' })
            }}
          >
            处置
          </Button>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="监考中心"
        subtitle="实时掌握考生状态与告警，处置动作全部留痕。"
        extra={
          <>
            <Select
              placeholder="选择考场"
              style={{ width: 300 }}
              loading={roomsQuery.isPending}
              value={examId}
              onChange={setExamId}
              options={rooms.map((room) => ({
                value: room.exam_id,
                label: `${room.title}（${statusOf(examStatusLabels, room.status).label} · ${room.candidates} 人${room.assigned ? '' : ' · 未分配'}）`,
              }))}
              notFoundContent="没有可监考的考试"
            />
            <Tooltip title={status === 'open' ? '事件通过 WebSocket 实时推送' : '连接不可用时每 15 秒轮询一次'}>
              <Badge status={statusLabels[status].status} text={statusLabels[status].label} className="socket-badge" />
            </Tooltip>
          </>
        }
      />

      {!examId ? (
        <Card className="panel-card" variant="borderless">
          <EmptyState
            icon={<SafetyCertificateOutlined />}
            title="请选择要监考的考试"
            description="列表包含进行中的考试，以及分配给你的考场。"
          />
        </Card>
      ) : (
        <>
          <QueryError error={roomsQuery.error} onRetry={() => roomsQuery.refetch()} />
          {selectedRoom && (
            <Alert
              className="page-alert"
              type={selectedRoom.status === 'in_progress' ? 'success' : 'info'}
              showIcon
              message={`${selectedRoom.title} · ${formatDateTime(selectedRoom.start_at)} 至 ${formatDateTime(selectedRoom.end_at)} · 限时 ${selectedRoom.duration_minutes} 分钟`}
            />
          )}

          {overviewQuery.data && (
            <Card className="panel-card" variant="borderless">
              <MetricGrid
                items={[
                  { label: '编排考生', value: overviewQuery.data.candidates },
                  {
                    label: '未入场',
                    value: Math.max(
                      0,
                      overviewQuery.data.candidates -
                        overviewQuery.data.testing -
                        overviewQuery.data.submitted -
                        overviewQuery.data.absent,
                    ),
                  },
                  { label: '作答中', value: overviewQuery.data.testing },
                  { label: '已交卷', value: overviewQuery.data.submitted, tone: 'success' },
                  { label: '缺考', value: overviewQuery.data.absent, tone: 'danger' },
                  { label: '在线答卷', value: overviewQuery.data.online },
                  {
                    label: '未处置告警',
                    value: overviewQuery.data.unhandled_events,
                    tone: overviewQuery.data.unhandled_events > 0 ? 'warning' : 'default',
                  },
                  {
                    label: '严重告警',
                    value: overviewQuery.data.critical_events,
                    tone: overviewQuery.data.critical_events > 0 ? 'danger' : 'default',
                  },
                ]}
              />
            </Card>
          )}

          {live.length > 0 && (
            <Card className="panel-card" variant="borderless" size="small">
              <div className="live-strip">
                <span className="live-title">
                  <DotChartOutlined /> 实时动态
                </span>
                {live.map((item) => (
                  <span className="live-item" key={item.key}>
                    <span className="live-time">{dayjs(item.at).format('HH:mm:ss')}</span>
                    {item.label}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card className="panel-card" variant="borderless" title="告警与事件">
            <Flex className="filter-bar" gap={12} wrap align="flex-end">
              <Select
                allowClear
                placeholder="级别"
                style={{ width: 120 }}
                value={filters.level}
                options={Object.entries(proctorLevelLabels).map(([value, item]) => ({ value, label: item.label }))}
                onChange={(value) => setFilters({ ...filters, level: value })}
              />
              <Select
                allowClear
                placeholder="处置状态"
                style={{ width: 140 }}
                value={filters.handled}
                options={[
                  { value: 'true', label: '已处置' },
                  { value: 'false', label: '未处置' },
                ]}
                onChange={(value) => setFilters({ ...filters, handled: value })}
              />
              <Button
                type="primary"
                onClick={() => setQuery({ ...filters, page: 1, page_size: query.page_size ?? 20 })}
              >
                查询
              </Button>
              <Button
                onClick={() => {
                  setFilters({})
                  setQuery({ page: 1, page_size: 20 })
                }}
              >
                重置
              </Button>
            </Flex>

            <QueryError error={eventsQuery.error} onRetry={() => eventsQuery.refetch()} />

            <Table
              rowKey="id"
              size="middle"
              loading={eventsQuery.isPending}
              columns={columns}
              dataSource={eventsQuery.data?.items ?? []}
              pagination={{
                current: eventsQuery.data?.pagination.page ?? 1,
                pageSize: eventsQuery.data?.pagination.page_size ?? 20,
                total: eventsQuery.data?.pagination.total ?? 0,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条事件`,
                onChange: (page, pageSize) => setQuery({ ...filters, page, page_size: pageSize }),
              }}
              locale={{
                emptyText: eventsQuery.isError ? ' ' : (
                  <EmptyState compact icon={<SafetyCertificateOutlined />} title="本场考试暂无告警事件" description="考生端的切屏、失焦、复制等动作会实时出现在这里。" />
                ),
              }}
            />
          </Card>
        </>
      )}

      <Modal
        open={Boolean(handling)}
        title={handling ? `处置告警 · ${proctorEventTypeLabel(handling.type)}` : '处置告警'}
        okText="提交处置"
        cancelText="取消"
        confirmLoading={handleMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setHandling(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => handleMutation.mutate(values)}>
          <Form.Item name="action" label="处置动作" rules={[{ required: true, message: '请选择处置动作' }]}>
            <Select options={Object.entries(proctorActionLabels).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="note" label="备注" rules={[{ max: 1000, message: '备注不超过 1000 个字符' }]}>
            <Input.TextArea rows={3} maxLength={1000} showCount placeholder="处置说明，会写入审计与事件记录" />
          </Form.Item>
          {handleMutation.isError && (
            <Alert type="error" showIcon message="处置失败" description={errorText(handleMutation.error)} />
          )}
        </Form>
      </Modal>
    </div>
  )
}
