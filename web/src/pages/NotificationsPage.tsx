import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Pagination, Tag } from 'antd'
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
          <div className="notice-loading">加载中…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellOutlined />}
            title="暂无通知"
            description="考试发布、成绩发布等关键节点会自动给你发送站内通知。"
          />
        ) : (
          <ul className="notice-feed">
            {items.map((item) => (
              <li key={item.id} className={item.status !== 'read' ? 'notice-feed-item notice-unread' : 'notice-feed-item'}>
                <div className="notice-feed-head">
                  <h3>{item.title}</h3>
                  {sourceLabels[item.source_type] && <Tag className="soft-tag">{sourceLabels[item.source_type]}</Tag>}
                </div>
                <p className="notice-feed-body">{item.content}</p>
                <div className="notice-feed-foot">
                  <span>{formatDateTime(item.created_at)}</span>
                  {item.status !== 'read' && (
                    <Button
                      type="link"
                      size="small"
                      loading={readMutation.isPending && readMutation.variables === item.id}
                      onClick={() => readMutation.mutate(item.id)}
                    >
                      标记已读
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
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
