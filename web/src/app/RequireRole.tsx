import type { ReactNode } from 'react'
import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { roleLabel } from '../utils/labels'
import { canAccess } from './permissions'

export default function RequireRole({ path, children }: { path: string; children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role)

  if (canAccess(role, path)) {
    return <>{children}</>
  }

  return (
    <Result
      status="403"
      title="无访问权限"
      subTitle={`当前角色为${roleLabel(role)}，该页面不在你的工作范围内。`}
      extra={
        <Button type="primary">
          <Link to="/">返回工作台</Link>
        </Button>
      }
    />
  )
}
