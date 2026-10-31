import { Tag } from 'antd'
import { questionTypeLabel } from '../utils/labels'
import type { QuestionContent, QuestionType } from '../types'

interface ContentProps {
  type: QuestionType
  content: QuestionContent
  maxScore?: number
  section?: string
}

/** Read-only rendering of a question body, shared by review and score detail. */
export function QuestionContent({ type, content, maxScore, section }: ContentProps) {
  const options = Array.isArray(content?.options) ? content.options : []
  const cases = Array.isArray(content?.cases) ? content.cases : []
  return (
    <div className="question-view">
      <div className="question-view-head">
        {section && <Tag className="soft-tag">{section}</Tag>}
        <Tag className="soft-tag">{questionTypeLabel(type)}</Tag>
        {maxScore !== undefined && <span className="cell-meta">本题 {maxScore} 分</span>}
      </div>
      <p className="question-stem">{content?.stem || '（无题干）'}</p>
      {options.length > 0 && (
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
    const url = typeof answer.url === 'string' ? answer.url : ''
    return <div className="answer-view">{url || '（未提交音视频）'}</div>
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
