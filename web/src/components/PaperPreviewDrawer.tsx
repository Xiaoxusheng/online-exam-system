import { useState } from 'react'
import { Alert, Button, Card, Drawer, Empty, Space, Switch, Tag } from 'antd'
import { QuestionTryIt } from './QuestionTryIt'
import { formatScore } from '../utils/format'
import { questionTypeLabel } from '../utils/labels'
import type { PaperDetail } from '../types'

interface PaperPreviewDrawerProps {
  open: boolean
  paper: PaperDetail | null
  onClose: () => void
}

/**
 * 试卷预览与教师试做（P-05）：考试视角逐题渲染，
 * 试做模式本地判分（客观题），不入 attempts、不影响成绩。
 */
export default function PaperPreviewDrawer({ open, paper, onClose }: PaperPreviewDrawerProps) {
  const [tryMode, setTryMode] = useState(false)
  const [tried, setTried] = useState(false)

  return (
    <Drawer
      open={open}
      width={720}
      destroyOnHidden
      title={paper ? `试卷预览 · ${paper.title}` : '试卷预览'}
      onClose={() => {
        setTryMode(false)
        setTried(false)
        onClose()
      }}
      extra={
        <Space>
          <Switch
            checkedChildren="试做"
            unCheckedChildren="预览"
            checked={tryMode}
            onChange={(checked) => {
              setTryMode(checked)
              setTried(false)
            }}
          />
          {tryMode && (
            <Button
              size="small"
              type="primary"
              onClick={() => setTried(true)}
              disabled={!paper || paper.questions.length === 0}
            >
              出结果
            </Button>
          )}
        </Space>
      }
    >
      {paper && paper.type === 'random' && (
        <Alert
          type="info"
          showIcon
          message="随机卷：按抽题规则在发布时为本场考试抽取题目，考生卷面以考试快照为准"
          style={{ marginBottom: 16 }}
        />
      )}
      {paper && paper.type === 'ab' && (
        <Alert type="info" showIcon message="AB 卷：A/B 两组题目各发一半考生，预览中同时展示两组" style={{ marginBottom: 16 }} />
      )}

      {paper && paper.questions.length === 0 && paper.type !== 'random' && (
        <Empty description="该试卷还没有题目" />
      )}

      {paper &&
        paper.questions.map((question, index) => (
          <Card
            key={question.question_id}
            className="paper-preview-card"
            size="small"
            title={
              <span className="ppq-title">
                <span className="ppq-index">第 {index + 1} 题</span>
                {question.section && <span className="ppq-section">{question.section}</span>}
              </span>
            }
            extra={
              <span className="ppq-extra">
                <Tag className="soft-tag">{questionTypeLabel(question.type)}</Tag>
                <span className="ppq-score">{formatScore(question.score, 1)} 分</span>
              </span>
            }
          >
            <QuestionTryIt
              type={question.type}
              content={question.content}
              answer={question.answer}
              score={question.score}
              hideHead
            />
            <div className="ppq-meta">
              <Tag className="soft-tag">{question.paper_group} 组</Tag>
              <Tag className="soft-tag">{question.difficulty || '未标难度'}</Tag>
              {question.knowledge_point && <Tag className="soft-tag">{question.knowledge_point}</Tag>}
            </div>
          </Card>
        ))}

      {paper && tryMode && tried && (
        <Alert
          type="success"
          showIcon
          message="试做完成"
          description={
            <span>
              {(() => {
                const gradable = paper.questions.filter((q) => ['single', 'judge', 'multiple', 'fill'].includes(q.type))
                if (gradable.length === 0) {
                  return '本卷没有可本地判分的客观题；主观题请对照上方参考答案自查。'
                }
                return `客观题 ${gradable.length} 道的对错已在每题下方标出；主观题请对照参考答案与评分要点自查。`
              })()}
            </span>
          }
          style={{ marginTop: 16 }}
        />
      )}

      {paper && (
        <div style={{ marginTop: 16 }}>
          <span className="cell-meta">
            共 {paper.question_count} 题 · 总分 {formatScore(paper.total_score, 1)} 分 · v{paper.version}
          </span>
        </div>
      )}
    </Drawer>
  )
}
