import { apiRequest } from './client'
import type { LoginResult, User } from '../types'

export function login(account: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  })
}

export function fetchMe(): Promise<User> {
  return apiRequest<User>('/auth/me')
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' })
}
