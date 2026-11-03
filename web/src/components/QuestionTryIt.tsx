import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Divider, Input, Radio } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, ReloadOutlined } from '@ant-design/icons'
import { QuestionContent as QuestionContentView, ReferenceAnswer } from './QuestionView'
import type { QuestionContent, QuestionType } from '../types'

interface QuestionTryItProps {
  type: QuestionType
  content: QuestionContent
  answer?: Record<string, unknown>
  score: number
  /** 外层已呈现题型与分值（试卷预览卡片头）时，正文不再重复题头。 */
  hideHead?: boolean
}

type Draft = { value?: string; values?: string[]; texts?: string[]; text?: string }
type OptionItem = { key: string; text: string }

const judgeOptions: OptionItem[] = [
  { key: 'true', text: '正确' },
  { key: 'false', text: '错误' },
]

const isBlank = (value: string) => value.trim().replace(/\s+/g, '')

/** 判断题的选项键是 true/false，卷面按 A/B 呈现更符合阅读习惯。 */
function optionBadge(option: OptionItem, type: QuestionType, position: number) {
  return type === 'judge' ? String.fromCharCode(65 + position) : option.key
}

/** 客观题本地判分：single/judge 比对 correct[0]，multiple 比对集合，fill 按空比对多解。 */
function grade(type: QuestionType, draft: Draft, answer?: Record<string, unknown>): boolean | null {
  if (!answer) return null
  const correct = Array.isArray(answer.correct) ? answer.correct.map((item) => String(item)) : []
  if (type === 'single' || type === 'judge') {
    if (!draft.value) return null
    return draft.value === correct[0]
  }
  if (type === 'multiple') {
    const picked = draft.values ?? []
    if (picked.length === 0) return null
    return picked.length === correct.length && picked.every((item) => correct.includes(item))
  }
  if (type === 'fill') {
    const blanks = Array.isArray(answer.answers) ? (answer.answers as unknown[][]) : []
    const texts = draft.texts ?? []
    if (blanks.length === 0 || texts.length < blanks.length) return null
    return blanks.every((accepted, index) => {
      const given = isBlank(texts[index] ?? '')
      return (accepted as unknown[]).map((item) => isBlank(String(item))).includes(given)
    })
  }
  return null
}

/**
 * 试做 / 预览的作答交互（P-05 试卷试做、B-06 题目试答共用）。
 * 纯前端判分，不落库、不影响成绩；提交后展示对错与参考答案。
 */
export function QuestionTryIt({ type, content, answer, score, hideHead }: QuestionTryItProps) {
  const interactive = ['single', 'judge', 'multiple', 'fill'].includes(type)
  const [draft, setDraft] = useState<Draft>({})
  const [submitted, setSubmitted] = useState(false)

  const result = useMemo(() => (submitted ? grade(type, draft, answer) : null), [submitted, type, draft, answer])
  const autoGradable = ['single', 'judge', 'multiple', 'fill'].includes(type) && Boolean(answer)
  const options: OptionItem[] = type === 'judge' ? judgeOptions : ((content.options ?? []) as OptionItem[])

  function reset() {
    setDraft({})
    setSubmitted(false)
  }

  return (
    <div className="question-tryit">
      <QuestionContentView type={type} content={content} maxScore={score} hideOptions={interactive} hideHead={hideHead} />

      {interactive && !submitted && (
        <div className="question-tryit-form">
          {(type === 'single' || type === 'judge') && (
            <Radio.Group
              className="option-rows"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
            >
              {options.map((option, position) => (
                <Radio key={option.key} value={option.key} className="option-row">
                  <span className="option-key">{optionBadge(option, type, position)}</span>
                  <span className="option-text">{option.text}</span>
                </Radio>
              ))}
            </Radio.Group>
          )}
          {type === 'multiple' && (
            <Checkbox.Group
              className="option-rows"
              value={draft.values ?? []}
              onChange={(values) => setDraft({ ...draft, values: values as string[] })}
            >
              {options.map((option, position) => (
                <Checkbox key={option.key} value={option.key} className="option-row">
                  <span className="option-key">{optionBadge(option, type, position)}</span>
                  <span className="option-text">{option.text}</span>
                </Checkbox>
              ))}
            </Checkbox.Group>
          )}
          {type === 'fill' && (
            <div className="fill-rows">
              {(draft.texts ?? []).map((value, blankIndex) => (
                <Input
                  key={blankIndex}
                  className="fill-input"
                  addonBefore={`空 ${blankIndex + 1}`}
                  placeholder="请输入答案"
                  value={value}
                  onChange={(event) => {
                    const texts = [...(draft.texts ?? [])]
                    texts[blankIndex] = event.target.value
                    setDraft({ ...draft, texts })
                  }}
                />
              ))}
              <Button size="small" type="dashed" onClick={() => setDraft({ ...draft, texts: [...(draft.texts ?? []), ''] })}>
                增加一个空
              </Button>
            </div>
          )}
          {((type === 'single' || type === 'multiple' || type === 'judge') || (type === 'fill' && (draft.texts ?? []).length > 0)) && (
            <Button className="tryit-submit" type="primary" size="small" onClick={() => setSubmitted(true)}>
              提交本题
            </Button>
          )}
        </div>
      )}

      {interactive && submitted && (
        <div className="question-tryit-result">
          {result === true && (
            <Alert type="success" showIcon icon={<CheckCircleFilled />} message={`回答正确 · 得 ${score} 分`} />
          )}
          {result === false && (
            <Alert type="error" showIcon icon={<CloseCircleFilled />} message="回答错误 · 该题不得分" />
          )}
          {result === null && (
            <Alert type="warning" showIcon message="尚未作答，无法判分" />
          )}
          <Divider className="tryit-divider" orientation="left" plain>
            参考答案与解析
          </Divider>
          <div className="question-tryit-answer">
            <ReferenceAnswer answer={answer} />
          </div>
          <Button size="small" icon={<ReloadOutlined />} onClick={reset}>
            重新试做
          </Button>
        </div>
      )}

      {(!interactive || !autoGradable) && (
        <>
          <Divider className="tryit-divider" orientation="left" plain>
            {interactive ? '参考答案与解析' : '参考答案与评分要点'}
          </Divider>
          <div className="question-tryit-answer">
            <span className="cell-meta">
              {interactive ? '该题由阅卷教师人工评分，作答后可对照参考答案自查' : '主观题请对照评分要点给分'}
            </span>
            <ReferenceAnswer answer={answer} />
          </div>
        </>
      )}
    </div>
  )
}
