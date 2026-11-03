import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Alert, Button, Card, Flex, Input, Space, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ClearOutlined, DownloadOutlined } from '@ant-design/icons'
import PageHeader from '../../components/PageHeader'
import QueryError from '../../components/QueryError'
import MetricGrid from '../../components/MetricGrid'
import {
  anonymizeUser,
  cleanupStorage,
  exportUserData,
  getMonitorStats,
  getStorageStats,
} from '../../api/system'
import { listUsers } from '../../api/org'
import { queryKeys } from '../../api/queryKeys'
import { errorText } from '../../utils/errors'

const purposeLabels: Record<string, string> = {
  question_asset: '题干配图',
  answer_media: '考生音视频',
  branding: '品牌素材',
  proctor_snapshot: '监考抓拍',
  other: '其他',
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function MonitorTab() {
  const statsQuery = useQuery({ queryKey: queryKeys.systemMonitor, queryFn: getMonitorStats })
  if (statsQuery.isPending) return <Card className="panel-card" variant="borderless" loading />
  if (statsQuery.isError) return <QueryError error={statsQuery.error} onRetry={() => statsQuery.refetch()} />
  const stats = statsQuery.data
  return (
    <>
      <Card className="panel-card" variant="borderless">
        <MetricGrid
          items={[
            { label: '在考答卷', value: stats.overview.attempts_in_progress },
            { label: '24h 已交卷', value: stats.attempts_submitted_24h },
            { label: '24h 新增告警', value: stats.proctor_events_24h, tone: stats.proctor_events_24h > 0 ? 'warning' : 'default' },
            { label: '未处置告警', value: stats.unhandled_proctor_events, tone: stats.unhandled_proctor_events > 0 ? 'danger' : 'default' },
            { label: '活跃账号', value: stats.overview.users },
            { label: '24h 登录失败', value: stats.failed_logins_24h, tone: stats.failed_logins_24h > 10 ? 'warning' : 'default' },
            { label: '24h 通知失败', value: stats.notifications_failed_24h, tone: stats.notifications_failed_24h > 0 ? 'warning' : 'default' },
            { label: '进行中场次', value: stats.overview.exams_in_progress },
          ]}
        />
      </Card>
      <Card className="panel-card" variant="borderless" size="small">
        <span className="cell-meta">
          指标每 30 秒随查询刷新；到期收卷等后台任务同样每 30 秒执行一次。异常持续出现请查看服务日志。
        </span>
      </Card>
    </>
  )
}

function StorageTab() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const statsQuery = useQuery({ queryKey: queryKeys.systemStorage, queryFn: getStorageStats })
  const cleanupMutation = useMutation({
    mutationFn: cleanupStorage,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemStorage })
      message.success(result.purged > 0 ? `已清理 ${result.purged} 个已删除文件` : '没有待清理的文件')
    },
    onError: (error) => message.error(errorText(error)),
  })

  const columns: ColumnsType<{ purpose: string; count: number; size_bytes: number }> = [
    { title: '用途', dataIndex: 'purpose', render: (value: string) => purposeLabels[value] ?? value },
    { title: '文件数', dataIndex: 'count', width: 120 },
    { title: '占用', dataIndex: 'size_bytes', width: 140, render: (value: number) => formatBytes(value) },
  ]

  return (
    <>
      <Card className="panel-card" variant="borderless">
        <QueryError error={statsQuery.error} onRetry={() => statsQuery.refetch()} />
        <Flex justify="space-between" align="flex-start" gap={16} style={{ marginBottom: 12 }}>
          <div>
            <span className="cell-title">媒体存储用量</span>
            <div className="cell-meta" style={{ marginTop: 4 }}>
              {statsQuery.data && (
                <>
                  在用 {statsQuery.data.active_count} 个文件 · 共 {formatBytes(statsQuery.data.buckets.reduce((total, bucket) => total + bucket.size_bytes, 0))}
                  {statsQuery.data.deleted_pending > 0 && ` · 待清理 ${statsQuery.data.deleted_pending} 个`}
                </>
              )}
            </div>
          </div>
          <Button
            icon={<ClearOutlined />}
            loading={cleanupMutation.isPending}
            disabled={!statsQuery.data || statsQuery.data.deleted_pending === 0}
            onClick={() => cleanupMutation.mutate()}
          >
            清理已删除文件
          </Button>
        </Flex>
        <Table
          rowKey="purpose"
          size="small"
          columns={columns}
          dataSource={statsQuery.data?.buckets ?? []}
          pagination={false}
          locale={{ emptyText: '还没有上传过媒体文件' }}
        />
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="「清理」仅删除已被删除（软删）文件的磁盘内容与元数据；在用文件不受影响。动作会写入审计日志。"
        />
      </Card>
    </>
  )
}

function ComplianceTab() {
  const { message, modal } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const usersQuery = useQuery({
    queryKey: queryKeys.users({ keyword, page, page_size: 10 }),
    queryFn: () => listUsers({ keyword, page, page_size: 10 }),
  })

  async function handleExport(userId: string, name: string) {
    setExporting(true)
    try {
      const data = await exportUserData(userId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `user-${name || userId}-data.json`
      anchor.click()
      URL.revokeObjectURL(url)
      message.success('个人数据已导出')
    } catch (error) {
      message.error(errorText(error))
    } finally {
      setExporting(false)
    }
  }

  function confirmAnonymize(userId: string, name: string) {
    modal.confirm({
      title: `注销 ${name} 的个人信息？`,
      content:
        '账号将停用，姓名/账号/手机号/邮箱被脱敏替换；考试与成绩记录按教学数据保留要求原样保留，动作写入审计日志。该操作不可逆。',
      okText: '确认注销',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await anonymizeUser(userId)
          message.success('已注销并脱敏该账号')
          usersQuery.refetch()
        } catch (error) {
          message.error(errorText(error))
        }
      },
    })
  }

  const columns: ColumnsType<{ id: string; name: string; username: string; role: string; status: string }> = [
    {
      title: '用户',
      key: 'name',
      render: (_value, record) => (
        <div className="cell-stack">
          <span className="cell-title">{record.name}</span>
          <span className="cell-meta">{record.username}</span>
        </div>
      ),
    },
    { title: '角色', dataIndex: 'role', width: 110, render: () => '考生' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => (value === 'active' ? <Tag color="green">启用</Tag> : <Tag>{value === 'anonymized' ? '已注销' : '停用'}</Tag>),
    },
    {
      title: '合规操作',
      key: 'ops',
      width: 220,
      render: (_value, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={() => handleExport(record.id, record.name)}
          >
            导出数据
          </Button>
          {record.role === 'student' && record.status === 'active' && (
            <Button type="link" size="small" danger onClick={() => confirmAnonymize(record.id, record.name)}>
              注销脱敏
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card className="panel-card" variant="borderless">
      <Flex className="filter-bar" gap={12} wrap align="flex-end">
        <Input
          allowClear
          placeholder="考生姓名 / 用户名 / 手机号"
          style={{ width: 260 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={() => setPage(1)}
        />
      </Flex>
      <Table
        rowKey="id"
        size="middle"
        loading={usersQuery.isFetching}
        columns={columns}
        dataSource={usersQuery.data?.items ?? []}
        scroll={{ x: 640 }}
        pagination={{
          current: usersQuery.data?.pagination.page ?? 1,
          pageSize: usersQuery.data?.pagination.page_size ?? 10,
          total: usersQuery.data?.pagination.total ?? 0,
          showSizeChanger: false,
          onChange: (next) => setPage(next),
        }}
        locale={{ emptyText: '没有符合条件的考生' }}
      />
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message="导出包含该考生的账号信息、答卷、成绩、通知与相关审计记录（JSON 文件）；注销脱敏会停用账号并抹除个人身份信息，考试与成绩记录保留。"
      />
    </Card>
  )
}

export default function SystemOpsPage() {
  return (
    <div>
      <PageHeader title="运维中心" subtitle="运行监控、媒体存储用量与个人数据合规。仅供机构管理员使用。" />
      <Tabs
        items={[
          { key: 'monitor', label: '运行监控', children: <MonitorTab /> },
          { key: 'storage', label: '存储管理', children: <StorageTab /> },
          { key: 'compliance', label: '数据合规', children: <ComplianceTab /> },
        ]}
      />
    </div>
  )
}
