import type { ReactNode } from 'react'
import { InboxOutlined } from '@ant-design/icons'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state empty-state-compact' : 'empty-state'}>
      <span className="empty-state-icon">{icon ?? <InboxOutlined />}</span>
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
