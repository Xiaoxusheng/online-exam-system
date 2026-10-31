import { Card, Col, Row, Tag } from 'antd'
import { BuildOutlined } from '@ant-design/icons'
import type { ModuleMeta } from './moduleMeta'

export default function ModulePage({ meta }: { meta: ModuleMeta }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{meta.title}</h1>
          <p className="page-subtitle">{meta.subtitle}</p>
        </div>
        <Tag color="blue" style={{ marginTop: 6 }}>
          {meta.milestone}
        </Tag>
      </div>

      <Card className="module-banner" variant="borderless">
        <div className="module-banner-icon">
          <BuildOutlined />
        </div>
        <div>
          <div className="module-banner-title">页面与接口骨架已就绪</div>
          <div className="module-banner-text">
            当前阶段已完成路由、页面框架与鉴权接入：列表接口返回空数据，写操作返回
            501。业务能力将按「{meta.milestone}」计划逐步落地。
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        {meta.features.map((feature, index) => (
          <Col key={feature.title} xs={24} md={12} xl={8}>
            <Card className="feature-card" variant="borderless">
              <span className="feature-index">{String(index + 1).padStart(2, '0')}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
