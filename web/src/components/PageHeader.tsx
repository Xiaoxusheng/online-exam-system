import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  /** 已按产品要求移除全站副标题说明文字；参数保留仅为兼容既有调用。 */
  subtitle?: ReactNode
  extra?: ReactNode
}

export default function PageHeader({ title, extra }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        <h1 className="page-title">{title}</h1>
      </div>
      {extra && <div className="page-head-extra">{extra}</div>}
    </header>
  )
}
