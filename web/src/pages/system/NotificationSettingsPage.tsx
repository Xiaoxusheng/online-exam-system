import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Flex, Form, Input, Modal, Select, Switch, Table, Tabs, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, MailOutlined, MobileOutlined, SendOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import {
  getNotificationChannels,
  listNotificationLogs,
  listNotificationTemplates,
  testNotificationChannel,
  updateNotificationTemplate,
  type NotificationChannelStatus,
  type NotificationLogParams,
} from '../../api/system'
import { queryKeys } from '../../api/queryKeys'
import { formatDateTime } from '../../utils/format'
import { errorText } from '../../utils/errors'
import type { NotificationLog, NotificationTemplate } from '../../types'

const channelLabels: Record<string, string> = { inapp: '站内消息', sms: '短信', email: '邮件' }

const codeHints: Record<string, string> = {
  exam_publish: '{exam} 考试名 · {start_at} 开始时间 · {end_at} 结束时间 · {duration} 限时分钟',
  score_publish: '{exam} 考试名 · {total} 得分',
  score_adjust: '{total} 更正后得分 · {before} 原得分',
  score_appeal: '{verdict} 处理结论 · {note} 处理说明 · {total} 当前得分',
  review_pending: '{exam} 考试名 · {count} 待阅份数',
}

const statusLabels: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: '待发送', color: 'gold', dot: 'runlog-dot-warning' },
  sent: { label: '已发送', color: 'green', dot: 'runlog-dot-success' },
  failed: { label: '发送失败', color: 'red', dot: 'runlog-dot-danger' },
  read: { label: '已读', color: 'blue', dot: 'runlog-dot-primary' },
}

const logStatusOptions = [
  { value: 'sent', label: '已发送' },
  { value: 'read', label: '已读' },
  { value: 'pending', label: '待发送' },
  { value: 'failed', label: '发送失败' },
]

function TemplatePanel() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<NotificationTemplate | null>(null)
  const [form] = Form.useForm<{ title_tpl: string; content_tpl: string }>()

  const templatesQuery = useQuery({
    queryKey: queryKeys.notificationTemplates,
    queryFn: listNotificationTemplates,
  })

  const mutation = useMutation({
    mutationFn: (values: { id: string; title_tpl: string; content_tpl: string }) =>
      updateNotificationTemplate(values.id, { title_tpl: values.title_tpl, content_tpl: values.content_tpl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationTemplates })
      setTarget(null)
      message.success('模板已保存，下一次通知即生效')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const toggleMutation = useMutation({
    mutationFn: (values: { id: string; enabled: boolean }) => updateNotificationTemplate(values.id, { enabled: values.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationTemplates }),
    onError: (error) => message.error(errorText(error)),
  })

  const columns: ColumnsType<NotificationTemplate> = [
    {
      title: '场景',
      key: 'code',
      width: 190,
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{codeLabels[record.code] ?? record.code}</span>
          <span className="cell-meta">
            <code>{record.code}</code> · {channelLabels[record.channel] ?? record.channel}
          </span>
        </div>
      ),
    },
    {
      title: '占位符',
      key: 'hint',
      width: 120,
      render: (_value, record) =>
        codeHints[record.code] ? (
          <Tooltip title={codeHints[record.code]}>
            <Tag className="soft-tag">可查看</Tag>
          </Tooltip>
        ) : (
          <span className="cell-meta">—</span>
        ),
    },
    { title: '标题模板', dataIndex: 'title_tpl', render: (value: string) => value || <span className="cell-meta">未配置</span> },
    {
      title: '正文模板',
      dataIndex: 'content_tpl',
      render: (value: string) => <span className="tpl-body">{value || <span className="cell-meta">未配置</span>}</span>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 78,
      render: (value: boolean, record) => (
        <Switch
          size="small"
          checked={value}
          loading={toggleMutation.isPending && toggleMutation.variables?.id === record.id}
          onChange={(checked) => toggleMutation.mutate({ id: record.id, enabled: checked })}
        />
      ),
    },
    { title: '更新时间', dataIndex: 'created_at', width: 170, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 88,
      render: (_value, record) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setTarget(record)
            form.setFieldsValue({ title_tpl: record.title_tpl, content_tpl: record.content_tpl })
          }}
        >
          编辑
        </Button>
      ),
    },
  ]

  return (
    <Card className="panel-card" variant="borderless">
      <QueryError error={templatesQuery.error} onRetry={() => templatesQuery.refetch()} />
      <Table
        rowKey="id"
        size="middle"
        loading={templatesQuery.isFetching}
        columns={columns}
        dataSource={templatesQuery.data ?? []}
        pagination={false}
        scroll={{ x: 980 }}
        locale={{ emptyText: templatesQuery.isError ? ' ' : '尚未配置通知模板' }}
      />

      <Modal
        open={Boolean(target)}
        title={target ? `编辑模板 · ${codeLabels[target.code] ?? target.code}` : '编辑模板'}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        confirmLoading={mutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setTarget(null)}
      >
        {target && (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => mutation.mutate({ id: target.id, title_tpl: values.title_tpl, content_tpl: values.content_tpl })}
          >
            <Alert className="page-alert" type="info" showIcon message="占位符" description={codeHints[target.code] ?? '该场景暂无可用占位符。'} />
            <Form.Item
              name="title_tpl"
              label="标题模板"
              rules={[
                { required: true, message: '标题不能为空' },
                { max: 80, message: '标题不超过 80 字' },
              ]}
            >
              <Input placeholder="例如：考试发布：{exam}" />
            </Form.Item>
            <Form.Item name="content_tpl" label="正文模板" rules={[{ max: 1000, message: '正文不超过 1000 字' }]}>
              <Input.TextArea rows={4} showCount maxLength={1000} placeholder="例如：考试时间 {start_at} 至 {end_at}，请按时参加。" />
            </Form.Item>
            <span className="cell-meta">未识别的占位符会被自动去掉；留空则回退到系统默认文案。</span>
          </Form>
        )}
      </Modal>
    </Card>
  )
}

const codeLabels: Record<string, string> = {
  exam_publish: '考试发布',
  score_publish: '成绩发布',
  score_adjust: '成绩更正',
  score_appeal: '成绩申诉结果',
  review_pending: '待阅提醒',
}

function DispatchLogPanel() {
  const [query, setQuery] = useState<NotificationLogParams>({ page: 1, page_size: 20 })

  const logsQuery = useQuery({ queryKey: queryKeys.notificationLogs(query), queryFn: () => listNotificationLogs(query) })
  const pagination = logsQuery.data?.pagination

  const columns: ColumnsType<NotificationLog> = [
    {
      title: '接收人',
      key: 'user',
      width: 160,
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.user_name}</span>
          <span className="cell-meta">{record.user_account}</span>
        </div>
      ),
    },
    {
      title: '标题',
      key: 'title',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.title}</span>
          <span className="cell-meta tpl-body">{record.content}</span>
        </div>
      ),
    },
    {
      title: '场景',
      dataIndex: 'source_type',
      width: 130,
      render: (value: string) => (value ? <Tag className="soft-tag">{codeLabels[value] ?? value}</Tag> : <span className="cell-meta">手动</span>),
    },
    { title: '渠道', dataIndex: 'channel', width: 100, render: (value: string) => channelLabels[value] ?? value },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => {
        const meta = statusLabels[value] ?? { label: value, dot: '', color: 'default' }
        return (
          <span className="runlog-cell">
            <span className={`runlog-dot ${meta.dot}`} />
            <span className="runlog-text">{meta.label}</span>
          </span>
        )
      },
    },
    { title: '发送时间', dataIndex: 'sent_at', width: 170, render: (value: string | null) => formatDateTime(value) },
    { title: '创建时间', dataIndex: 'created_at', width: 170, render: (value: string) => formatDateTime(value) },
  ]

  return (
    <Card className="panel-card" variant="borderless">
      <Flex className="filter-bar" gap={12} wrap align="flex-end">
        <Select
          allowClear
          placeholder="发送状态"
          style={{ width: 150 }}
          options={logStatusOptions}
          value={query.status}
          onChange={(value) => setQuery({ ...query, status: value, page: 1 })}
        />
        <Input.Search
          allowClear
          placeholder="标题 / 正文 / 接收人"
          style={{ width: 260 }}
          onSearch={(value) => setQuery({ ...query, keyword: value, page: 1 })}
        />
        <Button icon={<SendOutlined />} onClick={() => logsQuery.refetch()}>
          刷新
        </Button>
      </Flex>

      <QueryError error={logsQuery.error} onRetry={() => logsQuery.refetch()} />
      <Table
        rowKey="id"
        size="middle"
        loading={logsQuery.isFetching}
        columns={columns}
        dataSource={logsQuery.data?.items ?? []}
        scroll={{ x: 1160 }}
        pagination={{
          current: pagination?.page ?? 1,
          pageSize: pagination?.page_size ?? 20,
          total: pagination?.total ?? 0,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条发送记录`,
          onChange: (page, pageSize) => setQuery({ ...query, page, page_size: pageSize }),
        }}
        locale={{ emptyText: logsQuery.isError ? ' ' : '暂无发送记录' }}
      />
    </Card>
  )
}

function ChannelPanel() {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ channel: 'email' | 'sms'; code?: string; recipient?: string }>()

  const channelsQuery = useQuery({
    queryKey: queryKeys.notificationChannels,
    queryFn: getNotificationChannels,
  })
  const status: NotificationChannelStatus | undefined = channelsQuery.data

  const testMutation = useMutation({
    mutationFn: (values: { channel: 'email' | 'sms'; code?: string; recipient?: string }) =>
      testNotificationChannel(values),
    onSuccess: (result) => {
      if (result.status === 'sent') {
        message.success(`测试通知已发送至 ${result.recipient}`)
      } else if (result.status === 'simulated') {
        message.info(`短信网关未接入，已按模拟投递记录（${result.recipient}）`)
      } else {
        message.error(`发送失败：${result.detail ?? '未知原因'}`)
      }
    },
    onError: (error) => message.error(errorText(error)),
  })

  const channelCards = [
    {
      key: 'email',
      icon: <MailOutlined />,
      title: '邮件（SMTP）',
      desc: status?.email.configured
        ? 'SMTP 已配置，启用邮件模板后即随通知投递'
        : '未配置：设置 SMTP_HOST / SMTP_FROM 等环境变量后生效',
      ok: Boolean(status?.email.configured),
    },
    {
      key: 'sms',
      icon: <MobileOutlined />,
      title: '短信',
      desc:
        status?.sms.mode === 'gateway'
          ? '短信网关已接入，启用短信模板后即随通知投递'
          : status?.sms.mode === 'simulated'
            ? '网关未接入：投递按「模拟发送」记录，接入 SMS_API_URL 后自动转为真实下发'
            : '通知服务未启用外发通道',
      ok: status?.sms.mode === 'gateway',
      simulated: status?.sms.mode === 'simulated',
    },
  ]

  return (
    <Card className="panel-card" variant="borderless">
      <QueryError error={channelsQuery.error} onRetry={() => channelsQuery.refetch()} />
      <div className="channel-cards">
        {channelCards.map((item) => (
          <div className="channel-card" key={item.key}>
            <div className="channel-card-head">
              {item.icon}
              <strong>{item.title}</strong>
              {item.ok ? (
                <Tag color="green">已就绪</Tag>
              ) : item.simulated ? (
                <Tag color="gold">模拟投递</Tag>
              ) : (
                <Tag className="soft-tag">未配置</Tag>
              )}
            </div>
            <p className="cell-meta">{item.desc}</p>
          </div>
        ))}
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ channel: 'email', code: 'exam_publish' }}
        onFinish={(values) => testMutation.mutate(values)}
        style={{ maxWidth: 480, marginTop: 16 }}
      >
        <Form.Item name="channel" label="测试通道" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'email', label: '邮件' },
              { value: 'sms', label: '短信' },
            ]}
          />
        </Form.Item>
        <Form.Item name="code" label="使用模板">
          <Select
            options={Object.entries(codeLabels).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item
          name="recipient"
          label="接收邮箱 / 手机号"
          tooltip="留空则发给自己（取账号资料中的邮箱或手机号）"
        >
          <Input placeholder="选填" />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={testMutation.isPending}>
          发送测试通知
        </Button>
      </Form>
    </Card>
  )
}

export default function NotificationSettingsPage() {
  return (
    <div>
      <PageHeader title="通知配置" subtitle="维护站内通知文案、查看外发通道状态与全部发送记录。" />

      <Alert
        className="page-alert"
        type="info"
        showIcon
        message="模板如何生效"
        description="考试发布、成绩发布、成绩更正与申诉处理都会按场景编码取用启用的模板；模板留空或停用时回退到系统默认文案。同一场景对同一人不会重复发送；邮件与短信需先启用对应通道的模板才会外发。"
      />

      <Tabs
        items={[
          { key: 'templates', label: '模板管理', children: <TemplatePanel /> },
          { key: 'channels', label: '通道与测试', children: <ChannelPanel /> },
          { key: 'logs', label: '发送记录', children: <DispatchLogPanel /> },
        ]}
      />
    </div>
  )
}
