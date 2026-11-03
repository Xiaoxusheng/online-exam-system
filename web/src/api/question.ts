import { apiDownload, apiListRequest, apiRequest, apiUpload, toQuery } from './client'
import type { ListResult, Question, QuestionBank } from '../types'

export interface QuestionListParams {
  bank_id?: string
  type?: string
  difficulty?: string
  status?: string
  keyword?: string
  page?: number
  page_size?: number
}

export interface QuestionInput {
  bank_id: string
  type: string
  knowledge_point?: string
  difficulty?: string
  content: unknown
  answer?: unknown
  score_rule?: unknown
  default_score: number
}

export type QuestionPatch = Partial<Omit<QuestionInput, 'bank_id'>>

export function listBanks(): Promise<QuestionBank[]> {
  return apiRequest<QuestionBank[]>('/question-banks')
}

export function createBank(input: { name: string; scope?: string }): Promise<QuestionBank> {
  return apiRequest<QuestionBank>('/question-banks', { method: 'POST', body: JSON.stringify(input) })
}

export function listQuestions(params: QuestionListParams = {}): Promise<ListResult<Question>> {
  return apiListRequest<Question>(`/questions${toQuery(params)}`)
}

export function getQuestion(id: string): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}`)
}

export function createQuestion(input: QuestionInput): Promise<Question> {
  return apiRequest<Question>('/questions', { method: 'POST', body: JSON.stringify(input) })
}

export function updateQuestion(id: string, input: QuestionPatch): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function publishQuestion(id: string): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}/publish`, { method: 'POST' })
}

export function rejectQuestion(id: string, reason: string): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function archiveQuestion(id: string): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}`, { method: 'DELETE' })
}

export interface ImportReportRow {
  line: number
  stem: string
  status: string
  message: string
}

export interface ImportResult {
  bank_id: string
  bank_name: string
  total: number
  created: number
  published: number
  skipped: number
  failed: number
  report: ImportReportRow[]
}

export function downloadQuestionTemplate(): Promise<void> {
  return apiDownload('/questions/import-template', '题目导入模板.xlsx')
}

export function exportQuestions(params: Omit<QuestionListParams, 'page' | 'page_size'> = {}): Promise<void> {
  return apiDownload(`/questions/export${toQuery(params)}`, '题目导出.xlsx')
}

export function importQuestions(bankId: string, file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('bank_id', bankId)
  form.append('file', file, file.name)
  return apiUpload<ImportResult>('/questions/import', form)
}
