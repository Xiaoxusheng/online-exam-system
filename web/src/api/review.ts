import { apiListRequest, apiRequest, toQuery } from './client'
import type { ListResult, ReviewQueue, ReviewSubmitResult, ReviewTask, ReviewTaskDetail } from '../types'

export interface ReviewListParams {
  status?: string
  exam_id?: string
  page?: number
  page_size?: number
}

export function listReviewTasks(params: ReviewListParams = {}): Promise<ListResult<ReviewTask>> {
  return apiListRequest<ReviewTask>(`/review-tasks${toQuery(params)}`)
}

export function getReviewTask(id: string): Promise<ReviewTaskDetail> {
  return apiRequest<ReviewTaskDetail>(`/review-tasks/${id}`)
}

export function submitReview(id: string, score: number, comment: string): Promise<ReviewSubmitResult> {
  return apiRequest<ReviewSubmitResult>(`/review-tasks/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify({ score, comment }),
  })
}

/** Position and neighbours of a task inside the queue the reviewer is currently browsing. */
export function getReviewQueue(id: string, params: Omit<ReviewListParams, 'page' | 'page_size'> = {}): Promise<ReviewQueue> {
  return apiRequest<ReviewQueue>(`/review-tasks/${id}/neighbors${toQuery(params)}`)
}
