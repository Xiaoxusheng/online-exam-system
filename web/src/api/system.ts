import { apiListRequest, apiRequest, toQuery } from './client'
import type {
  AuditLog,
  ListResult,
  NotificationLog,
  NotificationTemplate,
  OrgBranding,
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

export interface NotificationChannelStatus {
  email: { configured: boolean }
  sms: { configured: boolean; mode: 'gateway' | 'simulated' | 'none' }
}

export function getNotificationChannels(): Promise<NotificationChannelStatus> {
  return apiRequest<NotificationChannelStatus>('/notification-channels')
}

export interface TestChannelResult {
  status: string
  detail?: string
  recipient: string
}

export function testNotificationChannel(input: {
  channel: 'email' | 'sms'
  code?: string
  recipient?: string
}): Promise<TestChannelResult> {
  return apiRequest<TestChannelResult>('/notification-channels/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Public branding profile — reachable without a session (login page). */
export function getBranding(): Promise<OrgBranding> {
  return apiRequest<OrgBranding>('/branding')
}

export interface BrandingPatch {
  name?: string
  slogan?: string
  logo_media_id?: string
}

export function updateBranding(patch: BrandingPatch): Promise<OrgBranding> {
  return apiRequest<OrgBranding>('/system/branding', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}
