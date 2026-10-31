import { apiListRequest, apiRequest, toQuery } from './client'
import type {
  AuditLog,
  ListResult,
  NotificationLog,
  NotificationTemplate,
  SystemOverview,
} from '../types'

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

export interface NotificationTemplatePatch {
  title_tpl?: string
  content_tpl?: string
  enabled?: boolean
}

export function updateNotificationTemplate(id: string, patch: NotificationTemplatePatch): Promise<NotificationTemplate> {
  return apiRequest<NotificationTemplate>(`/notification-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export interface NotificationLogParams {
  status?: string
  keyword?: string
  page?: number
  page_size?: number
}

export function listNotificationLogs(params: NotificationLogParams = {}): Promise<ListResult<NotificationLog>> {
  return apiListRequest<NotificationLog>(`/notification-logs${toQuery(params)}`)
}
