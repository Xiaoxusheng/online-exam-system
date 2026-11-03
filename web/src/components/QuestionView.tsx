import { Tag } from 'antd'
import { mediaContentUrl } from '../api/media'
import { questionTypeLabel } from '../utils/labels'
import type { QuestionContent, QuestionType } from '../types'

interface ContentProps {
  type: QuestionType
  content: QuestionContent
  maxScore?: number
  section?: string
  /** 选项已由可作答的行渲染时（试做/预览），隐藏只读选项列表，避免同一组选项出现两遍。 */
  hideOptions?: boolean
  /** 外层容器（试卷预览卡片头）已给出题型与分值时，不再重复渲染题头。 */
  hideHead?: boolean
}

/** Read-only rendering of a question body, shared by review and score detail. */
export function QuestionContent({ type, content, maxScore, section, hideOptions, hideHead }: ContentProps) {
  const options = Array.isArray(content?.options) ? content.options : []
  const cases = Array.isArray(content?.cases) ? content.cases : []
  const attachments = Array.isArray(content?.attachments) ? content.attachments : []
  return (
    <div className="question-view">
      {!hideHead && (
        <div className="question-view-head">
          {section && <Tag className="soft-tag">{section}</Tag>}
          <Tag className="soft-tag">{questionTypeLabel(type)}</Tag>
          {maxScore !== undefined && <span className="cell-meta">本题 {maxScore} 分</span>}
        </div>
      )}
      <p className="question-stem">{content?.stem || '（无题干）'}</p>
      {content?.stem_image && (
        <div className="question-stem-image">
          <img src={mediaContentUrl(content.stem_image)} alt="题干配图" />
        </div>
      )}
      {attachments.length > 0 && (
        <div className="question-attachments">
          {attachments.map((item) =>
            item.kind === 'video' ? (
              <video key={item.media_id} controls preload="metadata" src={mediaContentUrl(item.media_id)} />
            ) : (
              <audio key={item.media_id} controls preload="metadata" src={mediaContentUrl(item.media_id)} />
            ),
          )}
        </div>
      )}
      {options.length > 0 && !hideOptions && (
        <ul className="option-list">
          {options.map((option) => (
            <li key={option.key}>
              <span className="option-key">{option.key}</span>
              {option.text}
            </li>
          ))}
        </ul>
      )}
      {type === 'programming' && Array.isArray(content?.languages) && content.languages.length > 0 && (
        <p className="question-extra">允许语言：{content.languages.join('、')}</p>
      )}
      {type === 'programming' && cases.length > 0 && (
        <div className="question-extra">
          测试用例（考生可见 {cases.filter((item) => !item.hidden).length} / 共 {cases.length}）
          <ul className="case-list">
            {cases
              .filter((item) => !item.hidden)
              .map((item, index) => (
                <li key={index}>
                  <code>输入：{item.input || '—'}</code>
                  <code>期望：{item.output || '—'}</code>
                </li>
              ))}
          </ul>
        </div>
      )}
      {type === 'media' && (
        <p className="question-extra">
          {content?.mode === 'video' ? '视频作答' : '口头作答（录音）'}
          {typeof content?.min_seconds === 'number' && typeof content?.max_seconds === 'number' &&
            ` · 时长 ${content.min_seconds}–${content.max_seconds} 秒`}
          {typeof content?.retake_limit === 'number' && ` · 最多重录 ${content.retake_limit} 次`}
          {Array.isArray(content?.dimensions) && content.dimensions.length > 0 &&
            ` · 评分维度：${content.dimensions.map((item) => `${item.name} ${item.weight}%`).join('、')}`}
        </p>
      )}
    </div>
  )
}

interface AnswerProps {
  type: QuestionType
  answer?: Record<string, unknown>
}

/** Read-only rendering of a candidate answer for the given question type. */
export function CandidateAnswer({ type, answer }: AnswerProps) {
  if (!answer || Object.keys(answer).length === 0) {
    return <div className="answer-view answer-empty">考生未作答</div>
  }

  if (type === 'single' || type === 'judge') {
    const value = String(answer.value ?? '')
    return (
      <div className="answer-view">
        <span className="answer-key">作答</span>
        <strong>{type === 'judge' ? (value === 'true' ? '正确' : value === 'false' ? '错误' : value || '—') : value || '—'}</strong>
      </div>
    )
  }

  if (type === 'multiple' || type === 'fill') {
    const values = Array.isArray(answer.values) ? (answer.values as unknown[]) : []
    if (values.length === 0) return <div className="answer-view answer-empty">考生未作答</div>
    return (
      <ol className="answer-list">
        {values.map((value, index) => (
          <li key={index}>
            {type === 'fill' ? `空 ${index + 1}：` : ''}
            {Array.isArray(value) ? value.join('、') : String(value)}
          </li>
        ))}
      </ol>
    )
  }

  if (type === 'programming') {
    const code = typeof answer.code === 'string' ? answer.code : ''
    return (
      <div className="answer-view">
        {typeof answer.language === 'string' && <span className="answer-key">{answer.language}</span>}
        <pre className="answer-code">{code || '（未提交代码）'}</pre>
      </div>
    )
  }

  if (type === 'media') {
    const mediaId = typeof answer.media_id === 'string' ? answer.media_id : ''
    const url = typeof answer.url === 'string' ? answer.url : ''
    const duration = typeof answer.duration_ms === 'number' ? Math.round(answer.duration_ms / 1000) : 0
    if (!mediaId && !url) return <div className="answer-view answer-empty">考生未作答</div>
    return (
      <div className="answer-view">
        {mediaId ? (
          <>
            <audio controls preload="metadata" src={mediaContentUrl(mediaId)} style={{ display: 'block', width: '100%', maxWidth: 480 }} />
            {duration > 0 && <span className="cell-meta">作答时长约 {duration} 秒</span>}
          </>
        ) : (
          <span>{url}</span>
        )}
      </div>
    )
  }

  const text = typeof answer.text === 'string' ? answer.text : ''
  return <div className="answer-view answer-text">{text || '（未作答）'}</div>
}

interface ReferenceProps {
  answer?: Record<string, unknown>
}

/** Reference answer and rubric shown to reviewers. */
export function ReferenceAnswer({ answer }: ReferenceProps) {
  const correct = Array.isArray(answer?.correct) ? (answer.correct as unknown[]) : []
  const blanks = Array.isArray(answer?.answers) ? (answer.answers as unknown[][]) : []
  const rubric = Array.isArray(answer?.rubric) ? (answer.rubric as unknown[]) : []
  const reference = typeof answer?.reference === 'string' ? answer.reference : ''
  if (!correct.length && !blanks.length && !rubric.length && !reference) {
    return <span className="cell-meta">该题无标准答案，按评分要点人工判分</span>
  }
  return (
    <div className="reference-view">
      {correct.length > 0 && (
        <p>
          正确答案：<strong>{correct.map((item) => String(item)).join('、')}</strong>
        </p>
      )}
      {blanks.length > 0 && (
        <p>
          各空答案：
          {blanks.map((values, index) => (
            <span key={index}>
              {index > 0 ? ' / ' : ''}
              {values.map((value) => String(value)).join(' 或 ')}
            </span>
          ))}
        </p>
      )}
      {reference && <p>参考答案：{reference}</p>}
      {rubric.length > 0 && (
        <ul className="rubric-list">
          {rubric.map((item, index) => (
            <li key={index}>{String(item)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
