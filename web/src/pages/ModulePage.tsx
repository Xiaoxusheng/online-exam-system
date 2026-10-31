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
          type="success"
          showIcon
          message="后端接口已就绪"
          description="页面骨架、路由与鉴权已接入；后端业务接口已实现并连接真实数据，前端交互与表单将在后续任务中接入。"
        />
        <div className="module-roadmap">
          <Steps
            size="small"
            current={2}
            items={[
              { title: '页面骨架', description: '路由、布局与鉴权' },
              { title: '接口实现', description: '真实数据已接入' },
              { title: '业务验收', description: `计划 ${meta.milestone}` },
            ]}
          />
        </div>
      </Card>

      <div className="section-head">
        <h2>能力规划</h2>
        <span className="section-head-meta">{meta.features.length} 项 · 接口已实现，页面待接入</span>
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
