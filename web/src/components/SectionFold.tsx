import type { ReactNode } from 'react'
import { Collapse } from 'antd'

export interface SectionFoldItem {
  key: string
  title: ReactNode
  extra?: ReactNode
  children: ReactNode
}

interface SectionFoldProps {
  items: SectionFoldItem[]
  /** 默认展开的分区 key；不传则全部收起 */
  defaultActiveKey?: string[]
}

/**
 * 「小标题 + 折叠」分区容器：安静型 B 端分区头——
 * 灰色小标题 + 右侧细箭头 + 分区之间细分隔线。
 * 结构由 antd Collapse 承担，样式统一在 design-v2.css 的 .section-fold 段。
 */
export default function SectionFold({ items, defaultActiveKey }: SectionFoldProps) {
  return (
    <Collapse
      className="section-fold"
      ghost
      expandIconPosition="end"
      defaultActiveKey={defaultActiveKey}
      items={items.map((item) => ({
        key: item.key,
        label: item.title,
        extra: item.extra,
        children: item.children,
      }))}
    />
  )
}
