import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import { listNotificationTemplates } from '../../api/system'
import { queryKeys } from '../../api/queryKeys'
import { formatDateTime } from '../../utils/format'
import type { NotificationTemplate } from '../../types'

const channelLabels: Record<string, string> = { inapp: '站内消息', sms: '短信', email: '邮件' }

const columns: ColumnsType<NotificationTemplate> = [
  { title: '场景编码', dataIndex: 'code', width: 180, render: (value: string) => <code>{value}</code> },
  { title: '渠道', dataIndex: 'channel', width: 110, render: (value: string) => channelLabels[value] ?? value },
  { title: '标题模板', dataIndex: 'title_tpl' },
  { title: '正文模板', dataIndex: 'content_tpl', render: (value: string) => value || <span className="cell-meta">未配置</span> },
  {
    title: '状态',
    dataIndex: 'enabled',
    width: 90,
    render: (value: boolean) => (value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
  },
  { title: '更新时间', dataIndex: 'created_at', width: 170, render: (value: string) => formatDateTime(value) },
]

export default function NotificationSettingsPage() {
  const templatesQuery = useQuery({
    queryKey: queryKeys.notificationTemplates,
    queryFn: listNotificationTemplates,
  })

  return (
    <div>
      <PageHeader title="通知配置" subtitle="站内、短信与邮件模板；考试发布与成绩发布会自动生成站内通知。" />

      <Alert
        className="page-alert"
        type="info"
        showIcon
        message="当前仅站内通知自动发送"
        description="考试发布通知全体考生、成绩发布通知对应考生，重复发布不会重复发送。短信与邮件通道需要接入服务商，尚未实现；模板编辑与发送记录重试也在后续里程碑。"
      />

      <Card className="panel-card" variant="borderless">
        <QueryError error={templatesQuery.error} onRetry={() => templatesQuery.refetch()} />
        <Table
          rowKey="id"
          size="middle"
          loading={templatesQuery.isPending}
          columns={columns}
          dataSource={templatesQuery.data ?? []}
          pagination={false}
          scroll={{ x: 860 }}
          locale={{ emptyText: templatesQuery.isError ? ' ' : '尚未配置通知模板' }}
        />
      </Card>
    </div>
  )
}
