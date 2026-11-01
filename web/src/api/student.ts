import { apiRequest } from './client'
import type { AttemptState, MyExam, MyScore, ScoreAppeal, ScoreRecordDetail, SubmitResult } from '../types'

export function listMyExams(): Promise<MyExam[]> {
  return apiRequest<MyExam[]>('/my/exams')
}

export function startAttempt(examId: string): Promise<AttemptState> {
  return apiRequest<AttemptState>(`/exams/${examId}/attempts`, { method: 'POST' })
}

export function getAttempt(attemptId: string): Promise<AttemptState> {
  return apiRequest<AttemptState>(`/attempts/${attemptId}`)
}

export function saveAnswer(attemptId: string, questionId: string, content: unknown, version: number): Promise<{ version: number }> {
  return apiRequest<{ version: number }>(`/attempts/${attemptId}/answers/${questionId}`, {
    method: 'PUT',
    body: JSON.stringify({ content, version }),
  })
}

export function submitAttempt(attemptId: string): Promise<SubmitResult> {
  return apiRequest<SubmitResult>(`/attempts/${attemptId}/submit`, { method: 'POST' })
}

export function reportEvent(attemptId: string, input: { type: string; level?: string; snapshot_url?: string; note?: string }): Promise<unknown> {
  return apiRequest<unknown>(`/attempts/${attemptId}/events`, { method: 'POST', body: JSON.stringify(input) })
}

export function listMyScores(): Promise<MyScore[]> {
  return apiRequest<MyScore[]>('/my/scores')
}

export function getMyScoreRecord(attemptId: string): Promise<ScoreRecordDetail> {
  return apiRequest<ScoreRecordDetail>(`/my/scores/${attemptId}`)
}

export function createScoreAppeal(attemptId: string, reason: string, questionId?: string): Promise<ScoreAppeal> {
  return apiRequest<ScoreAppeal>(`/my/scores/${attemptId}/appeals`, {
    method: 'POST',
    body: JSON.stringify({ reason, question_id: questionId ?? '' }),
  })
}

export function listMyAppeals(): Promise<ScoreAppeal[]> {
  return apiRequest<ScoreAppeal[]>('/my/appeals')
}
