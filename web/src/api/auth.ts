import { apiRequest } from './client'
import type { LoginResult, User } from '../types'

export function login(account: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  })
}

export interface SmsCodeResult {
  expires_in: number
  dev_code?: string
}

/** C-01: request a phone login code. Dev mode without an SMS gateway echoes it. */
export function sendSmsCode(phone: string): Promise<SmsCodeResult> {
  return apiRequest<SmsCodeResult>('/auth/sms-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export function loginBySmsCode(phone: string, code: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login-sms', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  })
}

export function fetchMe(): Promise<User> {
  return apiRequest<User>('/auth/me')
}

export function logout(refreshToken?: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
  })
}
