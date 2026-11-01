import type { ReactNode } from 'react'
import { Col, Row, Statistic } from 'antd'

export type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'violet'

export interface MetricItem {
  label: string
  value: number | string
  decimals?: number
  suffix?: ReactNode
  prefix?: ReactNode
  tone?: MetricTone
}

interface MetricGridProps {
  items: MetricItem[]
  /** 响应式列数：xs / sm / md / xl */
  columns?: { xs?: number; sm?: number; md?: number; xl?: number }
}

/**
 * 指标栅格：用 antd Row / Col / Statistic 组成。
 * 单元之间靠 1px 细线分隔，不叠加多层描边。
 */
export default function MetricGrid({
  items,
  columns = { xs: 1, sm: 2, md: 3, xl: 4 },
}: MetricGridProps) {
  return (
    <Row gutter={0} className="metric-grid">
      {items.map((item) => (
        <Col key={item.label} {...columns} className="metric-col">
          <div className={`metric-cell metric-tone-${item.tone ?? 'default'}`}>
            <Statistic
              title={item.label}
              value={item.value}
              precision={item.decimals}
              suffix={item.suffix}
              prefix={item.prefix}
              valueStyle={{ fontSize: 19, fontWeight: 600 }}
            />
          </div>
        </Col>
      ))}
    </Row>
  )
}
