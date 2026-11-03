import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Pagination, Skeleton } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import QueryError from '../components/QueryError'
import EmptyState from '../components/EmptyState'
import { listNotifications, markNotificationRead } from '../api/notification'
import { queryKeys } from '../api/queryKeys'
import { formatDateTime } from '../utils/format'
import { errorText } from '../utils/errors'

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
      <PageHeader title="我的通知" />

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
          <div className="notice-list">
            {items.map((item) => {
              const unread = item.status !== 'read'
              return (
                <div key={item.id} className={unread ? 'notice-card is-unread' : 'notice-card'}>
                  <div className="notice-card-head">
                    {unread && <span className="notice-dot" />}
                    <span className="notice-card-title" title={item.title}>
                      {item.title}
                    </span>
                    <span className="notice-card-time">{formatDateTime(item.created_at)}</span>
                    {unread ? (
                      <Button
                        type="link"
                        size="small"
                        loading={readMutation.isPending && readMutation.variables === item.id}
                        onClick={() => readMutation.mutate(item.id)}
                      >
                        标记已读
                      </Button>
                    ) : (
                      <span className="notice-read-state">已读</span>
                    )}
                  </div>
                  <p className="notice-card-body">{item.content}</p>
                </div>
              )
            })}
          </div>
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
