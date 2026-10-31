import { apiDownload, apiListRequest, apiRequest, toQuery } from './client'
import type {
  ExamAnalytics,
  ExamItemAnalytics,
  KnowledgeAnalytics,
  ListResult,
  ScoreAdjustment,
  ScoreAppeal,
  ScoreListItem,
  ScoreRecordDetail,
} from '../types'

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

export function exportScores(examId: string): Promise<void> {
  return apiDownload(`/scores/export${toQuery({ exam_id: examId })}`, '成绩导出.xlsx')
}

export function getExamAnalytics(examId: string): Promise<ExamAnalytics> {
  return apiRequest<ExamAnalytics>(`/analytics/exams/${examId}`)
}

export function getExamItemAnalytics(examId: string): Promise<ExamItemAnalytics> {
  return apiRequest<ExamItemAnalytics>(`/analytics/exams/${examId}/items`)
}

export function getKnowledgeAnalytics(examId?: string): Promise<KnowledgeAnalytics> {
  return apiRequest<KnowledgeAnalytics>(`/analytics/knowledge-points${toQuery({ exam_id: examId })}`)
}

export interface ScoreOverride {
  question_id: string
  score: number
}

export function adjustScore(attemptId: string, reason: string, items: ScoreOverride[]): Promise<ScoreAdjustment> {
  return apiRequest<ScoreAdjustment>(`/scores/${attemptId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ reason, items }),
  })
}

export function listScoreAdjustments(attemptId: string): Promise<ScoreAdjustment[]> {
  return apiRequest<ScoreAdjustment[]>(`/scores/${attemptId}/adjustments`)
}

export interface AppealListParams {
  status?: string
  page?: number
  page_size?: number
}

export function listAppeals(params: AppealListParams = {}): Promise<ListResult<ScoreAppeal>> {
  return apiListRequest<ScoreAppeal>(`/appeals${toQuery(params)}`)
}

export function handleAppeal(id: string, action: 'accepted' | 'rejected', note: string): Promise<ScoreAppeal> {
  return apiRequest<ScoreAppeal>(`/appeals/${id}/handle`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  })
}
