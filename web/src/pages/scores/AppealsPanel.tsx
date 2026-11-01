import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Flex, Form, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckCircleOutlined, MessageOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import QueryError from '../../components/QueryError'
import { handleAppeal, listAppeals, type AppealListParams } from '../../api/score'
import { queryKeys } from '../../api/queryKeys'
import { formatDateTime, formatScore } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { ScoreAppeal } from '../../types'

const statusMeta: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'gold' },
  accepted: { label: '已通过', color: 'green' },
  rejected: { label: '未通过', color: 'default' },
}

export default function AppealsPanel() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState<AppealListParams>({ status: 'pending', page: 1, page_size: 20 })
  const [target, setTarget] = useState<ScoreAppeal | null>(null)
  const [form] = Form.useForm<{ action: 'accepted' | 'rejected'; note: string }>()

  const appealsQuery = useQuery({ queryKey: queryKeys.appeals(query), queryFn: () => listAppeals(query) })
  const handleMutation = useMutation({
    mutationFn: (values: { id: string; action: 'accepted' | 'rejected'; note: string }) =>
      handleAppeal(values.id, values.action, values.note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['appeal'] })
      setTarget(null)
      form.resetFields()
      message.success(data.status === 'accepted' ? '申诉已通过，请补录成绩更正' : '申诉已驳回，考生会收到通知')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const columns: ColumnsType<ScoreAppeal> = [
    {
      title: '考生 / 考试',
      key: 'candidate',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.user_name}</span>
          <span className="cell-meta">
            {record.exam_title} · 当前 {formatScore(record.total, 2)} 分
          </span>
        </div>
      ),
    },
    {
      title: '申诉内容',
      key: 'reason',
      render: (_value, record) => (
        <div className="cell-stack">
          <Tooltip title={record.reason}>
            <span className="cell-title cell-ellipsis">{record.reason}</span>
          </Tooltip>
          <span className="cell-meta">{record.question_id ? `第 ${record.question_id.slice(0, 8)} 题` : '整份答卷'}</span>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => {
        const meta = statusMeta[value] ?? { label: value, color: 'default' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '处理结果',
      key: 'handled',
      width: 200,
      render: (_value, record) =>
        record.status === 'pending' ? (
          <span className="cell-meta">待处理</span>
        ) : (
          <div className="cell-stack">
            <span className="cell-title">{record.handle_note}</span>
            <span className="cell-meta">
              {record.handler_name} · {formatDateTime(record.handled_at)}
            </span>
          </div>
        ),
    },
    { title: '提交时间', dataIndex: 'created_at', width: 170, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 96,
      fixed: 'right',
      render: (_value, record) =>
        record.status === 'pending' ? (
          <Button
            type="link"
            size="small"
            icon={<MessageOutlined />}
            onClick={() => {
              setTarget(record)
              form.setFieldsValue({ action: 'rejected', note: '' })
            }}
          >
            处理
          </Button>
        ) : (
          <span className="cell-meta">已闭环</span>
        ),
    },
  ]

  const pagination = appealsQuery.data?.pagination

  return (
    <Card className="panel-card" variant="borderless">
      <Flex className="filter-bar" gap={12} wrap align="flex-end">
        <Select
          placeholder="处理状态"
          style={{ width: 150 }}
          value={query.status}
          options={[
            { value: 'pending', label: '待处理' },
            { value: 'accepted', label: '已通过' },
            { value: 'rejected', label: '未通过' },
          ]}
          onChange={(value) => setQuery({ ...query, status: value, page: 1 })}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setQuery({ status: 'pending', page: 1, page_size: 20 })
            appealsQuery.refetch()
          }}
        >
          刷新
        </Button>
        <Tooltip title="申诉通过后请回到“成绩明细”补录分数更正，系统会留痕并通知考生。">
          <span className="cell-meta">
            <SearchOutlined /> 处理入口仅考务管理员可见
          </span>
        </Tooltip>
      </Flex>

      <QueryError error={appealsQuery.error} onRetry={() => appealsQuery.refetch()} />

      <Table
        rowKey="id"
        size="middle"
        loading={appealsQuery.isPending}
        columns={columns}
        dataSource={appealsQuery.data?.items ?? []}
        scroll={{ x: 1020 }}
        pagination={{
          current: pagination?.page ?? 1,
          pageSize: pagination?.page_size ?? 20,
          total: pagination?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条申诉`,
          onChange: (page, pageSize) => setQuery({ ...query, page, page_size: pageSize }),
        }}
        locale={{ emptyText: appealsQuery.isError ? ' ' : '当前筛选下没有申诉' }}
      />

      <Modal
        open={Boolean(target)}
        title={target ? `处理 ${target.user_name} 的成绩申诉` : '处理成绩申诉'}
        okText="提交处理结果"
        cancelText="取消"
        destroyOnHidden
        confirmLoading={handleMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setTarget(null)}
      >
        {target && (
          <>
            <div className="appeal-context">
              <div className="appeal-context-row">
                <span className="appeal-context-label">考试</span>
                <span>{target.exam_title}</span>
              </div>
              <div className="appeal-context-row">
                <span className="appeal-context-label">当前得分</span>
                <span className="score-value">{formatScore(target.total, 2)} 分</span>
              </div>
              <div className="appeal-context-row">
                <span className="appeal-context-label">申诉理由</span>
                <span>{target.reason}</span>
              </div>
            </div>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ action: 'rejected', note: '' }}
              onFinish={(values) => handleMutation.mutate({ id: target.id, ...values })}
            >
              <Form.Item name="action" label="处理结果" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'rejected', label: '不通过（维持原分）' },
                    { value: 'accepted', label: '通过（需补录更正）' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="note"
                label="给考生的说明"
                rules={[
                  { required: true, message: '请填写处理说明' },
                  { max: 300, message: '说明不超过 300 字' },
                ]}
              >
                <Input.TextArea rows={4} placeholder="例如：复核后该题答案与标准答案一致，维持原分。" showCount maxLength={300} />
              </Form.Item>
              <Space>
                <CheckCircleOutlined style={{ color: '#8a94a6' }} />
                <span className="cell-meta">处理结果会以站内通知发送给考生，并写入审计日志。</span>
              </Space>
            </Form>
          </>
        )}
      </Modal>
    </Card>
  )
}
