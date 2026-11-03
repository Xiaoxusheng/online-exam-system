import { apiListRequest, apiRequest, toQuery } from './client'
import type { ListResult, Paper, PaperDetail, RandomSection } from '../types'

export interface PaperListParams {
  status?: string
  type?: string
  keyword?: string
  page?: number
  page_size?: number
}

export interface PaperQuestionInput {
  question_id: string
  section?: string
  paper_group?: string
  score: number
}

export interface PaperInput {
  type: Paper['type']
  title: string
  rules?: { sections?: RandomSection[] }
  questions?: PaperQuestionInput[]
}

export function listPapers(params: PaperListParams = {}): Promise<ListResult<Paper>> {
  return apiListRequest<Paper>(`/papers${toQuery(params)}`)
}

export function getPaper(id: string): Promise<PaperDetail> {
  return apiRequest<PaperDetail>(`/papers/${id}`)
}

export function createPaper(input: PaperInput): Promise<Paper> {
  return apiRequest<Paper>('/papers', { method: 'POST', body: JSON.stringify(input) })
}

export function updatePaper(id: string, input: PaperInput): Promise<Paper> {
  return apiRequest<Paper>(`/papers/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function submitPaperReview(id: string): Promise<Paper> {
  return apiRequest<Paper>(`/papers/${id}/submit-review`, { method: 'POST' })
}

export function approvePaper(id: string): Promise<Paper> {
  return apiRequest<Paper>(`/papers/${id}/approve`, { method: 'POST' })
}

export function rejectPaper(id: string, reason: string): Promise<Paper> {
  return apiRequest<Paper>(`/papers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function copyPaper(id: string): Promise<Paper> {
  return apiRequest<Paper>(`/papers/${id}/copy`, { method: 'POST' })
}
