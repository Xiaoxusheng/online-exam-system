import type { ReactNode } from 'react'
import { Skeleton } from 'antd'

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'purple'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: ReactNode
  unit?: string
  foot?: ReactNode
  tone?: StatTone
  loading?: boolean
}

/**
 * 指标卡：图标 + 灰色标签 + 彩色大数字。
 * 卡片彼此独立横排，不做「一个大卡里切格子」，避免多层描边。
 */
export default function StatCard({
  icon,
  label,
  value,
  unit,
  foot,
  tone = 'primary',
  loading = false,
}: StatCardProps) {
  return (
    <div className={`stat-card stat-card-accent-${tone}`}>
      <div className="stat-card-head">
        <span className="stat-card-icon">{icon}</span>
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="stat-card-value">
        {loading ? (
          <Skeleton.Input active size="small" style={{ width: 48, marginTop: 4 }} />
        ) : (
          <>
            {value}
            {unit && <span className="stat-card-unit">{unit}</span>}
          </>
        )}
      </div>
      {foot && !loading && <div className="stat-card-foot">{foot}</div>}
    </div>
  )
}
