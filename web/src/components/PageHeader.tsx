import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  extra?: ReactNode
}

export default function PageHeader({ eyebrow, title, subtitle, extra }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {extra && <div className="page-head-extra">{extra}</div>}
    </header>
  )
}
