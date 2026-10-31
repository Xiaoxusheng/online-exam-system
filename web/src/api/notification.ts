import { apiListRequest, apiRequest, toQuery } from './client'
import type { ListResult, Notification } from '../types'

export function listNotifications(page = 1, pageSize = 10): Promise<ListResult<Notification>> {
  return apiListRequest<Notification>(`/notifications${toQuery({ page, page_size: pageSize })}`)
}

export function markNotificationRead(id: string): Promise<void> {
  return apiRequest<void>(`/notifications/${id}/read`, { method: 'PATCH' })
}
