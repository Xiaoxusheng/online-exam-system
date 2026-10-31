import { Alert, Button } from 'antd'
import { errorText, isForbidden } from '../utils/errors'

interface QueryErrorProps {
  error: unknown
  onRetry?: () => void
  emptyHint?: string
}

/** Error state for a failed query: a readable message plus a retry action. */
export default function QueryError({ error, onRetry, emptyHint }: QueryErrorProps) {
  if (!error) return null
  return (
    <Alert
      className="query-error"
      type={isForbidden(error) ? 'warning' : 'error'}
      showIcon
      message={isForbidden(error) ? '无权查看' : '加载失败'}
      description={emptyHint ? `${errorText(error)}。${emptyHint}` : errorText(error)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
    />
  )
}
