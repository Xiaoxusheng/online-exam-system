import { apiListRequest, apiRequest, toQuery } from './client'
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
