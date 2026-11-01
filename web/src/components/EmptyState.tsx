import type { ReactNode } from 'react'
import { Button, Empty } from 'antd'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}

/**
 * 空状态：统一使用 antd Empty。
 * 传入 icon 时作为 Empty 的插图，页面不再各自手绘空态图形。
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state empty-state-compact' : 'empty-state'}>
      <Empty
        image={icon ?? Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span className="empty-state-text">
            <span className="empty-state-title">{title}</span>
            {description && <span className="empty-state-desc">{description}</span>}
          </span>
        }
      />
      {action && (
        <div className="empty-state-action">
          {typeof action === 'string' ? <Button type="primary">{action}</Button> : action}
        </div>
      )}
    </div>
  )
}

/** 供页面直接引用的简洁插图（antd 内置），用于「没有自定义图标」的空态。 */
export const EMPTY_IMAGE_SIMPLE = Empty.PRESENTED_IMAGE_SIMPLE
