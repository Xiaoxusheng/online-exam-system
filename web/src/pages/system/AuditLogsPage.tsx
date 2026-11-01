import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, DatePicker, Flex, Input, Select, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { listAuditLogs, type AuditLogParams } from '../../api/system'
import { queryKeys } from '../../api/queryKeys'
import { auditActionLabels } from '../../utils/labels'
import { formatDateTime } from '../../utils/format'
import type { AuditLog } from '../../types'

const actionOptions = Object.entries(auditActionLabels).map(([value, label]) => ({ value, label }))

const targetOptions = [
  'user',
  'campus',
  'class',
  'question_bank',
  'question',
  'paper',
  'exam',
  'attempt',
  'review_task',
  'proctor_event',
  'score',
].map((value) => ({ value, label: value }))

interface Draft {
  action?: string
  target_type?: string
  keyword?: string
  range?: [Dayjs | null, Dayjs | null] | null
}

export default function AuditLogsPage() {
  const [draft, setDraft] = useState<Draft>({})
  const [query, setQuery] = useState<AuditLogParams>({ page: 1, page_size: 20 })

  const logsQuery = useQuery({ queryKey: queryKeys.auditLogs(query), queryFn: () => listAuditLogs(query) })
  const pagination = logsQuery.data?.pagination

  function apply() {
    setQuery({
      page: 1,
      page_size: pagination?.page_size ?? 20,
      action: draft.action,
      target_type: draft.target_type,
      keyword: draft.keyword,
      from: draft.range?.[0] ? draft.range[0].toISOString() : undefined,
      to: draft.range?.[1] ? draft.range[1].toISOString() : undefined,
    })
  }

  const columns: ColumnsType<AuditLog> = [
    { title: '时间', dataIndex: 'created_at', width: 170, render: (value: string) => formatDateTime(value) },
    {
      title: '操作者',
      dataIndex: 'actor_name',
      width: 150,
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.actor_name || '系统'}</span>
          <span className="cell-meta">{record.ip || '—'}</span>
        </div>
      ),
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 170,
      render: (value: string) => (
        <div className="cell-stack">
          <span className="cell-title">{auditActionLabels[value] ?? value}</span>
          <span className="cell-meta">{value}</span>
        </div>
      ),
    },
    {
      title: '对象',
      key: 'target',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">
            <Tag className="soft-tag">{record.target_type || '—'}</Tag>
          </span>
          <span className="cell-meta">{record.target_id || '—'}</span>
        </div>
      ),
    },
    {
      title: '详情',
      dataIndex: 'detail',
      ellipsis: true,
      render: (value: Record<string, unknown>) => (
        <span className="cell-meta">{value && Object.keys(value).length > 0 ? JSON.stringify(value) : '—'}</span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="审计日志" subtitle="登录、组卷、发布、改分与处置等关键操作全量留痕。" />

      <Card className="panel-card" variant="borderless">
        <Flex className="filter-bar" gap={12} wrap align="flex-end">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="操作动作"
            style={{ width: 200 }}
            value={draft.action}
            options={actionOptions}
            onChange={(value) => setDraft({ ...draft, action: value })}
          />
          <Select
            allowClear
            placeholder="对象类型"
            style={{ width: 160 }}
            value={draft.target_type}
            options={targetOptions}
            onChange={(value) => setDraft({ ...draft, target_type: value })}
          />
          <Input
            allowClear
            placeholder="操作者 / 对象 ID"
            style={{ width: 220 }}
            value={draft.keyword}
            onChange={(event) => setDraft({ ...draft, keyword: event.target.value })}
            onPressEnter={apply}
          />
          <DatePicker.RangePicker
            showTime
            allowClear
            value={draft.range as [Dayjs, Dayjs]}
            onChange={(range) => setDraft({ ...draft, range })}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={apply}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setDraft({})
              setQuery({ page: 1, page_size: 20 })
            }}
          >
            重置
          </Button>
        </Flex>

        <QueryError error={logsQuery.error} onRetry={() => logsQuery.refetch()} />

        <Table
          rowKey="id"
          size="middle"
          loading={logsQuery.isPending}
          columns={columns}
          dataSource={logsQuery.data?.items ?? []}
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender: (record) => (
              <dl className="detail-grid">
                <dt>操作者</dt>
                <dd>
                  {record.actor_name || '系统'}
                  {record.actor_id ? ` · ${record.actor_id}` : ''}
                </dd>
                <dt>来源</dt>
                <dd>
                  {record.ip || '—'} · {record.user_agent || '未知设备'}
                </dd>
                <dt>详情</dt>
                <dd>{JSON.stringify(record.detail ?? {})}</dd>
              </dl>
            ),
          }}
          pagination={{
            current: pagination?.page ?? 1,
            pageSize: pagination?.page_size ?? 20,
            total: pagination?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => setQuery({ ...query, page, page_size: pageSize }),
          }}
        />
      </Card>
    </div>
  )
}
