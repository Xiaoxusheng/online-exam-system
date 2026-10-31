import { apiListRequest, apiRequest, apiSocketUrl, toQuery } from './client'
import type { ListResult, ProctorEvent, ProctorOverview } from '../types'

export interface ProctorEventParams {
  level?: string
  handled?: string
  page?: number
  page_size?: number
}

export function getProctorOverview(examId: string): Promise<ProctorOverview> {
  return apiRequest<ProctorOverview>(`/proctor/exams/${examId}/overview`)
}

export function listProctorEvents(examId: string, params: ProctorEventParams = {}): Promise<ListResult<ProctorEvent>> {
  return apiListRequest<ProctorEvent>(`/proctor/exams/${examId}/events${toQuery(params)}`)
}

export function handleProctorEvent(
  eventId: number,
  input: { action: string; note?: string },
): Promise<ProctorEvent> {
  return apiRequest<ProctorEvent>(`/proctor/events/${eventId}/handle`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * The proctor room authenticates through the query token because browsers cannot
 * attach an Authorization header to a WebSocket handshake.
 */
export function proctorSocketUrl(examId: string, token: string): string {
  return apiSocketUrl(`/proctor/exams/${examId}/ws?token=${encodeURIComponent(token)}`)
}
