import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Badge, Button, Card, Flex, List, Pagination, Skeleton, Space, Tag } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import QueryError from '../components/QueryError'
import EmptyState from '../components/EmptyState'
import { listNotifications, markNotificationRead } from '../api/notification'
import { queryKeys } from '../api/queryKeys'
import { formatDateTime } from '../utils/format'
import { errorText } from '../utils/errors'

const sourceLabels: Record<string, string> = {
  exam_publish: '考试发布',
  score_publish: '成绩发布',
}

export default function NotificationsPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 10

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications({ page, page_size: pageSize }),
    queryFn: () => listNotifications(page, pageSize),
  })

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification', 'list'] }),
    onError: (error) => message.error(errorText(error)),
  })

  const items = notificationsQuery.data?.items ?? []
  const total = notificationsQuery.data?.pagination.total ?? 0

  return (
    <div>
      <PageHeader title="我的通知" subtitle="考试安排、阅卷任务与成绩发布提醒。" />

      <Card className="panel-card" variant="borderless">
        <QueryError error={notificationsQuery.error} onRetry={() => notificationsQuery.refetch()} />

        {notificationsQuery.isPending ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellOutlined />}
            title="暂无通知"
            description="考试发布、成绩发布等关键节点会自动给你发送站内通知。"
          />
        ) : (
          <List
            className="notice-feed"
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                className={item.status !== 'read' ? 'notice-feed-item notice-unread' : 'notice-feed-item'}
                actions={
                  item.status !== 'read'
                    ? [
                        <Button
                          key="read"
                          type="link"
                          size="small"
                          loading={readMutation.isPending && readMutation.variables === item.id}
                          onClick={() => readMutation.mutate(item.id)}
                        >
                          标记已读
                        </Button>,
                      ]
                    : []
                }
              >
                <List.Item.Meta
                  title={
                    <Flex align="center" gap={8}>
                      {item.status !== 'read' && <Badge status="processing" />}
                      <span>{item.title}</span>
                    </Flex>
                  }
                  description={
                    <Space direction="vertical" size={2}>
                      <span className="notice-feed-body">{item.content}</span>
                      <span className="notice-feed-time">{formatDateTime(item.created_at)}</span>
                    </Space>
                  }
                />
                {sourceLabels[item.source_type] && (
                  <Tag className="soft-tag">{sourceLabels[item.source_type]}</Tag>
                )}
              </List.Item>
            )}
          />
        )}

        {total > pageSize && (
          <div className="table-pagination">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger={false}
              onChange={(next) => setPage(next)}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
