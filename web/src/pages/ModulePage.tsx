import { Alert, Card, Steps, Tag } from 'antd'
import PageHeader from '../components/PageHeader'
import type { ModuleMeta } from './moduleMeta'

export default function ModulePage({ meta }: { meta: ModuleMeta }) {
  return (
    <div>
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        extra={<Tag className="milestone-tag">{meta.milestone}</Tag>}
      />

      <Card className="panel-card" variant="borderless">
        <Alert
          className="module-alert"
          type="info"
          showIcon
          message="该模块处于骨架阶段"
          description="页面、路由与鉴权已接入；列表接口返回空数据，写操作返回 501 NOT_IMPLEMENTED。业务能力将按里程碑计划逐步交付。"
        />
        <div className="module-roadmap">
          <Steps
            size="small"
            current={1}
            items={[
              { title: '页面骨架', description: '路由、布局与鉴权' },
              { title: '接口实现', description: '数据模型就绪，接口待实现' },
              { title: '业务验收', description: `计划 ${meta.milestone}` },
            ]}
          />
        </div>
      </Card>

      <div className="section-head">
        <h2>能力规划</h2>
        <span className="section-head-meta">{meta.features.length} 项 · 按里程碑逐步交付</span>
      </div>

      <Card className="panel-card" variant="borderless">
        <div className="feature-grid">
          {meta.features.map((feature) => (
            <div className="feature-item" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
