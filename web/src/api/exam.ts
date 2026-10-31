import { apiListRequest, apiRequest, toQuery } from './client'
import type { Exam, ExamCandidate, ExamRules, ExamStaff, ListResult } from '../types'

export interface ExamListParams {
  status?: string
  keyword?: string
  page?: number
  page_size?: number
}

export interface CandidateInput {
  user_id: string
  paper_group?: string
}

export interface ExamInput {
  paper_id: string
  title: string
  start_at: string
  end_at: string
  duration_minutes: number
  rules?: ExamRules
  proctor_config?: Record<string, unknown>
  candidates?: CandidateInput[]
  class_ids?: string[]
}

export function listExams(params: ExamListParams = {}): Promise<ListResult<Exam>> {
  return apiListRequest<Exam>(`/exams${toQuery(params)}`)
}

export function getExam(id: string): Promise<Exam> {
  return apiRequest<Exam>(`/exams/${id}`)
}

export function createExam(input: ExamInput): Promise<Exam> {
  return apiRequest<Exam>('/exams', { method: 'POST', body: JSON.stringify(input) })
}

export function publishExam(id: string): Promise<Exam> {
  return apiRequest<Exam>(`/exams/${id}/publish`, { method: 'POST' })
}

export function listCandidates(examId: string, page = 1, pageSize = 50): Promise<ListResult<ExamCandidate>> {
  return apiListRequest<ExamCandidate>(`/exams/${examId}/candidates${toQuery({ page, page_size: pageSize })}`)
}

export function addCandidates(examId: string, input: { candidates?: CandidateInput[]; class_ids?: string[] }): Promise<{ added: number }> {
  return apiRequest<{ added: number }>(`/exams/${examId}/candidates`, { method: 'POST', body: JSON.stringify(input) })
}

export function listProctors(examId: string): Promise<ExamStaff[]> {
  return apiRequest<ExamStaff[]>(`/exams/${examId}/proctors`)
}

export function setProctors(examId: string, userIds: string[]): Promise<ExamStaff[]> {
  return apiRequest<ExamStaff[]>(`/exams/${examId}/proctors`, { method: 'PUT', body: JSON.stringify({ user_ids: userIds }) })
}

export function listReviewers(examId: string): Promise<ExamStaff[]> {
  return apiRequest<ExamStaff[]>(`/exams/${examId}/reviewers`)
}

export function setReviewers(examId: string, userIds: string[]): Promise<ExamStaff[]> {
  return apiRequest<ExamStaff[]>(`/exams/${examId}/reviewers`, { method: 'PUT', body: JSON.stringify({ user_ids: userIds }) })
}
