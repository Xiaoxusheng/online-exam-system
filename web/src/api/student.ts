import { apiRequest } from './client'
import type { AttemptState, MyExam, MyScore, SubmitResult } from '../types'

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

export function reportEvent(attemptId: string, input: { type: string; level?: string; snapshot_url?: string }): Promise<unknown> {
  return apiRequest<unknown>(`/attempts/${attemptId}/events`, { method: 'POST', body: JSON.stringify(input) })
}

export function listMyScores(): Promise<MyScore[]> {
  return apiRequest<MyScore[]>('/my/scores')
}
