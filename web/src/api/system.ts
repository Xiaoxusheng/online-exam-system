import { apiListRequest, apiRequest, toQuery } from './client'
import type { AuditLog, ListResult, NotificationTemplate, SystemOverview } from '../types'

export interface AuditLogParams {
  action?: string
  target_type?: string
  keyword?: string
  from?: string
  to?: string
  page?: number
  page_size?: number
}

export function listAuditLogs(params: AuditLogParams = {}): Promise<ListResult<AuditLog>> {
  return apiListRequest<AuditLog>(`/audit-logs${toQuery(params)}`)
}

export function getSystemOverview(): Promise<SystemOverview> {
  return apiRequest<SystemOverview>('/system/overview')
}

export function listNotificationTemplates(): Promise<NotificationTemplate[]> {
  return apiRequest<NotificationTemplate[]>('/notification-templates')
}
