import type { CSSProperties, ReactNode } from 'react'
import { Card, Col, Row, Steps, Tag } from 'antd'
import {
  ApartmentOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  FileTextOutlined,
  FormOutlined,
  HistoryOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import type { ModuleIcon, ModuleMeta } from './moduleMeta'

const moduleIcons: Record<ModuleIcon, ReactNode> = {
  book: <BookOutlined />,
  paper: <FileTextOutlined />,
  calendar: <CalendarOutlined />,
  shield: <SafetyCertificateOutlined />,
  review: <FormOutlined />,
  score: <BarChartOutlined />,
  analytics: <LineChartOutlined />,
  users: <TeamOutlined />,
  org: <ApartmentOutlined />,
  audit: <HistoryOutlined />,
  bell: <BellOutlined />,
}

type AccentVars = CSSProperties & {
  '--accent': string
  '--accent-soft': string
}

export default function ModulePage({ meta }: { meta: ModuleMeta }) {
  const accentStyle = {
    '--accent': meta.accent,
    '--accent-soft': meta.accentSoft,
  } as AccentVars

  return (
    <div>
      <PageHeader
        eyebrow={`${meta.area} · 模块骨架`}
        title={meta.title}
        subtitle={meta.subtitle}
        extra={<Tag className="milestone-tag">{meta.milestone}</Tag>}
      />

      <section className="module-hero" style={accentStyle}>
        <div className="module-hero-main">
          <div className="module-hero-icon">{moduleIcons[meta.icon]}</div>
          <div>
            <div className="module-hero-status">
              <span className="status-dot" />
              骨架已就绪
            </div>
            <h2>页面与接口框架已接入</h2>
            <p>
              当前阶段已完成路由、布局与鉴权接入；列表接口返回空数据、写操作返回
              501。业务能力将按「{meta.milestone}」计划逐步落地。
            </p>
            <div className="module-chips">
              <span>
                <CheckCircleFilled /> 路由已接入
              </span>
              <span>
                <CheckCircleFilled /> 鉴权已生效
              </span>
              <span>
                <CheckCircleFilled /> 数据表已建立
              </span>
            </div>
          </div>
        </div>

        <div className="module-hero-roadmap">
          <Steps
            size="small"
            direction="vertical"
            current={1}
            items={[
              { title: '页面骨架', description: '路由、布局与鉴权' },
              { title: '接口实现', description: '数据模型就绪，接口待实现' },
              { title: '业务验收', description: `计划 ${meta.milestone}` },
            ]}
          />
        </div>
      </section>

      <div className="section-head">
        <div>
          <h2>能力规划</h2>
          <p>{meta.features.length} 项核心能力</p>
        </div>
        <span className="section-head-meta">按里程碑逐步交付</span>
      </div>

      <Row gutter={[16, 16]}>
        {meta.features.map((feature, index) => (
          <Col key={feature.title} xs={24} md={12} xl={8}>
            <Card className="feature-card" variant="borderless" style={accentStyle}>
              <div className="feature-top">
                <span className="feature-index">{String(index + 1).padStart(2, '0')}</span>
                <Tag className="feature-tag">规划中</Tag>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
