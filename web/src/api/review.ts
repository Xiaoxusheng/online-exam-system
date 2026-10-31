import { apiListRequest, apiRequest, toQuery } from './client'
import type { ListResult, ReviewSubmitResult, ReviewTask, ReviewTaskDetail } from '../types'

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
