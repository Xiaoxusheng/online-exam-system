import type { ReactNode } from 'react'
import { Card, Flex, Statistic } from 'antd'
import AnimatedNumber from './AnimatedNumber'

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'violet'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: number
  decimals?: number
  unit?: string
  foot?: ReactNode
  tone?: StatTone
  loading?: boolean
}

/**
 * 指标卡：图标 + 灰标签 + 彩色大数字。
 * 结构交给 antd Statistic（title / value / suffix / loading），
 * 这里只补图标色块与脚注。
 */
export default function StatCard({
  icon,
  label,
  value,
  decimals = 0,
  unit,
  foot,
  tone = 'primary',
  loading = false,
}: StatCardProps) {
  return (
    <Card className={`stat-card stat-card-accent-${tone}`} variant="borderless" loading={loading}>
      <Statistic
        title={
          <Flex align="center" gap={8}>
            <span className="stat-card-icon">{icon}</span>
            <span className="stat-card-label">{label}</span>
          </Flex>
        }
        value={value}
        suffix={unit ? <span className="stat-card-unit">{unit}</span> : undefined}
        valueStyle={{ color: 'var(--stat-accent)' }}
        formatter={(current) => <AnimatedNumber value={Number(current)} decimals={decimals} />}
      />
      {foot && !loading && <div className="stat-card-foot">{foot}</div>}
    </Card>
  )
}
