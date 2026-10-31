import { apiListRequest, apiRequest, toQuery } from './client'
import type { ExamAnalytics, ListResult, ScoreListItem, ScoreRecordDetail } from '../types'

export interface ScoreListParams {
  exam_id?: string
  status?: string
  keyword?: string
  page?: number
  page_size?: number
}

export function listScores(params: ScoreListParams = {}): Promise<ListResult<ScoreListItem>> {
  return apiListRequest<ScoreListItem>(`/scores${toQuery(params)}`)
}

export function getScoreRecord(attemptId: string): Promise<ScoreRecordDetail> {
  return apiRequest<ScoreRecordDetail>(`/scores/${attemptId}`)
}

export function publishScores(examId: string): Promise<{ published: number }> {
  return apiRequest<{ published: number }>('/scores/publish', {
    method: 'POST',
    body: JSON.stringify({ exam_id: examId }),
  })
}

export function getExamAnalytics(examId: string): Promise<ExamAnalytics> {
  return apiRequest<ExamAnalytics>(`/analytics/exams/${examId}`)
}
