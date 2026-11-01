import { apiListRequest, apiRequest, apiSocketUrl, toQuery } from './client'
import type { ListResult, ProctorEvent, ProctorOverview, ProctorRoom } from '../types'

export interface ProctorEventParams {
  level?: string
  handled?: string
  page?: number
  page_size?: number
}

export function listProctorRooms(): Promise<ProctorRoom[]> {
  return apiRequest<ProctorRoom[]>('/proctor/exams')
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

export interface ProctorTimelineItem {
  id: number
  type: string
  level: string
  note: string
  snapshot_url: string
  occurred_at: string
  handled_by_name: string
  action: string
}

export interface ProctorReportRow {
  user_id: string
  user_name: string
  username: string
  attempt_state: string
  event_count: number
  warning_count: number
  critical_count: number
  screen_switches: number
  snapshots: number
  handled_count: number
  score_status: string
  events: ProctorTimelineItem[]
}

/** M-10 post-exam monitoring report: per-candidate event trail. */
export function getProctorReport(examId: string): Promise<ProctorReportRow[]> {
  return apiRequest<ProctorReportRow[]>(`/proctor/exams/${examId}/report`)
}
